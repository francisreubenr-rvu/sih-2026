// F17 target identity and execute-time checks for extension/content.js, in real Chromium.
// See helpers/content-harness.mjs for what this harness does and does not exercise.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { startHarness } from './helpers/content-harness.mjs';

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h?.close(); });

const DELETE_FORM_HIDDEN = '<form action="/account/delete" method="post"><button id="next" style="display:none">Delete account</button></form>';

function deletePosts(since) {
  return h.posts.slice(since).filter((p) => p.path === '/account/delete').length;
}

async function settle(p) {
  await p.page.waitForTimeout(400);
}

function byLabel(scan, label) {
  const found = scan.elements.filter((el) => el.label === label);
  assert.equal(found.length, 1, `expected exactly one scanned element labelled ${label}`);
  return found[0];
}

test('duplicate id, hidden destructive first: the visible link is the only target and is what gets clicked', async () => {
  const since = h.posts.length;
  const p = await h.open(`${DELETE_FORM_HIDDEN}<a id="next" href="/p2">Next page</a>`);
  const scan = await p.scan();
  assert.equal(scan.elements.length, 1, 'the hidden destructive button is not in the scene');
  const link = scan.elements[0];
  assert.equal(link.tier, 'navigational');
  assert.notEqual(link.selector, '#next', 'a non-unique id is not used as the display key');
  assert.match(link.handle, /^h[0-9a-f]{32}$/);
  const result = await p.execute({ action: 'click', handle: link.handle, plannedTier: link.tier });
  assert.equal(result.navigated, true);
  await settle(p);
  assert.equal(deletePosts(since), 0);
  assert.match(p.page.url(), /\/p2$/);
  await p.close();
});

test('duplicate name: the display key is unique and execute resolves the scanned element only', async () => {
  const since = h.posts.length;
  const p = await h.open(`<form action="/account/delete" method="post"><button name="go" style="display:none">Delete</button></form>
    <form action="/p2" method="get"><button name="go">Next</button></form>`);
  const scan = await p.scan();
  assert.equal(scan.elements.length, 1);
  const el = scan.elements[0];
  assert.notEqual(el.selector, 'button[name="go"]');
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
  assert.equal(result.navigated, true);
  await settle(p);
  assert.equal(deletePosts(since), 0);
  assert.match(p.page.url(), /\/p2\?/);
  await p.close();
});

test('post-scan hidden duplicate insert (TOCTOU) does not redirect the click', async () => {
  const since = h.posts.length;
  const p = await h.open('<div id="slot"></div><a id="next" href="/p2">Next page</a>');
  const scan = await p.scan();
  const link = byLabel(scan, 'Next page');
  await p.page.evaluate((html) => { document.getElementById('slot').innerHTML = html; }, DELETE_FORM_HIDDEN);
  const result = await p.execute({ action: 'click', handle: link.handle, plannedTier: link.tier });
  assert.equal(result.navigated, true);
  await settle(p);
  assert.equal(deletePosts(since), 0);
  assert.match(p.page.url(), /\/p2$/);
  await p.close();
});

const REFUSALS = [
  ['target hidden after scan', (el) => { el.style.display = 'none'; }, /not visible/],
  ['target detached after scan', (el) => { el.remove(); }, /no longer in the page/],
  ['target replaced after scan', (el) => { el.outerHTML = el.outerHTML; }, /no longer in the page/],
  ['opacity:0 ancestor after scan', (el) => { el.parentElement.style.opacity = '0'; }, /not visible/],
  ['visibility:hidden after scan', (el) => { el.style.visibility = 'hidden'; }, /not visible/],
  ['moved offscreen after scan', (el) => { el.style.cssText = 'position:absolute;left:-9999px;top:0'; }, /outside the viewport/],
  ['covered by an overlay', (el) => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:10';
    el.ownerDocument.body.append(cover);
  }, /covers the target/],
  ['pointer-events:none on the target', (el) => { el.style.pointerEvents = 'none'; }, /pointer input/],
  ['pointer-events:none on an ancestor', (el) => { el.parentElement.style.pointerEvents = 'none'; }, /pointer input/],
  ['inert ancestor', (el) => { el.parentElement.inert = true; }, /inert/],
];

for (const [name, mutate, reason] of REFUSALS) {
  test(`refuses to click: ${name}`, async () => {
    const since = h.posts.length;
    const p = await h.open('<div id="wrap"><form action="/submit" method="post"><button id="b">Save</button></form></div>');
    const scan = await p.scan();
    const el = byLabel(scan, 'Save');
    await p.page.evaluate(`(${mutate.toString()})(document.getElementById('b'))`);
    const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
    assert.match(result.error || '', /^Refused: /);
    assert.match(result.error, reason);
    await settle(p);
    assert.equal(h.posts.slice(since).length, 0, 'nothing was submitted');
    await p.close();
  });
}

test('opacity:0 ancestor and offscreen controls at scan time: hidden is excluded, offscreen is refused', async () => {
  const p = await h.open(`<div style="opacity:0"><button id="ghost">Delete account</button></div>
    <button id="far" style="position:absolute;left:-9999px">Next</button>`);
  const scan = await p.scan();
  assert.deepEqual(scan.elements.map((el) => el.label), ['Next']);
  const result = await p.execute({ action: 'click', handle: scan.elements[0].handle, plannedTier: 'navigational' });
  assert.match(result.error, /outside the viewport/);
  await p.close();
});

const SPOOFS = [
  ['aria-label says Next, visible text says delete', '<button aria-label="Next">Delete my account</button>'],
  ['visible text says Next, aria-label says delete', '<button aria-label="Delete account">Next</button>'],
  ['form action=/account/delete labelled Next', '<button>Next</button>'],
  ['formaction=/account/delete labelled Next', '<button formaction="/account/delete">Next</button>'],
  ['title says delete', '<button type="button" title="Delete account">Next</button>'],
  ['aria-labelledby names delete', '<span id="l">Delete account</span><button type="button" aria-labelledby="l">Next</button>'],
];

for (const [name, button] of SPOOFS) {
  test(`label spoof tiers destructive and is not clicked under a weaker plan: ${name}`, async () => {
    const since = h.posts.length;
    const p = await h.open(`<form action="/account/delete" method="post">${button}</form>`);
    const scan = await p.scan();
    const target = scan.elements.find((el) => el.tag === 'button');
    assert.equal(target.tier, 'destructive');
    const result = await p.execute({ action: 'click', handle: target.handle, plannedTier: 'navigational' });
    assert.deepEqual(result, { tierEscalated: true, liveTier: 'destructive', plannedTier: 'navigational' });
    await settle(p);
    assert.equal(deletePosts(since), 0);
    await p.close();
  });
}

test('form action cannot be hidden by a control named "action" (DOM clobbering)', async () => {
  const p = await h.open('<form action="/account/delete" method="post"><input name="action" value="x"><button>Next</button></form>');
  const scan = await p.scan();
  assert.equal(scan.elements.find((el) => el.tag === 'button').tier, 'destructive');
  await p.close();
});

test('a live tier change after scan escalates instead of clicking', async () => {
  const since = h.posts.length;
  const p = await h.open('<form id="f" action="/p2" method="get"><button id="b">Next page</button></form>');
  const scan = await p.scan();
  const el = byLabel(scan, 'Next page');
  await p.page.evaluate(() => {
    const f = document.getElementById('f');
    f.setAttribute('action', '/account/delete');
    f.setAttribute('method', 'post');
  });
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
  assert.equal(result.tierEscalated, true);
  assert.equal(result.liveTier, 'destructive');
  await settle(p);
  assert.equal(deletePosts(since), 0);
  await p.close();
});

test('a pointerdown listener that rewires the form has no effect: no synthetic pointer events are sent', async () => {
  const since = h.posts.length;
  const p = await h.open(`<form id="f" action="/p2" method="get"><button id="b">Next page</button></form>
    <script>
      window.pointerEvents = 0;
      for (const type of ['pointerover', 'pointerenter', 'pointerdown', 'pointerup']) {
        document.getElementById('b').addEventListener(type, () => {
          window.pointerEvents += 1;
          const f = document.getElementById('f');
          f.setAttribute('action', '/account/delete');
          f.setAttribute('method', 'post');
        });
      }
    </script>`);
  const scan = await p.scan();
  const el = byLabel(scan, 'Next page');
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
  assert.equal(result.navigated, true);
  await settle(p);
  assert.equal(deletePosts(since), 0);
  assert.match(p.page.url(), /\/p2\?/);
  await p.close();
});

test('a handle from a previous scan is rejected', async () => {
  const p = await h.open('<a href="/p2">Next page</a>');
  const first = await p.scan();
  const second = await p.scan();
  assert.notEqual(first.elements[0].handle, second.elements[0].handle);
  const result = await p.execute({ action: 'click', handle: first.elements[0].handle, plannedTier: 'navigational' });
  assert.match(result.error, /not from the current page scan/);
  await p.close();
});

test('a selector alone executes nothing: execute has no selector path', async () => {
  const p = await h.open('<a id="n" href="/p2">Next page</a>');
  await p.scan();
  const result = await p.execute({ action: 'click', target_selector: '#n', plannedTier: 'navigational' });
  assert.match(result.error, /not from the current page scan/);
  await p.close();
});

test('an unknown planned tier escalates rather than clicking', async () => {
  const p = await h.open('<a href="/p2">Next page</a>');
  const scan = await p.scan();
  const result = await p.execute({ action: 'click', handle: scan.elements[0].handle, plannedTier: 'bogus' });
  assert.equal(result.tierEscalated, true);
  await p.close();
});

test('type resolves the handle and fills the scanned field', async () => {
  const p = await h.open('<input id="q" placeholder="Search">');
  const scan = await p.scan();
  const field = byLabel(scan, 'Search');
  const result = await p.execute({ action: 'type', handle: field.handle, value: 'orbits', plannedTier: 'state-changing' });
  assert.equal(result.error, undefined);
  assert.equal(await p.page.inputValue('#q'), 'orbits');
  await p.close();
});

test('scan output never writes the handle into the DOM', async () => {
  const p = await h.open('<a href="/p2">Next page</a><button>Save</button>');
  const scan = await p.scan();
  const html = await p.page.content();
  for (const el of scan.elements) assert.equal(html.includes(el.handle), false);
  await p.close();
});

// ---- Redaction overlay (HIGHLIGHT_REDACTIONS) --------------------------------------------------
// The overlay lives in a CLOSED shadow root, which page script cannot open; these tests read it
// through the DevTools protocol (DOM.getDocument with pierce: true), which can.

const VALUE = 'francis@example.com';
const TOKENS = { 'EMAIL#1': VALUE };

async function overlayTree(p) {
  const cdp = await p.page.context().newCDPSession(p.page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const attrs = (n) => {
      const out = {};
      for (let i = 0; i < (n.attributes || []).length; i += 2) out[n.attributes[i]] = n.attributes[i + 1];
      return out;
    };
    let host = null;
    const find = (n) => {
      if (host) return;
      if (n.nodeType === 1 && 'data-dhristi-redactions' in attrs(n)) { host = n; return; }
      for (const c of [...(n.children || []), ...(n.shadowRoots || []), ...(n.contentDocument ? [n.contentDocument] : [])]) find(c);
    };
    find(root);
    if (!host) { await cdp.detach(); return null; }
    const boxes = [];
    const texts = [];
    const walk = (n) => {
      if (n.nodeType === 3) texts.push(n.nodeValue);
      const a = attrs(n);
      if (n.nodeType === 1 && /\bbox\b/.test(a.class || '')) {
        const chip = (n.children || []).find((c) => /\bchip\b/.test(attrs(c).class || ''));
        const style = Object.fromEntries((a.style || '').split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d[0]));
        boxes.push({ nodeId: n.nodeId, className: a.class, label: chip?.children?.[0]?.nodeValue ?? null, top: parseFloat(style.top), left: parseFloat(style.left), width: parseFloat(style.width), height: parseFloat(style.height) });
      }
      for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
    };
    walk(host);
    // The session stays open (and the node ids valid) until the caller detaches it.
    return { host, boxes, texts, cdp };
  } catch (error) {
    await cdp.detach();
    throw error;
  }
}

const OVERLAY_PAGE = `<p id="t">Contact ${VALUE} today</p>
  <input id="i" value="${VALUE}">
  <button type="button" id="b" onclick="window.clicked = (window.clicked || 0) + 1">Mail ${VALUE}</button>
  <p style="display:none">hidden ${VALUE}</p>`;

test('overlay: boxes every visible occurrence, labelled with the token only, never the value', async () => {
  const p = await h.open(OVERLAY_PAGE);
  const reply = await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  assert.deepEqual(reply, { ok: true, boxes: 3 }, 'paragraph, button text and input value; not the hidden one');
  assert.equal(JSON.stringify(reply).includes(VALUE), false);
  const tree = await overlayTree(p);
  assert.ok(tree, 'overlay host exists');
  assert.equal(tree.boxes.length, 3);
  for (const box of tree.boxes) assert.equal(box.label, 'EMAIL#1');
  assert.equal(tree.texts.some((t) => t.includes(VALUE)), false, 'the value is nowhere in the overlay');
  assert.equal(JSON.stringify(tree.host).includes(VALUE), false);
  // The first box sits over the value in the paragraph (2px outset for the border).
  const rect = await p.page.evaluate((value) => {
    const node = document.getElementById('t').firstChild;
    const at = node.nodeValue.indexOf(value);
    const r = document.createRange();
    r.setStart(node, at);
    r.setEnd(node, at + value.length);
    const b = r.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width };
  }, VALUE);
  const first = tree.boxes[0];
  assert.ok(Math.abs(first.left - (rect.left - 2)) < 1.5 && Math.abs(first.top - (rect.top - 2)) < 1.5, JSON.stringify({ first, rect }));
  assert.ok(Math.abs(first.width - (rect.width + 4)) < 1.5);
  // Host styles the page cannot override, and the page cannot see into the shadow root.
  const host = await p.page.evaluate(() => {
    const el = document.querySelector('[data-dhristi-redactions]');
    const cs = getComputedStyle(el);
    return { pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, shadow: el.shadowRoot, light: el.innerHTML };
  });
  assert.deepEqual(host, { pe: 'none', z: '2147483647', pos: 'fixed', shadow: null, light: '' });
  await tree.cdp.detach();
  await p.close();
});

test('overlay: page CSS cannot hide or restyle the host', async () => {
  const p = await h.open(`<style>div { display: none !important; opacity: 0 !important; pointer-events: auto !important; }
    [data-dhristi-redactions] { position: static !important; z-index: 1 !important; }</style><p>${VALUE}</p>`);
  await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  const cs = await p.page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('[data-dhristi-redactions]'));
    return [s.display, s.opacity, s.pointerEvents, s.position, s.zIndex];
  });
  assert.deepEqual(cs, ['block', '1', 'none', 'fixed', '2147483647']);
  await p.close();
});

test('overlay: elementFromPoint ignores it, so a boxed target is still clickable', async () => {
  const p = await h.open(OVERLAY_PAGE);
  const scan = await p.scan();
  const button = scan.elements.find((el) => el.tag === 'button');
  const boxes = await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  assert.equal(boxes.boxes, 3);
  const hit = await p.page.evaluate(() => {
    const b = document.getElementById('b').getBoundingClientRect();
    const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return at && at.id;
  });
  assert.equal(hit, 'b', 'the overlay is not hit-tested');
  const result = await p.execute({ action: 'click', handle: button.handle, plannedTier: button.tier });
  assert.equal(result.error, undefined, result.error);
  assert.equal(await p.page.evaluate(() => window.clicked), 1);
  await p.close();
});

test('overlay: the next PAGE_SCAN removes it and never picks it up', async () => {
  const p = await h.open(OVERLAY_PAGE);
  const before = await p.scan();
  await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  assert.equal(await p.page.evaluate(() => Boolean(document.querySelector('[data-dhristi-redactions]'))), true);
  const after = await p.scan();
  assert.equal(await p.page.evaluate(() => Boolean(document.querySelector('[data-dhristi-redactions]'))), false);
  assert.deepEqual(after.elements.map((el) => el.selector), before.elements.map((el) => el.selector));
  assert.deepEqual(after.piiFields.map((f) => f.kind), before.piiFields.map((f) => f.kind));
  assert.equal(after.dom.includes('EMAIL#1'), false);
  await p.close();
});

test('overlay: CLEAR_HIGHLIGHTS and END_TASK remove it; END_TASK also retires the scan handles', async () => {
  const p = await h.open(OVERLAY_PAGE);
  await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  await p.send({ type: 'CLEAR_HIGHLIGHTS' });
  assert.equal(await p.page.evaluate(() => document.querySelectorAll('[data-dhristi-redactions]').length), 0);
  const scan = await p.scan();
  await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  await p.send({ type: 'END_TASK' });
  assert.equal(await p.page.evaluate(() => document.querySelectorAll('[data-dhristi-redactions]').length), 0);
  const button = scan.elements.find((el) => el.tag === 'button');
  const result = await p.execute({ action: 'click', handle: button.handle, plannedTier: button.tier });
  assert.match(result.error, /not from the current page scan/);
  assert.equal(await p.page.evaluate(() => window.clicked), undefined);
  await p.close();
});

test('overlay: redraws on scroll, following the text', async () => {
  const p = await h.open(`<div style="height:300px"></div><p>${VALUE}</p><div style="height:2000px"></div>`);
  await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  const initial = await overlayTree(p);
  const first = initial.boxes[0];
  await initial.cdp.detach();
  await p.page.evaluate(() => window.scrollBy(0, 100));
  await p.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tree = await overlayTree(p);
  const moved = tree.boxes[0];
  assert.ok(Math.abs((first.top - moved.top) - 100) < 1.5, JSON.stringify({ first, moved }));
  assert.match(moved.className, /^box(?! enter)/, 'a redraw does not replay the entry animation');
  await tree.cdp.detach();
  await p.close();
});

async function firstBoxAnimation(p) {
  const tree = await overlayTree(p);
  try {
    await tree.cdp.send('CSS.enable');
    const style = await tree.cdp.send('CSS.getComputedStyleForNode', { nodeId: tree.boxes[0].nodeId });
    return style.computedStyle.find((s) => s.name === 'animation-name')?.value;
  } finally {
    await tree.cdp.detach();
  }
}

test('overlay: the entry animation runs only without prefers-reduced-motion', async () => {
  const motion = await h.open(`<p>${VALUE}</p>`);
  await motion.page.emulateMedia({ reducedMotion: 'no-preference' });
  await motion.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  assert.equal(await firstBoxAnimation(motion), 'dhristi-in');
  await motion.close();

  const reduced = await h.open(`<p>${VALUE}</p>`);
  await reduced.page.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: TOKENS });
  assert.equal(await firstBoxAnimation(reduced), 'none');
  await reduced.close();
});

test('overlay: ignores malformed tokens and one-character values', async () => {
  const p = await h.open('<p>a b c toJSON</p>');
  const reply = await p.send({ type: 'HIGHLIGHT_REDACTIONS', tokens: { 'X#1': 'a', toJSON: 'toJSON', 'lower#1': 'b c' } });
  assert.deepEqual(reply, { ok: true, boxes: 0 });
  assert.equal(await p.page.evaluate(() => document.querySelectorAll('[data-dhristi-redactions]').length), 0);
  await p.close();
});

test('type into a target with no value setter is refused, not reported as done', async () => {
  const p = await h.open('<div id="ed" contenteditable="true" role="button" aria-label="Notes">x</div>');
  const scan = await p.scan();
  const field = scan.elements.find((el) => el.label === 'Notes');
  const result = await p.execute({ action: 'type', handle: field.handle, value: 'orbits', plannedTier: 'state-changing' });
  assert.match(result.error || '', /does not take a typed value/);
  assert.equal(await p.page.evaluate(() => document.getElementById('ed').textContent), 'x');
  await p.close();
});

test('scan: element keys are opaque per scan, so no page-authored id, name or type text reaches the planner', async () => {
  // Security review, 3 October 2026: an id such as "contact-neha-joshi" is a name no PII layer reads,
  // and the selector went to the planner verbatim. Keys are now e1..eN; execute resolves handles.
  const p = await h.open(`<!doctype html><body>
    <button id="priya.r@example.com" type="button">Profile</button>
    <input name="a1234567" type="text">
    <a id="contact-neha-joshi" href="#c">Message</a>
    <input type="neha-joshi-custom" aria-label="Odd field">
    <button id="save" type="button">Save</button></body>`);
  const scan = await p.scan();
  const selectors = scan.elements.map((el) => el.selector);
  assert.deepEqual(selectors, scan.elements.map((_, i) => `e${i + 1}`), selectors.join(' | '));
  assert.equal(JSON.stringify(scan.elements.map(({ selector, type }) => [selector, type])).match(/priya|a1234567|neha|save/), null);
  assert.equal(scan.elements.find((el) => el.label === 'Odd field').type, 'input', 'an unknown type attribute falls back to the tag');
  assert.match(scan.dom, /selector=e1 /);
  await p.close();
});

test('Laya release: a released link relabelled into a rule after scan escalates instead of clicking', async () => {
  const p = await h.open('<a id="st" href="#statements">Statements</a>');
  const scan = await p.scan();
  const el = byLabel(scan, 'Statements');
  assert.equal(el.tier, 'state-changing');
  assert.equal(el.tierBasis, 'unproven');
  await p.page.evaluate(() => { document.getElementById('st').textContent = 'Pay now'; });
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier, requireUnprovenBasis: true });
  assert.equal(result.tierEscalated, true);
  assert.equal(result.releaseRevoked, true);
  assert.equal(result.liveTier, 'state-changing');
  assert.equal(await p.page.evaluate(() => location.hash), '', 'nothing was clicked');
  await p.close();
});

test('Laya release: an unchanged released link is clicked', async () => {
  const p = await h.open('<a id="st" href="#statements">Statements</a>');
  const scan = await p.scan();
  const el = byLabel(scan, 'Statements');
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier, requireUnprovenBasis: true });
  assert.notEqual(result?.tierEscalated, true);
  assert.equal(await p.page.evaluate(() => location.hash), '#statements');
  await p.close();
});

test('live-region text reaches the scanned DOM as STATUS lines; empty and hidden regions do not', async () => {
  const p = await h.open(`<button id="save">Save profile</button>
    <p id="status" role="status">Saved profile</p>
    <div role="alert" style="display:none">Hidden alert</div>
    <div aria-live="polite"></div>`);
  const scan = await p.scan();
  const statusLines = scan.dom.split('\n').filter((l) => l.startsWith('STATUS'));
  assert.deepEqual(statusLines, ['STATUS text="Saved profile"']);
  await p.close();
});

test('Hindi destructive link scans as destructive, so it always asks', async () => {
  // The harness serves fixtures without a charset; declare UTF-8 so Devanagari is not decoded as windows-1252.
  const p = await h.open('<meta charset="utf-8"><a id="d" href="#gone">खाता हटाएं</a><a id="h" href="#help">सहायता केंद्र</a>');
  const scan = await p.scan();
  assert.deepEqual([byLabel(scan, 'खाता हटाएं').tier, byLabel(scan, 'खाता हटाएं').tierBasis], ['destructive', 'destructive-keyword']);
  assert.deepEqual([byLabel(scan, 'सहायता केंद्र').tier, byLabel(scan, 'सहायता केंद्र').tierBasis], ['state-changing', 'unproven']);
  await p.close();
});

test('Hindi pay and send links scan by the submit rule, so a Laya review can never release them', async () => {
  const p = await h.open(`<meta charset="utf-8"><a id="pay" href="#pay">भुगतान करें</a><a id="send" href="#send">पैसे भेजें</a>
    <a id="dep" href="#dep">जमा राशि देखें</a>`);
  const scan = await p.scan();
  for (const label of ['भुगतान करें', 'पैसे भेजें']) {
    assert.deepEqual([byLabel(scan, label).tier, byLabel(scan, label).tierBasis], ['state-changing', 'submit-keyword'], label);
  }
  assert.equal(byLabel(scan, 'जमा राशि देखें').tierBasis, 'unproven', 'view deposit amount is not a submit');
  await p.close();
});

// Settle after an action (3 October 2026): the loop waits until the page's DOM has been quiet for
// 100 ms instead of sleeping a fixed 250 ms + 400 ms, capped at the old 650 ms.
test('after a click on a quiet page the action returns once the DOM is quiet, well under the old fixed wait', async () => {
  const p = await h.open('<button id="b" onclick="document.getElementById(\'s\').textContent=\'done\'">Show</button><p id="s"></p>');
  const scan = await p.scan();
  const el = byLabel(scan, 'Show');
  const t0 = Date.now();
  const result = await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
  const ms = Date.now() - t0;
  assert.equal(result.changed, true);
  assert.equal(await p.page.textContent('#s'), 'done');
  assert.ok(ms < 450, `click returned in ${ms} ms`);
  await p.close();
});

test('a page that keeps changing is waited for up to the cap, and an update inside the quiet window is seen', async () => {
  const p = await h.open(`<button id="b" onclick="
      setTimeout(() => { document.getElementById('s').textContent = 'loaded'; }, 60);
      window.__tick = setInterval(() => { document.getElementById('t').textContent = Date.now(); }, 30);
    ">Load</button><p id="s"></p><p id="t"></p>`);
  const scan = await p.scan();
  const el = byLabel(scan, 'Load');
  const t0 = Date.now();
  await p.execute({ action: 'click', handle: el.handle, plannedTier: el.tier });
  const ms = Date.now() - t0;
  assert.equal(await p.page.textContent('#s'), 'loaded', 'an update 60 ms after the click landed before the action returned');
  assert.ok(ms >= 600, `a page that never goes quiet is waited for up to the cap (${ms} ms)`);
  assert.ok(ms < 1500, `the cap holds (${ms} ms)`);
  await p.page.evaluate(() => clearInterval(window.__tick));
  await p.close();
});

test('finish does not wait on the page', async () => {
  const p = await h.open('<p>nothing to do</p>');
  const t0 = Date.now();
  await p.execute({ action: 'finish' });
  assert.ok(Date.now() - t0 < 300, 'finish returned without a settle wait');
  await p.close();
});

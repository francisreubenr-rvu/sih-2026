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

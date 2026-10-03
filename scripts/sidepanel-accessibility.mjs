/**
 * Side panel accessibility harness (G09 WCAG / G10 responsive and motion evidence).
 *
 * Two modes, both in real Chromium through playwright-core (no `playwright install`):
 *
 * 1. Driven panel. `extension/` is served from a loopback HTTP server and `sidepanel.html` runs
 *    behind a recording `chrome.*` stub. The harness then feeds the panel the same messages the
 *    background worker sends (HEALTH_UPDATE, SESSION_UPDATE, PROMPT_REQUEST, TRACE_UPDATE) to put
 *    it in every state it can reach, and runs axe-core plus probes in each. The message payloads
 *    are synthetic UI fixtures: their numbers are display values, not measurements.
 * 2. Loaded extension. The real unpacked MV3 build is loaded into a throwaway profile and the
 *    panel page is opened as a tab (chrome-extension://<id>/sidepanel.html) with no Warden
 *    running, so its real background worker drives it to the offline state.
 *
 * Probes per state: axe (WCAG 2.0/2.1/2.2 A and AA tags plus best-practice), horizontal overflow
 * and content cut off by the body's overflow-x clip, target size (24px WCAG 2.5.8, 44px project
 * rule), Devanagari text outside a lang="hi" element. Once: keyboard traversal with focus-visible
 * check, the pending-card focus cycle, the WAI-ARIA tabs keys, the Settings fields' label / error
 * association, prefers-reduced-motion, WCAG 1.4.12 text spacing, 320px reflow and 200% zoom.
 *
 * Not covered here (say so in any results file): a screen reader, a human keyboard user, native
 * Chrome side-panel chrome (the panel is opened as a tab), Firefox, Windows high contrast.
 *
 * Usage: node scripts/sidepanel-accessibility.mjs [--out <file>] [--label <name>] [--ext <dir>]
 * The raw run is written as JSON; the results file in Benchmarks/results is composed from runs.
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const extDir = resolve(arg('--ext', join(root, 'extension')));
const outPath = resolve(arg('--out', join(root, 'Benchmarks/results/sidepanel-a11y-run.json')));
const label = arg('--label', 'run');
// --axe-only: axe and layout per state, no other probes (for runs against older builds).
const axeOnly = args.includes('--axe-only');
const chromePath = process.env.DHRISTI_CHROMIUM || '/opt/pw-browsers/chromium';
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

async function axeSource() {
  const local = process.env.AXE_PATH || join(root, 'Prototype/bench-assets/axe.min.js');
  if (!existsSync(local)) {
    await mkdir(dirname(local), { recursive: true });
    const r = await fetch(AXE_CDN, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`axe download failed: ${r.status}`);
    await writeFile(local, Buffer.from(await r.arrayBuffer()));
  }
  return readFile(local, 'utf8');
}

// ---- Loopback server for the driven panel ----------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
    const file = join(extDir, rel || 'sidepanel.html');
    if (!file.startsWith(extDir) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// The chrome.* stub. Records every message the panel sends and answers the request types the
// panel makes; `__dh.emit` delivers a message to the panel's onMessage listeners.
const STUB = () => {
  const dh = { listeners: [], sent: [], storage: {}, pairingResponse: { ok: true, paired: true, verified: false } };
  dh.respond = (msg) => {
    switch (msg.type) {
      case 'GET_SESSION': return { entries: [] };
      case 'GET_PROMPT': case 'GET_OUTBOUND': case 'GET_TRACE': return null;
      case 'RETRY_HEALTH': return { ok: true };
      case 'SET_WARDEN_PAIRING': return dh.pairingResponse;
      case 'SET_WARDEN_ORIGIN': return { ok: true };
      case 'REVEAL_TOKEN': return { value: 'priya.r@example.com' };
      case 'START_TASK': return { ok: true };
      default: return null;
    }
  };
  dh.emit = (msg) => { for (const fn of dh.listeners) fn(msg); };
  window.__dh = dh;
  window.chrome = {
    runtime: {
      sendMessage: (msg) => { dh.sent.push(msg); return Promise.resolve(dh.respond(msg)); },
      onMessage: { addListener: (fn) => dh.listeners.push(fn) },
      getURL: (p) => p,
    },
    storage: { local: { get: async () => dh.storage, set: async () => {} } },
    permissions: { request: async () => true },
  };
};

// ---- Synthetic fixtures (UI states, not measurements) ----------------------------------------
const H = {
  offline: { type: 'HEALTH_UPDATE', reachable: false, loaded: false, paired: false, error: 'fetch failed' },
  notPaired: { type: 'HEALTH_UPDATE', reachable: true, loaded: true, model: 'gliner-pii-fixture', planner: 'groq', destination: 'cloud', plannerModel: 'planner-fixture', groqConfigured: true, paired: false },
  pairingFailed: { type: 'HEALTH_UPDATE', reachable: false, loaded: false, paired: true, pairingFailed: true },
  loading: { type: 'HEALTH_UPDATE', reachable: true, loaded: false, planner: 'groq', destination: 'cloud', groqConfigured: true, paired: true, pairingVerified: true, elapsedMs: 12000 },
  noKey: { type: 'HEALTH_UPDATE', reachable: true, loaded: true, model: 'gliner-pii-fixture', planner: 'groq', destination: 'cloud', plannerModel: 'planner-fixture', groqConfigured: false, paired: true, pairingVerified: true },
  ready: { type: 'HEALTH_UPDATE', reachable: true, loaded: true, model: 'org/gliner-pii-fixture', planner: 'groq', destination: 'cloud', plannerModel: 'planner-fixture', groqConfigured: true, paired: true, pairingVerified: true },
  readyLocal: { type: 'HEALTH_UPDATE', reachable: true, loaded: true, model: 'org/gliner-pii-fixture', planner: 'ollama', destination: 'local', plannerModel: 'local-fixture', groqConfigured: false, paired: true, pairingVerified: true },
};
const E = {
  blocked: { id: 'b1', kind: 'blocked', text: 'The Warden is not running.', reason: 'GET /health failed: fetch failed', command: 'cd warden && python -m uvicorn app:app --host 127.0.0.1 --port 8756', resolved: false, refused: true },
  blockedResolved: { id: 'b0', kind: 'blocked', text: 'The Warden was not running.', reason: 'Recovered.', resolved: true, refused: true },
  user: { id: 'u1', kind: 'user', text: 'Update my contact email to priya.r@example.com and save the profile' },
  userHi: { id: 'u2', kind: 'user', text: 'मेरा ईमेल priya.r@example.com पर बदलें और प्रोफ़ाइल सहेजें' },
  stage1: { id: 's1', kind: 'stage', stage: 'PERCEIVE', value: '42 controls' },
  stage2: { id: 's2', kind: 'stage', stage: 'STRIP', value: '2 replaced, 1 uncertain' },
  activity: { id: 'a1', kind: 'activity', text: '1 span scored inside the uncertain band, so the run stopped to ask.' },
  uncertain: {
    id: 'p1', kind: 'uncertain-pii', promptId: 'prompt-1', pending: true,
    text: 'The Warden was not confident enough to strip these spans automatically. Choose strip or keep for each one.',
    items: [
      { id: 'sp1', token: 'PERSON#1', label: 'person', score: 0.62, preview: 'Priya Raghunathan', source: 'dom' },
      { id: 'sp2', token: 'PERSON#2', label: 'person', score: 0.58, preview: 'प्रिया रघुनाथन', source: 'label' },
    ],
  },
  question: {
    id: 'q1', kind: 'question', promptId: 'prompt-2', pending: true,
    text: 'The plan wants to click "खाता हटाएँ" (delete account). This step is destructive. Run it?',
    options: [{ id: 'proceed', label: 'Proceed' }, { id: 'skip', label: 'Skip this step' }, { id: 'stop', label: 'Stop the run' }],
    attempt: 1, reasons: ['Tier destructive: the label matches a delete keyword.', 'हिंदी लेबल: खाता हटाएँ'],
  },
  validated: { id: 'v1', kind: 'validated', text: 'Typed EMAIL#1 into #email after your confirmation.' },
  error: { id: 'e1', kind: 'error', text: 'warden: /plan returned 502 from the cloud planner.' },
  done: { id: 'd1', kind: 'activity', text: 'Task finished.', terminal: true, status: 'done' },
};
const answered = (e, extra) => ({ ...e, pending: false, ...extra });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAYAAAB4ka1VAAAAFklEQVR4nGP4z8DwnxhmGBVgGCQAAOZHBl0yXQAAAAAASUVORK5CYII=';
const TRACE = (stagesOverride = {}) => ({
  runId: 'r1', step: 2,
  planner: { destination: 'cloud', provider: 'groq', model: 'planner-fixture' },
  stages: {
    perceive: { status: 'done', ms: 180, detail: '42 controls' },
    redact: { status: 'done', ms: 240, detail: '2 replaced' },
    plan: { status: 'done', ms: 700, detail: 'type #email' },
    check: { status: 'done', ms: 3, detail: 'state-changing' },
    act: { status: 'active' },
    ...stagesOverride,
  },
  redaction: {
    replaced: [
      { token: 'EMAIL#1', type: 'EMAIL', source: 'task', layer: 'regex', score: 1 },
      { token: 'PERSON#1', type: 'PERSON', source: 'dom', layer: 'gliner', score: 0.91 },
    ],
    uncertainAsked: 1, screenMasked: 2,
  },
  screenshot: { dataUrl: PNG, width: 320, height: 200 },
  outbound: {
    path: '/plan', bytes: 1840,
    body: {
      tokenizedTask: 'Update my contact email to EMAIL#1 and save the profile',
      elements: [
        { tag: 'input', selector: '#email', label: 'Email EMAIL#1' },
        { tag: 'button', selector: '#save', label: 'Save profile' },
        { tag: 'a', selector: '#delete', label: 'खाता हटाएँ' },
      ],
      history: [],
    },
  },
  inbound: { action: 'type', target: '#email', value: 'EMAIL#1', reasoning: 'Fill EMAIL#1 into the email field.', model: 'planner-fixture', latencyMs: 700, switched: [] },
  check: { checks: [{ name: 'target exists', pass: true }, { name: 'tier agrees', pass: true, detail: 'state-changing' }, { name: 'value is a token', pass: false, detail: 'खाता हटाएँ is not a token' }], tier: 'state-changing', gate: 'confirm', choice: 'proceed' },
  act: { outcome: 'done', action: 'type', target: '#email' },
});
const session = (...entries) => ({ type: 'SESSION_UPDATE', entries });

// Every state is a list of steps run on a fresh page. A step is a message to emit, or an action.
const STATES = [
  { name: 'initial-checking', steps: [] },
  { name: 'offline-blocked-card', steps: [H.offline, session(E.blocked)] },
  { name: 'pairing-failed', steps: [H.pairingFailed, session(E.blocked)] },
  { name: 'not-paired-settings-open', steps: [H.notPaired, { open: 'settings' }] },
  { name: 'pairing-save-error', steps: [H.notPaired, { open: 'settings' }, { pairingResponse: { ok: false, error: 'The pairing code must be at least 16 characters.' } }, { fill: ['#warden-pairing', 'short'] }, { click: '#warden-pairing-save' }] },
  { name: 'origin-refused', steps: [H.ready, { open: 'settings' }, { fill: ['#warden-origin', 'http://example.com:8756'] }, { click: '#warden-origin-save' }] },
  { name: 'loading', steps: [H.loading] },
  { name: 'no-cloud-key-settings-open', steps: [H.noKey, { open: 'settings' }] },
  { name: 'ready-empty', steps: [H.ready] },
  { name: 'ready-local-planner', steps: [H.readyLocal] },
  { name: 'ready-task-typed', steps: [H.ready, { fill: ['#task-input', 'Fill this form with my name, email and phone number'] }] },
  { name: 'running', steps: [H.ready, session(E.user, E.stage1, E.stage2, E.activity), { trace: TRACE({ act: { status: 'idle' }, check: { status: 'idle' }, plan: { status: 'active' } }) }] },
  { name: 'uncertain-pii-pending', steps: [H.ready, session(E.user, E.stage1, E.activity, E.uncertain), { trace: TRACE({ redact: { status: 'active' }, plan: { status: 'idle' }, check: { status: 'idle' }, act: { status: 'idle' } }) }] },
  { name: 'uncertain-pii-incomplete-answer', steps: [H.ready, session(E.user, E.uncertain), { click: '.entry--uncertain-pii .btn-primary' }] },
  { name: 'question-pending-hindi', steps: [H.ready, session(E.userHi, E.stage1, E.question), { trace: TRACE({ check: { status: 'active' }, act: { status: 'idle' } }) }] },
  { name: 'prompt-from-get-prompt', steps: [H.ready, session(E.user), { emit: { type: 'PROMPT_REQUEST', prompt: { id: 'prompt-9', kind: 'validation-question', text: 'Run this step?', options: [{ id: 'proceed', label: 'Proceed' }, { id: 'stop', label: 'Stop the run' }], attempt: 2, reasons: [] } } }] },
  { name: 'inspector-cloud-saw', steps: [H.ready, session(E.user, E.stage1), { trace: TRACE() }, { open: 'inspector', tab: 'sent' }, { click: '#outbound-raw-toggle' }] },
  { name: 'inspector-kept-revealed', steps: [H.ready, session(E.user), { trace: TRACE() }, { open: 'inspector', tab: 'kept' }, { click: '.reveal-btn' }] },
  { name: 'inspector-screen', steps: [H.ready, session(E.user), { trace: TRACE() }, { open: 'inspector', tab: 'screen' }] },
  { name: 'inspector-decision', steps: [H.ready, session(E.user), { trace: TRACE({ act: { status: 'error' }, check: { status: 'skipped' } }) }, { open: 'inspector', tab: 'decision' }] },
  { name: 'finished-history', steps: [H.ready, session(E.blockedResolved, E.user, answered(E.uncertain, { items: E.uncertain.items.map((i) => ({ ...i, decision: 'strip' })) }), answered(E.question, { choice: 'proceed', choiceLabel: 'Proceed' }), E.validated, E.error, E.done), { trace: TRACE({ act: { status: 'done' } }) }] },
];

async function applyStep(page, step) {
  if (step.type) return page.evaluate((m) => window.__dh.emit(m), step);
  if (step.emit) return page.evaluate((m) => window.__dh.emit(m), step.emit);
  if (step.trace) return page.evaluate((t) => window.__dh.emit({ type: 'TRACE_UPDATE', trace: t }), step.trace);
  if (step.pairingResponse) return page.evaluate((r) => { window.__dh.pairingResponse = r; }, step.pairingResponse);
  // A control an older build does not have is skipped, not waited on (the harness also runs
  // against earlier commits for a before/after comparison).
  if (step.fill) return (await page.$(step.fill[0])) ? page.fill(step.fill[0], step.fill[1]) : null;
  if (step.click) {
    if (!(await page.$(step.click))) return null;
    await page.click(step.click);
    return page.waitForTimeout(50);
  }
  if (step.open === 'settings') return page.evaluate(() => { document.querySelector('details.diagnostics').open = true; });
  if (step.open === 'inspector') {
    await page.evaluate(() => { const d = document.getElementById('inspector'); if (d) d.open = true; });
    return (await page.$(`#tab-${step.tab}`)) ? page.click(`#tab-${step.tab}`) : null;
  }
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function runAxe(page) {
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })),
      incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')), reasons: [...new Set(v.nodes.map((n) => ((n.any[0] || n.all[0] || n.none[0] || {}).message || '').replace(/\s+/g, ' ').slice(0, 140)))] })),
      passes: r.passes.length,
    };
  }, AXE_TAGS);
}

// Layout probes: page-level horizontal overflow, elements cut off by the body's overflow-x clip,
// controls under 24px (WCAG 2.5.8) and under 44px (project rule), and Devanagari text whose
// nearest lang ancestor is not "hi" (WCAG 3.1.2).
async function layoutProbe(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]');
    };
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
    const cut = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el) || el.closest('.visually-hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        // Only report the outermost cut element, not every descendant.
        if (!cut.some((c) => c.el.contains(el))) cut.push({ el, right: Math.round(r.right), left: Math.round(r.left) });
      }
    }
    const small24 = [];
    const small44 = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type="radio"]), textarea, select, summary, [role="tab"], .choice-row label')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const row = { el: name(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) };
      if (r.width < 24 || r.height < 24) small24.push(row);
      else if (r.width < 44 || r.height < 44) small44.push(row);
    }
    const deva = /[ऀ-ॿ]/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const langMiss = [];
    let langHit = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!deva.test(n.nodeValue) || !n.parentElement || !visible(n.parentElement)) continue;
      const host = n.parentElement.closest('[lang]');
      if (host && /^hi\b/i.test(host.getAttribute('lang'))) langHit += 1;
      else langMiss.push({ parent: name(n.parentElement), text: n.nodeValue.trim().slice(0, 40), lang: host ? host.getAttribute('lang') : null });
    }
    return {
      viewport: vw,
      scrollWidth: document.documentElement.scrollWidth,
      horizontal_overflow: document.documentElement.scrollWidth > vw + 1,
      cut_off_elements: cut.slice(0, 12).map((c) => ({ el: name(c.el), left: c.left, right: c.right })),
      cut_off_count: cut.length,
      targets_under_24px: small24,
      targets_under_44px: small44,
      devanagari_text_nodes_with_lang_hi: langHit,
      devanagari_text_nodes_without_lang_hi: langMiss,
    };
  });
}

// axe leaves text over the lane bands, the cloud hatch and scroll containers as "needs review".
// This measures them: the colours stacked under the element's centre (elementsFromPoint), the
// first opaque background plus every colour stop of any gradient above it (the hatch lines), and
// the worst ratio against the text colour. Large text (>=24px, or >=18.66px bold) needs 3:1.
async function manualContrast(page, selectors) {
  return page.evaluate((sels) => {
    const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
    const out = [];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((e) => e !== el && !el.contains(e));
      const candidates = [];
      let base = null;
      for (const e of stack) {
        const ecs = getComputedStyle(e);
        for (const m of ecs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)) candidates.push(parse(m[0]));
        const bg = parse(ecs.backgroundColor);
        if (bg && bg.a > 0) { if (bg.a >= 1) { base = bg; break; } candidates.push(bg); }
      }
      base = base || { r: 255, g: 255, b: 255, a: 1 };
      const grounds = [base, ...candidates.filter(Boolean).map((c) => over(c, base))];
      const fg = over(parse(cs.color), base);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const worst = Math.min(...grounds.map((g) => ratio(fg, g)));
      out.push({ selector: sel, text: (el.textContent || '').trim().slice(0, 30), color: cs.color, worst_ratio: Math.round(worst * 100) / 100, required: large ? 3 : 4.5, pass: worst >= (large ? 3 : 4.5), grounds_checked: grounds.length });
    }
    return out;
  }, selectors);
}

async function freshPanel(context, { width = 360, height = 800 } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(STUB);
  await page.goto(`${origin}/sidepanel.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dh && window.__dh.listeners.length > 0);
  await page.waitForTimeout(100);
  return { page, errors };
}

// Entries fade in with a 320ms stepped reveal and buttons step their colours over 140ms; axe must
// not sample a colour mid-change, so wait for those to finish.
async function settle(page) {
  await page.evaluate(() => Promise.race([
    // Reveals and colour transitions (a button turning from its disabled tint to cobalt); the
    // bounded ring and glyph loops are left running, they are under 5s and change no text colour.
    Promise.all(document.getAnimations().filter((a) => a.animationName === 'pixel-reveal' || a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 2000)),
  ]));
  await page.waitForTimeout(50);
}

async function addAxe(page, source) {
  await page.evaluate(source);
}

const record = {
  label,
  generatedAt: new Date().toISOString(),
  extension_dir: extDir.replace(root + '/', ''),
  tools: {},
  driven_states: [],
  probes: {},
  loaded_extension: null,
};

const source = await axeSource();
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
record.tools = {
  axe_core: (source.match(/axe v([\d.]+)/) || [])[1] || 'unknown',
  axe_tags: AXE_TAGS,
  playwright_core: JSON.parse(readFileSync(join(root, 'Prototype/node_modules/playwright-core/package.json'), 'utf8')).version,
  chromium: browser.version(),
};
const context = await browser.newContext({ colorScheme: 'light' });

// ---- Every driven state at 360px (the default side panel width) ----------------------------------
for (const state of STATES) {
  const { page, errors } = await freshPanel(context);
  for (const step of state.steps) await applyStep(page, step);
  await settle(page);
  await addAxe(page, source);
  const axe = await runAxe(page);
  const layout = await layoutProbe(page);
  const review = axe.incomplete.filter((i) => i.id === 'color-contrast').flatMap((i) => i.targets);
  const manual_contrast = review.length ? await manualContrast(page, review) : [];
  record.driven_states.push({ state: state.name, width: 360, axe, layout, manual_contrast, page_errors: errors });
  await page.close();
}

if (!axeOnly) {
// ---- Reflow: 320px (WCAG 1.4.10) and 180px (a 360px panel at 200% zoom) ---------------------------
record.probes.reflow = [];
for (const [stateName, width, height] of [['ready-empty', 320, 800], ['uncertain-pii-pending', 320, 800], ['inspector-decision', 320, 800], ['not-paired-settings-open', 320, 800], ['ready-empty', 180, 400], ['uncertain-pii-pending', 180, 400], ['inspector-cloud-saw', 180, 400], ['not-paired-settings-open', 180, 400]]) {
  const state = STATES.find((s) => s.name === stateName);
  const { page } = await freshPanel(context, { width, height });
  for (const step of state.steps) await applyStep(page, step);
  await page.waitForTimeout(120);
  const layout = await layoutProbe(page);
  record.probes.reflow.push({ state: stateName, width, height, note: width === 180 ? '200% zoom of a 360x800 panel (CSS px halve)' : 'WCAG 1.4.10 reflow width', ...layout });
  await page.close();
}

// ---- WCAG 1.4.12 text spacing ----------------------------------------------------------------------
record.probes.text_spacing = [];
for (const stateName of ['ready-empty', 'uncertain-pii-pending', 'inspector-decision', 'not-paired-settings-open']) {
  const state = STATES.find((s) => s.name === stateName);
  const { page } = await freshPanel(context);
  for (const step of state.steps) await applyStep(page, step);
  await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}' });
  await page.waitForTimeout(80);
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('.visually-hidden') || el.closest('[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || !el.getBoundingClientRect().width) continue;
      const clipsX = /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const clipsY = /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if ((clipsX || clipsY) && (el.textContent || '').trim()) {
        out.push({ el: `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`, text: el.textContent.trim().slice(0, 40), x: clipsX, y: clipsY, ellipsis: cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' });
      }
    }
    return out;
  });
  const layout = await layoutProbe(page);
  record.probes.text_spacing.push({ state: stateName, horizontal_overflow: layout.horizontal_overflow, cut_off_count: layout.cut_off_count, text_clipped_by_overflow: clipped });
  await page.close();
}

// ---- prefers-reduced-motion ------------------------------------------------------------------------
{
  const result = {};
  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ colorScheme: 'light', reducedMotion: motion });
    const { page } = await freshPanel(ctx);
    for (const step of STATES.find((s) => s.name === 'uncertain-pii-pending').steps) await applyStep(page, step);
    await page.waitForTimeout(30);
    result[motion] = await page.evaluate(() => {
      const running = document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({ name: a.animationName || a.constructor.name, target: a.effect && a.effect.target ? `${a.effect.target.tagName.toLowerCase()}.${String(a.effect.target.className).split(' ')[0]}` : null }));
      const transitions = [...document.querySelectorAll('button, .node')].filter((el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length;
      return { running_animations: running.length, sample: running.slice(0, 6), elements_with_transition: transitions };
    });
    await ctx.close();
  }
  record.probes.reduced_motion = result;
}

// ---- Keyboard: traversal and focus-visible in ready + Settings open + inspector open -------------------
async function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    let ringHost = el;
    // A visually hidden radio draws its ring on the label (:has(input:focus-visible)).
    if (el.matches('.choice-row input')) ringHost = el.closest('label');
    const rcs = getComputedStyle(ringHost);
    const ring = (rcs.outlineStyle !== 'none' && parseFloat(rcs.outlineWidth) >= 2) || /rgb/.test(rcs.boxShadow);
    const r = ringHost.getBoundingClientRect();
    return {
      el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`,
      name: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      focus_visible: el.matches(':focus-visible'),
      ring_drawn: ring,
      ring: `${rcs.outlineStyle} ${rcs.outlineWidth} ${rcs.outlineColor}`,
      on_screen: r.width > 0 && r.height > 0,
      cs_display: cs.display,
    };
  });
}

{
  const { page } = await freshPanel(context, { width: 360, height: 900 });
  for (const step of [H.ready, session(E.user, E.stage1), { trace: TRACE() }]) await applyStep(page, step);
  await page.evaluate(() => { document.querySelector('details.diagnostics').open = true; });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    if (!info) continue;
    if (order.length && order[0].el === info.el && order[0].name === info.name) break;
    order.push(info);
  }
  // The tab list: arrows, Home, End.
  await page.evaluate(() => { document.getElementById('inspector').open = true; });
  await page.focus('#tab-sent');
  const tabKeys = [];
  for (const key of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft']) {
    await page.keyboard.press(key);
    tabKeys.push({ key, focused: await page.evaluate(() => document.activeElement.id), selected: await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').id) });
  }
  record.probes.keyboard = {
    state: 'ready, transcript with one step, Settings open',
    tab_stops: order.length,
    order: order.map((o) => `${o.el} "${o.name}"`),
    without_visible_ring: order.filter((o) => !o.ring_drawn || !o.focus_visible).map((o) => ({ el: o.el, name: o.name, ring: o.ring, focus_visible: o.focus_visible })),
    off_screen_or_hidden_stops: order.filter((o) => !o.on_screen),
    tabs_widget: tabKeys,
  };
  await page.close();
}

// ---- Pending card focus cycle: can a keyboard user leave or stop? -----------------------------------
{
  const result = {};
  for (const [kind, steps] of [['uncertain-pii', STATES.find((s) => s.name === 'uncertain-pii-pending').steps], ['question', STATES.find((s) => s.name === 'question-pending-hindi').steps]]) {
    const { page } = await freshPanel(context);
    for (const step of steps) await applyStep(page, step);
    await page.focus('#task-input');
    const seen = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await focusInfo(page);
      seen.push(info ? `${info.el} "${info.name}"` : 'body');
    }
    const back = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      const info = await focusInfo(page);
      back.push(info ? `${info.el} "${info.name}"` : 'body');
    }
    const stopVisible = await page.evaluate(() => !document.getElementById('stop').hidden);
    result[kind] = {
      cycle: [...new Set(seen)],
      reverse_cycle: [...new Set(back)],
      stop_button_visible: stopVisible,
      stop_reachable_by_keyboard: seen.some((s) => s.startsWith('button#stop')),
      // Anything other than the card's own controls and Stop counts as leaving the cycle.
      leaves_cycle: seen.concat(back).some((s) => !/^(input|button)/.test(s)),
    };
    await page.close();
  }
  record.probes.pending_card_focus = result;
}

// ---- Settings fields: label, description and error association --------------------------------------
{
  const { page } = await freshPanel(context);
  for (const step of [H.notPaired, { open: 'settings' }]) await applyStep(page, step);
  const read = () => page.evaluate(() => {
    const field = (id) => {
      const el = document.getElementById(id);
      const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map((d) => document.getElementById(d)?.textContent.trim() || `(missing #${d})`);
      const status = el.closest('.key-field').querySelector('.key-status');
      return {
        label: el.labels && el.labels[0] ? el.labels[0].textContent.trim() : null,
        type: el.type,
        autocomplete: el.getAttribute('autocomplete'),
        aria_invalid: el.getAttribute('aria-invalid'),
        described_by_text: described,
        status_live: status ? (status.getAttribute('role') || status.getAttribute('aria-live') || null) : null,
        status_text: status ? status.textContent.trim() : null,
      };
    };
    return { origin: field('warden-origin'), pairing: field('warden-pairing') };
  });
  const before = await read();
  await page.evaluate(() => { window.__dh.pairingResponse = { ok: false, error: 'The pairing code must be at least 16 characters.' }; });
  await page.fill('#warden-pairing', 'short');
  await page.click('#warden-pairing-save');
  await page.fill('#warden-origin', 'http://example.com:8756');
  await page.click('#warden-origin-save');
  await page.waitForTimeout(50);
  const afterError = await read();
  await page.evaluate(() => { window.__dh.pairingResponse = { ok: true, paired: true, verified: true }; });
  await page.fill('#warden-pairing', 'a-long-enough-synthetic-code-0000');
  await page.click('#warden-pairing-save');
  await page.fill('#warden-origin', 'http://127.0.0.1:8756');
  await page.click('#warden-origin-save');
  await page.waitForTimeout(50);
  const afterFix = await read();
  record.probes.settings_fields = { before: before, after_error: afterError, after_fix: afterFix };
  await page.close();
}
} // end of probes skipped by --axe-only

await context.close();
await browser.close();

// ---- Loaded extension: the real background worker, no Warden running -------------------------------
try {
  const ctx = await chromium.launchPersistentContext('', {
    executablePath: chromePath, headless: false, viewport: { width: 360, height: 800 },
    args: ['--headless=new', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForFunction(() => document.getElementById('health-chip').textContent !== 'CHECKING', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(source);
  const states = [];
  states.push({ state: 'loaded-offline', chip: await page.textContent('#health-chip'), axe: await runAxe(page), layout: await layoutProbe(page) });
  await page.evaluate(() => { document.querySelector('details.diagnostics').open = true; });
  states.push({ state: 'loaded-offline-settings-open', axe: await runAxe(page), layout: await layoutProbe(page) });
  record.loaded_extension = { extension_id_scheme: 'chrome-extension', opened_as: 'tab (not the native side panel host)', states, page_errors: errors };
  await ctx.close();
} catch (e) {
  record.loaded_extension = { error: String(e && e.message || e) };
}

server.close();
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');

const summary = record.driven_states.map((s) => `${s.state}: ${s.axe.violations.map((v) => `${v.id}(${v.nodes})`).join(', ') || '0'}${s.manual_contrast.some((m) => !m.pass) ? ` [manual-contrast-fail ${s.manual_contrast.filter((m) => !m.pass).length}]` : ''}${s.layout.horizontal_overflow ? ' [x-overflow]' : ''}${s.layout.devanagari_text_nodes_without_lang_hi.length ? ` [hi-lang-miss ${s.layout.devanagari_text_nodes_without_lang_hi.length}]` : ''}${s.page_errors.length ? ` [errors ${s.page_errors.length}]` : ''}`);
console.log(summary.join('\n'));
if (record.loaded_extension?.states) console.log(record.loaded_extension.states.map((s) => `${s.state}: ${s.axe.violations.map((v) => `${v.id}(${v.nodes})`).join(', ') || '0'}`).join('\n'));
else console.log('loaded extension:', record.loaded_extension);
console.log(`wrote ${outPath}`);

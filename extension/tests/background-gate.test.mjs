// F17 gate in the real extension/background.js, driven end to end against a fake Warden.
//
// v5: the run loop makes every acting decision locally (utils/plan-check.js + utils/op-tier.js).
// POST /validate is never called; each test below also proves that.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_HEALTH, defaultStrip, runTask } from './helpers/background-harness.mjs';


const H_NEXT = `h${'a'.repeat(32)}`;
const H_DEL = `h${'b'.repeat(32)}`;
const H_FIELD = `h${'c'.repeat(32)}`;

function scanOf(elements) {
  const dom = elements.map((el, i) => `${i + 1}. ${el.tag.toUpperCase()} selector=${el.selector} label="${el.label}"`).join('\n');
  return { elements, dom, digest: 'x', piiMaskedCount: 0, piiFields: [], viewport: { width: 800, height: 600 } };
}

const NEXT_LINK = { tag: 'a', type: 'a', selector: 'body > a', handle: H_NEXT, tier: 'navigational', label: 'Next page', x: 10, y: 10, filled: false, fieldType: 'a', pii: false };
const DELETE_BUTTON = { tag: 'button', type: 'button', selector: 'body > form > button', handle: H_DEL, tier: 'destructive', label: 'Next', x: 10, y: 40, filled: false, fieldType: 'button', pii: false };
const SEARCH_FIELD = { tag: 'input', type: 'text', selector: '#q', handle: H_FIELD, tier: 'state-changing', label: 'Search', x: 10, y: 70, filled: false, fieldType: 'text', pii: false };

const FINISH = { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' };
const click = (selector) => ({ action: 'click', target_selector: selector, coordinates: { x: 10, y: 10 }, value: null, reasoning_token: 'next' });

// Plans the given sequence, one per /plan call, then finish forever after.
const planSeq = (...plans) => (body, n) => ({ model: 'fake-planner', destination: 'cloud', plan: plans[n - 1] || FINISH });

function assertNoValidate(run) {
  assert.equal(run.validateCalls, 0, 'POST /validate was called');
  assert.equal(run.fetchBodies.some((b) => b.path === '/validate'), false);
}

test('navigational click executes unattended, by handle only, with no /validate call', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(click('body > a')) } });
  assertNoValidate(run);
  assert.equal(run.prompts.length, 0);
  assert.equal(run.executed.length, 2);
  assert.deepEqual(run.executed[0], { action: 'click', value: null, plannedTier: 'navigational', handle: H_NEXT });
  assert.equal('target_selector' in run.executed[0], false, 'no selector reaches the content script');
  assert.equal(run.terminal.status, 'finished');
  const f17 = run.trace.f17Steps[0];
  assert.equal(f17.gatePath, 'unattended_ok');
  assert.equal(f17.unattendedExecuteAllowed, true);
  assert.equal(f17.localTier, 'navigational');
  assert.equal(f17.wardenTier, null, 'there is no Warden tier in v5');
  assert.equal(f17.tiersAgree, false, 'no agreement is claimed without a second party');
  assert.equal(typeof run.trace.stagesMs.validate, 'number', 'local check time is recorded under validate');
  assert.equal(typeof run.trace.stagesMs.f17_local_tier, 'number');
});

test('reversible actions run unattended', async () => {
  const scroll = { action: 'scroll', target_selector: null, coordinates: { x: 0, y: 0 }, value: '300', reasoning_token: 'down' };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(scroll) } });
  assertNoValidate(run);
  assert.equal(run.prompts.length, 0);
  assert.deepEqual(run.executed.map((a) => [a.action, a.plannedTier]), [['scroll', 'reversible'], ['finish', 'reversible']]);
  assert.equal(run.terminal.status, 'finished');
});

test('destructive always asks a human; stop executes nothing', async () => {
  const run = await runTask({ scan: scanOf([DELETE_BUTTON]), warden: { plan: planSeq(click('body > form > button')) } });
  assertNoValidate(run);
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /classified destructive/);
  // The label from the local scan and the tab origin, not only a selector (security review, 3 October 2026).
  assert.match(run.prompts[0].text, /will click "Next" on https:\/\/bank\.example\./);
  assert.deepEqual(run.prompts[0].options.map((o) => o.id), ['proceed', 'skip', 'stop']);
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'stopped');
  assert.equal(run.trace.f17Steps[0].gatePath, 'reject');
  assert.equal(run.trace.terminal, 'ask');
});

test('destructive, user proceeds: executes with the destructive tier', async () => {
  const run = await runTask({ scan: scanOf([DELETE_BUTTON]), choices: ['proceed'], warden: { plan: planSeq(click('body > form > button')) } });
  assert.equal(run.executed[0].plannedTier, 'destructive');
  assert.equal(run.executed[0].handle, H_DEL);
  assert.ok(run.entries.some((e) => e.kind === 'validated'));
});

test('state-changing stops for local confirmation', async () => {
  const type = { action: 'type', target_selector: '#q', coordinates: { x: 10, y: 70 }, value: 'orbits', reasoning_token: 'search' };
  const stopped = await runTask({ scan: scanOf([SEARCH_FIELD]), warden: { plan: planSeq(type) } });
  assert.equal(stopped.prompts.length, 1);
  assert.match(stopped.prompts[0].text, /tier 'state-changing' and requires local confirmation/);
  assert.equal(stopped.executed.length, 0);

  const proceeded = await runTask({ scan: scanOf([SEARCH_FIELD]), choices: ['proceed'], warden: { plan: planSeq(type) } });
  assert.equal(proceeded.executed[0].action, 'type');
  assert.equal(proceeded.executed[0].plannedTier, 'state-changing');
  assert.equal(proceeded.terminal.status, 'finished');
});

test('a target not in the local scan is rejected and re-planned with the reasons', async () => {
  const strip = (body) => {
    const resp = defaultStrip(body);
    resp.elements.push({ ...resp.elements[0], selector: '#injected' }); // exists only on the wire
    return resp;
  };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { strip, plan: planSeq(click('#injected'), click('body > a')) } });
  assertNoValidate(run);
  const plans = run.fetchBodies.filter((b) => b.path === '/plan');
  assert.ok(plans.length >= 2);
  const rejected = plans[1].body.history.find((h) => h.action === 'VALIDATION_REJECTED');
  assert.ok(rejected, 'the second /plan carries the rejection');
  assert.ok(rejected.reasons.some((r) => /^selector-in-scene: .*not in this extension's own scan/.test(r)));
  assert.equal(run.executed[0].handle, H_NEXT, 'the re-planned, valid target ran');
  assert.equal(run.executed.some((a) => a.handle === undefined && a.action === 'click'), false);
  assert.equal(run.prompts.length, 0);
  assert.equal(run.trace.f17Steps[0].gatePath, 'reject');
  assert.equal(run.trace.f17Steps[0].tierError, true);
});

test('an unknown action is rejected every time, then asks with no Proceed option; nothing runs', async () => {
  const hover = { action: 'hover', target_selector: 'body > a', coordinates: { x: 1, y: 1 }, value: null, reasoning_token: 'x' };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: () => ({ model: 'fake-planner', plan: hover }) } });
  assertNoValidate(run);
  assert.equal(run.fetchBodies.filter((b) => b.path === '/plan').length, 3);
  assert.equal(run.prompts.length, 1);
  assert.deepEqual(run.prompts[0].options.map((o) => o.id), ['skip', 'stop']);
  assert.ok(run.prompts[0].reasons.some((r) => /^action-allowed: invalid action "hover"/.test(r)));
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'stopped');
});

test('answering Proceed to an exhausted rejection (not offered) is a stop', async () => {
  const hover = { action: 'hover', target_selector: 'body > a', coordinates: { x: 1, y: 1 }, value: null, reasoning_token: 'x' };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), choices: ['proceed'], warden: { plan: () => ({ model: 'fake-planner', plan: hover }) } });
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'stopped');
});

test('unexpected plan keys are rejected and re-planned', async () => {
  const extra = { ...click('body > a'), url: 'https://example.com/' };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(extra, click('body > a')) } });
  const second = run.fetchBodies.filter((b) => b.path === '/plan')[1];
  assert.ok(second.body.history.some((h) => h.action === 'VALIDATION_REJECTED' && h.reasons.some((r) => /no-unexpected-keys: .*url/.test(r))));
  assert.equal(run.executed[0].handle, H_NEXT);
  assert.equal(run.terminal.status, 'finished');
});

test('non-finite coordinates are rejected', async () => {
  const bad = { ...click('body > a'), coordinates: { x: -1, y: 'a' } };
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(bad, bad, bad) } });
  assert.equal(run.executed.length, 0);
  assert.ok(run.prompts[0].reasons.some((r) => /^coordinates-finite/.test(r)));
});

test('Warden-tampered /strip elements do not change the local tier', async () => {
  const strip = (body) => {
    const resp = defaultStrip(body);
    // Relabel the destructive control, claim a tier for it, and add a decoy with the same key.
    resp.elements = resp.elements.map((el) => ({ ...el, label: 'Next page', tier: 'navigational', fieldType: 'a' }));
    resp.elements.push({ ...resp.elements[0], label: 'Home' });
    return resp;
  };
  const run = await runTask({ scan: scanOf([DELETE_BUTTON]), warden: { strip, plan: planSeq(click('body > form > button')) } });
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /classified destructive/);
  assert.equal(run.executed.length, 0);
});

test('an ambiguous key in the local scan is rejected, not resolved to the first match', async () => {
  const twin = { ...DELETE_BUTTON, selector: NEXT_LINK.selector };
  const run = await runTask({ scan: scanOf([twin, NEXT_LINK]), warden: { plan: () => ({ model: 'fake-planner', plan: click('body > a') }) } });
  assert.equal(run.executed.length, 0);
  assert.ok(run.entries.some((e) => e.kind === 'error' && /ambiguous/.test(e.text)));
  assert.ok(run.prompts[0].reasons.some((r) => /ambiguous/.test(r)));
});

test('intent coherence: destructive task with no destructive control is rewritten to finish', async () => {
  const run = await runTask({ task: 'delete my account', scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(click('body > a')) } });
  assert.equal(run.prompts.length, 0);
  assert.deepEqual(run.executed.map((a) => a.action), ['finish']);
  assert.equal(run.terminal.status, 'finished');
});

test('Warden unreachable at /plan fails closed: no execute', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { plan: () => { throw new TypeError('connection refused'); } },
  });
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'error');
});

test('egress guard 422 ends the run naming the pattern and field, never a value', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { plan: () => { throw Object.assign(new Error('guard'), { status: 422, body: { error: 'egress guard', egressGuard: { pattern: 'email', field: 'elements[0].label' } } }); } },
  });
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'error');
  assert.ok(run.entries.some((e) => e.kind === 'error' && /egress guard refused the request \(email in elements\[0\]\.label\)/.test(e.text)));
  assert.equal(run.pipelineTrace.stages.plan.status, 'error');
  assert.match(run.pipelineTrace.stages.plan.detail, /egress guard/);
});

test('Warden unreachable at /health refuses the task before any scan', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { health: () => { throw new TypeError('connection refused'); }, plan: planSeq(click('body > a')) },
  });
  assert.equal(run.start.ok, false);
  assert.equal(run.scans, 0);
  assert.equal(run.executed.length, 0);
});

test('planner groq with no key refuses the run with a card naming both fixes', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { health: () => ({ ok: true, loaded: true, model: 'g', planner: 'groq', groqConfigured: false, destination: 'cloud', plannerModel: 'm' }), plan: planSeq(click('body > a')) },
  });
  assert.equal(run.start.ok, false);
  assert.equal(run.start.refused, true);
  assert.equal(run.scans, 0);
  assert.equal(run.fetchBodies.some((b) => b.path === '/strip' || b.path === '/plan'), false);
  const card = run.entries.find((e) => e.kind === 'blocked' && e.id === 'blocked-groq');
  assert.ok(card);
  assert.match(card.text, /GROQ_API_KEY in warden\/\.env/);
  assert.match(card.text, /WARDEN_PLANNER=ollama/);
  assert.equal(run.terminal.status, 'refused');
});

test('offline planner (ollama) needs no key', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { health: () => ({ ok: true, loaded: true, model: 'g', planner: 'ollama', groqConfigured: false }), plan: planSeq(click('body > a')) },
  });
  assert.equal(run.terminal.status, 'finished');
  const health = run.healthUpdates.at(-1);
  assert.equal(health.planner, 'ollama');
  assert.equal(health.destination, 'local', 'derived from planner when /health omits it');
  assert.equal(health.plannerModel, null);
});

test('HEALTH_UPDATE carries destination and plannerModel', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(click('body > a')) } });
  const health = run.healthUpdates.at(-1);
  assert.equal(health.destination, 'cloud');
  assert.equal(health.plannerModel, 'fake-cloud-planner');
  assert.equal(health.planner, 'groq');
});

test('a live tier escalation reported by the content script prompts; stop clicks nothing further', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    choices: ['stop'],
    warden: { plan: planSeq(click('body > a')) },
    execute: () => ({ tierEscalated: true, liveTier: 'destructive', plannedTier: 'navigational' }),
  });
  assert.equal(run.executed.length, 1);
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /now reads as tier 'destructive'/);
  assert.match(run.prompts[0].text, /The step was: click "Next page" on https:\/\/bank\.example\./);
  assert.equal(run.terminal.status, 'stopped');
});

test('a live tier escalation, user proceeds: re-sent once with the live tier', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    choices: ['proceed'],
    warden: { plan: planSeq(click('body > a')) },
    execute: (action, n) => (n === 1 ? { tierEscalated: true, liveTier: 'destructive', plannedTier: action.plannedTier } : { digest: 'd' }),
  });
  assert.equal(run.executed[1].plannedTier, 'destructive');
  assert.equal(run.executed[1].handle, H_NEXT);
});

test('egress: handles, local tiers and the screenshot never reach the Warden', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK, DELETE_BUTTON]), warden: { plan: planSeq(click('body > a')) } });
  assertNoValidate(run);
  assert.ok(run.fetchBodies.some((b) => b.path === '/strip'));
  assert.ok(run.fetchBodies.some((b) => b.path === '/plan'));
  for (const { path, raw, body } of run.fetchBodies) {
    assert.equal(raw.includes(H_NEXT) || raw.includes(H_DEL), false, `${path} carries a handle`);
    assert.equal(raw.includes('data:image'), false, `${path} carries screenshot bytes`);
    for (const el of body?.elements || []) assert.equal('tier' in el, false, `${path} element carries a local tier`);
  }
  const planBody = run.fetchBodies.find((b) => b.path === '/plan').body;
  assert.deepEqual(Object.keys(planBody).sort(), ['elements', 'history', 'sanitizedDom', 'tokenizedTask']);
});

test('two START_TASK sends at once start exactly one run (double-click on Send)', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), starts: 2, warden: { plan: planSeq(click('body > a')) } });
  assert.equal(run.start.ok, true);
  assert.equal(run.extraStarts.length, 1);
  assert.equal(run.extraStarts[0].ok, false);
  assert.match(run.extraStarts[0].reason, /already in progress/);
  assert.equal(run.entries.filter((e) => e.kind === 'user').length, 1);
  assert.equal(run.entries.filter((e) => e.terminal === true).length, 1);
  assert.equal(run.executed.length, 2);
});

// Laya release (plan-check.js layaRelease, 30 September 2026). The Warden attaches `review` to the
// /plan response; only a click the scan tiered state-changing by the 'unproven' default may run
// without a prompt, and only on the fine-tuned checkpoint's scores for this exact step.
const H_ST = `h${'d'.repeat(32)}`;
const H_PAY = `h${'e'.repeat(32)}`;
const STATEMENTS_LINK = { tag: 'a', type: 'a', selector: 'a.st', handle: H_ST, tier: 'state-changing', tierBasis: 'unproven', label: 'Statements', x: 10, y: 100, filled: false, fieldType: 'a', pii: false };
const PAY_BUTTON = { tag: 'button', type: 'button', selector: 'button.pay', handle: H_PAY, tier: 'state-changing', tierBasis: 'submit-keyword', label: 'Pay now', x: 10, y: 130, filled: false, fieldType: 'button', pii: false };
const review = (selector, over = {}) => ({
  model: 'laya-dhristi-plan-review', fineTuned: true, action: 'click', targetSelector: selector,
  pNavigational: 0.97, pDestructive: 0.01, pOffTask: 0.03, ...over,
});
const planWithReview = (plan, rev) => (body, n) => (n === 1
  ? { model: 'fake-planner', destination: 'cloud', plan, review: rev }
  : { model: 'fake-planner', destination: 'cloud', plan: FINISH });

const CODE = 'k'.repeat(43);
const PAIRED = { pairingCode: CODE, wardenSecret: CODE };

test('Laya release: an unproven click with a confident fine-tuned review from a paired Warden runs without a prompt', async () => {
  const run = await runTask({ ...PAIRED, task: 'download my statement', scan: scanOf([STATEMENTS_LINK]), warden: { plan: planWithReview(click('a.st'), review('a.st')) } });
  assertNoValidate(run);
  assert.equal(run.prompts.length, 0);
  assert.deepEqual(run.executed[0], { action: 'click', value: null, plannedTier: 'state-changing', handle: H_ST, requireUnprovenBasis: true });
  const f17 = run.trace.f17Steps[0];
  assert.equal(f17.gatePath, 'unattended_ok');
  assert.equal(f17.unattendedExecuteAllowed, true);
  assert.equal(run.terminal.status, 'finished');
});

for (const [name, scanEl, rev] of [
  ['a submit-keyword control is never released', PAY_BUTTON, review('button.pay')],
  ['a zero-shot (not fine-tuned) review does not release', STATEMENTS_LINK, review('a.st', { fineTuned: false })],
  ['another model name does not release', STATEMENTS_LINK, review('a.st', { model: 'rl-agent' })],
  ['a review for a different target does not release', STATEMENTS_LINK, review('a.other')],
  ['p(navigational) below 0.9 does not release', STATEMENTS_LINK, review('a.st', { pNavigational: 0.89 })],
  ['p(off task) at 0.5 does not release', STATEMENTS_LINK, review('a.st', { pOffTask: 0.5 })],
  ['p(destructive) at 0.5 does not release', STATEMENTS_LINK, review('a.st', { pDestructive: 0.5, pNavigational: 0.95 })],
  ['a non-finite probability does not release', STATEMENTS_LINK, review('a.st', { pNavigational: Number.NaN })],
  ['a skipped review does not release', STATEMENTS_LINK, { skipped: 'WARDEN_LAYA_MODEL is not set' }],
  ['no review does not release', STATEMENTS_LINK, undefined],
]) {
  test(`Laya release: ${name}`, async () => {
    const run = await runTask({ ...PAIRED, task: 'download my statement', scan: scanOf([scanEl]), warden: { plan: planWithReview(click(scanEl.selector), rev) } });
    assert.equal(run.prompts.length, 1);
    assert.match(run.prompts[0].text, /tier 'state-changing' and requires local confirmation/);
    assert.equal(run.executed.length, 0);
  });
}

test('Laya release is revoked when the live element now matches a rule; proceed re-sends without the requirement', async () => {
  const seen = []; // the harness keeps the (mutated) action object; record what each send carried
  const run = await runTask({
    ...PAIRED,
    task: 'download my statement',
    scan: scanOf([STATEMENTS_LINK]),
    choices: ['proceed'],
    warden: { plan: planWithReview(click('a.st'), review('a.st')) },
    execute: (action, n) => {
      seen.push(action.requireUnprovenBasis);
      return n === 1
        ? { tierEscalated: true, releaseRevoked: true, liveTier: 'state-changing', plannedTier: action.plannedTier }
        : { digest: 'd' };
    },
  });
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /after Laya released it/);
  assert.deepEqual(seen.slice(0, 2), [true, false]);
  assert.equal(run.executed[1].handle, H_ST);
});

test('egress: the local tier basis never reaches the Warden', async () => {
  const run = await runTask({ scan: scanOf([STATEMENTS_LINK, PAY_BUTTON]), warden: { plan: planSeq(FINISH) } });
  for (const { path, body } of run.fetchBodies) {
    for (const el of body?.elements || []) assert.equal('tierBasis' in el, false, `${path} element carries a tier basis`);
  }
});

test('Laya release: a Hindi destructive task never releases (intent coherence rewrites it to finish)', async () => {
  const run = await runTask({ task: 'मेरा खाता हटाएं', scan: scanOf([STATEMENTS_LINK]), warden: { plan: planWithReview(click('a.st'), review('a.st')) } });
  assert.equal(run.prompts.length, 0);
  assert.equal(run.executed.some((a) => a.action === 'click'), false, 'the click was rewritten to finish, not released');
  assert.equal(run.executed[0].action, 'finish');
});

// ---- Pairing (utils/warden.js, warden/pairing.py) -----------------------------------------------
import { createHash, createHmac } from 'node:crypto';

const requestMac = (secret, method, path, nonce, raw) => createHmac('sha256', secret)
  .update(`dhristi-req\n${method}\n${path}\n${nonce}\n${createHash('sha256').update(raw || '').digest('hex')}`)
  .digest('base64url');

test('pairing: every request carries a fresh nonce and a request proof the Warden can check', async () => {
  const run = await runTask({ ...PAIRED, scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(click('body > a')) } });
  assert.equal(run.terminal.status, 'finished');
  const nonces = new Set();
  for (const { path, raw, headers } of run.fetchBodies) {
    const nonce = headers['X-Dhristi-Nonce'];
    assert.match(nonce, /^[A-Za-z0-9_-]{16,128}$/, `${path} nonce`);
    assert.equal(nonces.has(nonce), false, 'nonces are never reused');
    nonces.add(nonce);
    assert.equal(headers['X-Dhristi-Auth'], requestMac(CODE, raw ? 'POST' : 'GET', path, nonce, raw), `${path} proof`);
    assert.equal(JSON.stringify(headers).includes(CODE), false, `${path} carries the code itself`);
  }
});

for (const [name, wardenSecret] of [['an unsigned impostor', null], ['a Warden with another secret', 'z'.repeat(43)]]) {
  test(`pairing: ${name} on the port is refused before any page text is sent`, async () => {
    const run = await runTask({ pairingCode: CODE, wardenSecret, scan: scanOf([STATEMENTS_LINK]), warden: { plan: planWithReview(click('a.st'), review('a.st')) } });
    assert.equal(run.start.ok, false);
    assert.equal(run.fetchBodies.some((b) => b.path === '/strip' || b.path === '/plan'), false, 'nothing but /health was sent');
    assert.equal(run.executed.length, 0);
    const card = run.entries.find((e) => e.kind === 'blocked');
    assert.match(card.text, /could not prove this extension's pairing code/);
  });
}

for (const wardenPairing of ['required', 'disabled', 'missing', undefined]) {
  test(`pairing is required: an unpaired extension refuses the run before any POST (Warden reports ${wardenPairing})`, async () => {
    const run = await runTask({
      pairingCode: null,
      wardenSecret: null,
      scan: scanOf([STATEMENTS_LINK]),
      warden: { health: () => ({ ...DEFAULT_HEALTH, pairing: wardenPairing }), plan: planWithReview(click('a.st'), { ...review('a.st'), pairingVerified: true }) },
    });
    assert.equal(run.start.ok, false);
    assert.equal(run.fetchBodies.some((b) => b.path !== '/health'), false, 'only GET /health left the browser');
    assert.equal(run.executed.length, 0);
    assert.match(run.entries.find((e) => e.kind === 'blocked').text, /Pairing is required/);
  });
}

// ---- A run is bound to the origin it started on (security review, 3 October 2026) --------------
// A navigation to another site mid-run used to carry on silently: the new page was scanned, its
// values went into the vault and the old task acted there. Now the run asks, naming the new origin,
// before scanning it; and a change between the scan and SET_VAULT or EXECUTE stops the step.
test('an origin change between steps asks, naming the new origin, before the new page is scanned', async () => {
  const tab = { id: 7, windowId: 3, url: 'https://bank.example/home' };
  const run = await runTask({
    tab,
    scan: scanOf([NEXT_LINK]),
    choices: ['stop'],
    warden: { plan: planSeq(click('body > a'), click('body > a')) },
    execute: () => { tab.url = 'https://evil.example/landing'; return { digest: 'd' }; },
  });
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /now on https:\/\/evil\.example, not https:\/\/bank\.example/);
  assert.equal(run.scans, 1, 'the new page was not scanned');
  assert.equal(run.fetchBodies.filter((b) => b.path === '/strip').length, 1);
  assert.equal(run.tabMessages.filter((m) => m.type === 'SET_VAULT').length, 1);
  assert.equal(run.terminal.status, 'stopped');
});

test('an approved origin change carries on and is not asked again', async () => {
  const tab = { id: 7, windowId: 3, url: 'https://bank.example/home' };
  const run = await runTask({
    tab,
    scan: scanOf([NEXT_LINK]),
    choices: ['proceed'],
    warden: { plan: planSeq(click('body > a'), click('body > a')) },
    execute: () => { tab.url = 'https://pay.example/checkout'; return { digest: 'd' }; },
  });
  assert.equal(run.prompts.length, 1);
  assert.equal(run.terminal.status, 'finished');
  assert.equal(run.scans, 3);
});

test('an origin change between the scan and SET_VAULT stops the step before the vault is sent', async () => {
  const tab = { id: 7, windowId: 3, url: 'https://bank.example/home' };
  const run = await runTask({
    tab,
    scan: scanOf([NEXT_LINK]),
    warden: {
      strip: (body) => { tab.url = 'https://evil.example/'; return defaultStrip(body); },
      plan: planSeq(click('body > a')),
    },
  });
  assert.equal(run.tabMessages.some((m) => m.type === 'SET_VAULT'), false);
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'error');
  assert.ok(run.entries.some((e) => e.kind === 'error' && /https:\/\/evil\.example/.test(e.text)));
});

test('a run does not start when the task tab has no readable origin', async () => {
  const run = await runTask({ tab: { id: 7, windowId: 3 }, scan: scanOf([NEXT_LINK]), warden: { plan: planSeq(FINISH) } });
  assert.equal(run.start.ok, false);
  assert.equal(run.fetchBodies.some((b) => b.path === '/strip'), false);
});

// ---- A signed /health before every /strip (security review, 3 October 2026) --------------------
// /strip carries the raw page. A process that took over the Warden's port mid-run was detected only
// by the /strip response's missing proof, after it had the body (ROAST round 28). Each /strip is now
// preceded by a GET /health whose pairing proof must verify; an unproven answer sends no /strip.
test('each /strip is preceded by a verified /health; a takeover after step 1 receives no /strip body', async () => {
  let takenOver = false;
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { plan: planSeq(click('body > a')) },
    execute: () => { takenOver = true; return { digest: 'd' }; },
    signs: (path) => !takenOver,
  });
  const paths = run.fetchBodies.map((b) => b.path);
  const firstStrip = paths.indexOf('/strip');
  assert.equal(paths[firstStrip - 1], '/health', 'the first /strip follows a /health');
  assert.equal(paths.filter((p) => p === '/strip').length, 1, 'no /strip after the takeover');
  assert.equal(paths.at(-1), '/health', 'the takeover saw only a body-less /health');
  assert.equal(run.terminal.status, 'error');
  assert.ok(run.entries.some((e) => e.kind === 'error' && /pairing/i.test(e.text)));
});

// The panel shows Stop as soon as the task is accepted (a user entry with no terminal marker), but a
// Stop pressed during the start checks (health, site access) was a no-op and the run started anyway.
test('Stop pressed while the run is still starting stops it before anything is scanned or sent', async () => {
  let stopped = false;
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: {
      plan: planSeq(click('body > a')),
      health: ({ send, runtimeMessages }) => {
        const accepted = runtimeMessages.some((m) => m.type === 'SESSION_UPDATE' && m.entries.some((e) => e.kind === 'user'));
        if (accepted && !stopped) { stopped = true; send({ type: 'STOP_TASK' }); }
        return DEFAULT_HEALTH;
      },
    },
  });
  assert.equal(stopped, true);
  assert.equal(run.start.ok, false);
  assert.equal(run.scans, 0);
  assert.equal(run.fetchBodies.some((b) => b.path === '/strip' || b.path === '/plan'), false);
  assert.equal(run.executed.length, 0);
  const terminals = run.entries.filter((e) => e.terminal === true);
  assert.deepEqual(terminals.map((e) => e.status), ['stopped']);
});

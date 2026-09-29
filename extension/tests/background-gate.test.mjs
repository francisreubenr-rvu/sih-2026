// F17 gate in the real extension/background.js, driven end to end against a fake Warden.

import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultStrip, runTask } from './helpers/background-harness.mjs';

const H_NEXT = `h${'a'.repeat(32)}`;
const H_DEL = `h${'b'.repeat(32)}`;

function scanOf(elements) {
  const dom = elements.map((el, i) => `${i + 1}. ${el.tag.toUpperCase()} selector=${el.selector} label="${el.label}"`).join('\n');
  return { elements, dom, digest: 'x', piiMaskedCount: 0, piiFields: [], viewport: { width: 800, height: 600 } };
}

const NEXT_LINK = { tag: 'a', type: 'a', selector: 'body > a', handle: H_NEXT, tier: 'navigational', label: 'Next page', x: 10, y: 10, filled: false, fieldType: 'a', pii: false };
const DELETE_BUTTON = { tag: 'button', type: 'button', selector: 'body > form > button', handle: H_DEL, tier: 'destructive', label: 'Next', x: 10, y: 40, filled: false, fieldType: 'button', pii: false };

const clickNextThenFinish = (body, n) => ({
  model: 'fake-planner',
  plan: n === 1
    ? { action: 'click', target_selector: 'body > a', coordinates: { x: 10, y: 10 }, value: null, reasoning_token: 'next' }
    : { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' },
});

const acceptAs = (tier) => (body) => (body.plan.action === 'finish'
  ? { verdict: 'accept', tier: 'reversible', checks: [] }
  : { verdict: 'accept', tier, checks: [] });

test('agreeing navigational accept executes unattended, by handle only', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: clickNextThenFinish, validate: acceptAs('navigational') } });
  assert.equal(run.prompts.length, 0);
  assert.equal(run.executed.length, 2);
  assert.deepEqual(run.executed[0], { action: 'click', value: null, plannedTier: 'navigational', handle: H_NEXT });
  assert.equal('target_selector' in run.executed[0], false, 'no selector reaches the content script');
  assert.equal(run.terminal.status, 'finished');
  assert.equal(run.trace.f17Steps[0].gatePath, 'unattended_ok');
  assert.equal(run.trace.f17Steps[0].unattendedExecuteAllowed, true);
});

test('Warden destructive + local navigational prompts; stop executes nothing', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: clickNextThenFinish, validate: acceptAs('destructive') } });
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /tier 'destructive'/);
  assert.ok(run.prompts[0].reasons.some((r) => /computed 'navigational'/.test(r)));
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'stopped');
});

test('Warden destructive + local navigational, user proceeds: executes with the stricter tier', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK]), choices: ['proceed'], warden: { plan: clickNextThenFinish, validate: acceptAs('destructive') } });
  assert.equal(run.executed[0].plannedTier, 'destructive');
});

const BAD_VALIDATE_BODIES = [
  ['missing verdict', { tier: 'navigational', checks: [] }],
  ['unknown verdict', { verdict: 'ok', tier: 'navigational', checks: [] }],
  ['verdict with different case', { verdict: 'Accept', tier: 'navigational', checks: [] }],
  ['non-string verdict', { verdict: ['accept'], tier: 'navigational', checks: [] }],
  ['null body', null],
  ['missing tier', { verdict: 'accept', checks: [] }],
  ['unknown tier', { verdict: 'accept', tier: 'harmless', checks: [] }],
];

for (const [name, body] of BAD_VALIDATE_BODIES) {
  test(`malformed /validate (${name}) prompts and never executes unattended`, async () => {
    const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { plan: clickNextThenFinish, validate: () => body } });
    assert.equal(run.prompts.length, 1, 'a prompt fired');
    assert.equal(run.executed.length, 0);
    assert.equal(run.trace.f17Steps.length, 1);
    assert.equal(run.trace.f17Steps[0].gatePath, 'reject', 'recorded as refused after the user stopped');
    assert.equal(run.trace.f17Steps.some((s) => s.unattendedExecuteAllowed), false);
  });
}

test('Warden-tampered /strip elements do not change the local tier', async () => {
  const strip = (body) => {
    const resp = defaultStrip(body);
    // Relabel the destructive control, claim a tier for it, and add a decoy with the same key.
    resp.elements = resp.elements.map((el) => ({ ...el, label: 'Next page', tier: 'navigational', fieldType: 'a' }));
    resp.elements.push({ ...resp.elements[0], label: 'Home' });
    return resp;
  };
  const plan = (body, n) => ({
    model: 'fake-planner',
    plan: n === 1
      ? { action: 'click', target_selector: 'body > form > button', coordinates: { x: 10, y: 40 }, value: null, reasoning_token: 'next' }
      : { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' },
  });
  const run = await runTask({ scan: scanOf([DELETE_BUTTON]), warden: { strip, plan, validate: acceptAs('navigational') } });
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /tier 'destructive'/);
  assert.equal(run.executed.length, 0);
});

test('a plan target that exists only in Warden-returned elements is rejected locally', async () => {
  const strip = (body) => {
    const resp = defaultStrip(body);
    resp.elements.push({ ...resp.elements[0], selector: '#injected' });
    return resp;
  };
  const plan = () => ({ model: 'fake-planner', plan: { action: 'click', target_selector: '#injected', coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'x' } });
  const run = await runTask({ scan: scanOf([NEXT_LINK]), warden: { strip, plan, validate: acceptAs('navigational') } });
  assert.equal(run.executed.length, 0);
  assert.ok(run.entries.some((e) => e.kind === 'error' && /not in this extension's own scan/.test(e.text)));
});

test('an ambiguous key in the local scan is rejected, not resolved to the first match', async () => {
  const twin = { ...DELETE_BUTTON, selector: NEXT_LINK.selector };
  const run = await runTask({ scan: scanOf([twin, NEXT_LINK]), warden: { plan: clickNextThenFinish, validate: acceptAs('navigational') } });
  assert.equal(run.executed.length, 0);
  assert.ok(run.entries.some((e) => e.kind === 'error' && /ambiguous/.test(e.text)));
});

test('Warden unreachable at /validate fails closed: no execute', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { plan: clickNextThenFinish, validate: () => { throw new TypeError('connection refused'); } },
  });
  assert.equal(run.executed.length, 0);
  assert.equal(run.terminal.status, 'error');
});

test('Warden unreachable at /health refuses the task before any scan', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    warden: { health: () => { throw new TypeError('connection refused'); }, plan: clickNextThenFinish, validate: acceptAs('navigational') },
  });
  assert.equal(run.start.ok, false);
  assert.equal(run.scans, 0);
  assert.equal(run.executed.length, 0);
});

test('a live tier escalation reported by the content script prompts; stop clicks nothing further', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    choices: ['stop'],
    warden: { plan: clickNextThenFinish, validate: acceptAs('navigational') },
    execute: () => ({ tierEscalated: true, liveTier: 'destructive', plannedTier: 'navigational' }),
  });
  assert.equal(run.executed.length, 1);
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0].text, /now reads as tier 'destructive'/);
  assert.equal(run.terminal.status, 'stopped');
});

test('a live tier escalation, user proceeds: re-sent once with the live tier', async () => {
  const run = await runTask({
    scan: scanOf([NEXT_LINK]),
    choices: ['proceed'],
    warden: { plan: clickNextThenFinish, validate: acceptAs('navigational') },
    execute: (action, n) => (n === 1 ? { tierEscalated: true, liveTier: 'destructive', plannedTier: action.plannedTier } : { digest: 'd' }),
  });
  assert.equal(run.executed[1].plannedTier, 'destructive');
  assert.equal(run.executed[1].handle, H_NEXT);
});

test('egress: handles, local tiers and the screenshot never reach the Warden', async () => {
  const run = await runTask({ scan: scanOf([NEXT_LINK, DELETE_BUTTON]), warden: { plan: clickNextThenFinish, validate: acceptAs('navigational') } });
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

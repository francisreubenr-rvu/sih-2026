// Pipeline trace (TRACE_UPDATE / GET_TRACE), REVEAL_TOKEN and HIGHLIGHT_REDACTIONS in the real
// extension/background.js, against a fake Warden that returns a seeded vault value.

import assert from 'node:assert/strict';
import test from 'node:test';

import { PANEL_SENDER, runTask } from './helpers/background-harness.mjs';

const SECRET = 'francis.reuben@example.com';
const H_FIELD = `h${'c'.repeat(32)}`;
const H_SEND = `h${'d'.repeat(32)}`;
// A real 1x1 PNG, so the trace's width/height come from its IHDR chunk.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const FIELD = { tag: 'input', type: 'email', selector: '#to', handle: H_FIELD, tier: 'state-changing', label: 'Recipient', x: 10, y: 10, filled: false, fieldType: 'email', pii: false };
// A label that repeats the value: an older Warden returned labels untouched.
const SEND = { tag: 'button', type: 'button', selector: '#send', handle: H_SEND, tier: 'navigational', label: `Next: mail ${SECRET}`, x: 10, y: 40, filled: false, fieldType: 'button', pii: false };

function scanOf(elements, extra = {}) {
  const dom = elements.map((el, i) => `${i + 1}. ${el.tag.toUpperCase()} selector=${el.selector} label="${el.label}"`).join('\n');
  return { elements, dom, digest: 'x', piiMaskedCount: 0, piiFields: [], viewport: { width: 800, height: 600 }, ...extra };
}

// Tokenizes the task and DOM like the Warden, leaves element labels raw (the pre-v5 shape), and
// reports v5 decisions with token/source/layer/score and no value.
function seededStrip(body) {
  return {
    tokenizedTask: body.task.split(SECRET).join('EMAIL#1'),
    sanitizedDom: body.dom.split(SECRET).join('EMAIL#1'),
    elements: body.elements.map((el) => ({ ...el, pii: false })),
    tokens: { 'EMAIL#1': SECRET },
    uncertain: [],
    decisions: [
      { pattern: 'email', token: 'EMAIL#1', source: 'task', layer: 'regex', score: 1 },
      { pattern: 'email', token: 'EMAIL#1', source: 'dom', layer: 'regex', score: 1 },
    ],
    warden: 'fake',
  };
}

const TYPE_TOKEN = { action: 'type', target_selector: '#to', coordinates: { x: 10, y: 10 }, value: 'EMAIL#1', reasoning_token: 'fill the recipient' };
const FINISH = { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' };
const planSeq = (...plans) => (body, n) => ({ model: 'groq/fake-70b', destination: 'cloud', latencyMs: 12, switched: [], plan: plans[n - 1] || FINISH });

function runSeeded(extra = {}) {
  return runTask({
    task: `send the report to ${SECRET}`,
    scan: scanOf([FIELD, SEND]),
    capture: PNG_1x1,
    choices: ['proceed'],
    warden: { strip: seededStrip, plan: planSeq(TYPE_TOKEN) },
    ...extra,
  });
}

test('no vault value appears in any TRACE_UPDATE, GET_TRACE, or the /plan body', async () => {
  const run = await runSeeded();
  assert.equal(run.terminal.status, 'finished');
  assert.ok(run.traceUpdates.length > 10);
  for (const trace of [...run.traceUpdates, run.pipelineTrace]) {
    assert.equal(JSON.stringify(trace).includes(SECRET), false, 'a vault value reached the trace');
  }
  for (const b of run.fetchBodies.filter((f) => f.path === '/plan')) {
    assert.equal(b.raw.includes(SECRET), false, 'a vault value reached /plan');
  }
  // The label that repeated the value went out tokenized.
  const planBody = run.fetchBodies.find((b) => b.path === '/plan').body;
  assert.equal(planBody.elements.find((el) => el.selector === '#send').label, 'Next: mail EMAIL#1');
});

test('the step trace carries every contract field with measured values', async () => {
  const run = await runSeeded();
  const step1 = run.traceUpdates.filter((t) => t?.step === 1).at(-1);
  assert.deepEqual(Object.keys(step1.stages), ['perceive', 'redact', 'plan', 'check', 'act']);
  for (const [name, stage] of Object.entries(step1.stages)) {
    assert.equal(stage.status, 'done', `${name} is done`);
    assert.equal(typeof stage.ms, 'number', `${name} has a measured ms`);
    assert.ok(stage.ms >= 0);
  }
  assert.deepEqual(step1.planner, { destination: 'cloud', provider: 'groq', model: 'groq/fake-70b' });
  assert.deepEqual(step1.scene, { controls: 2 });
  assert.deepEqual(step1.redaction.replaced, [
    { token: 'EMAIL#1', type: 'EMAIL', source: 'task', layer: 'regex', score: 1 },
    { token: 'EMAIL#1', type: 'EMAIL', source: 'dom', layer: 'regex', score: 1 },
  ]);
  assert.equal(step1.redaction.uncertainAsked, 0);
  assert.equal(step1.redaction.screenMasked, 0);
  assert.deepEqual(step1.screenshot, { dataUrl: PNG_1x1, width: 1, height: 1 });
  const planFetch = run.fetchBodies.find((b) => b.path === '/plan');
  assert.equal(step1.outbound.path, '/plan');
  assert.equal(step1.outbound.bytes, Buffer.byteLength(planFetch.raw));
  assert.deepEqual(step1.outbound.body, planFetch.body);
  assert.deepEqual(step1.inbound, {
    action: 'type', target: '#to', value: 'EMAIL#1', reasoning: 'fill the recipient', model: 'groq/fake-70b', latencyMs: 12, switched: [],
  });
  assert.equal(step1.check.tier, 'state-changing');
  assert.equal(step1.check.gate, 'confirm');
  assert.equal(step1.check.choice, 'proceed');
  assert.ok(step1.check.checks.every((c) => c.pass === true && 'detail' in c));
  assert.deepEqual(step1.check.checks.map((c) => c.name), ['action-allowed', 'no-unexpected-keys', 'selector-in-scene', 'coordinates-finite', 'tier-computed', 'intent-coherence']);
  assert.deepEqual(step1.act, { action: 'type', target: '#to', outcome: 'done', error: null });
  // GET_TRACE answers the last step's whole trace, identical to the last TRACE_UPDATE.
  assert.deepEqual(run.pipelineTrace, run.traceUpdates.at(-1));
  assert.equal(run.pipelineTrace.step, 2);
});

test('each stage goes active before it is done, in pipeline order', async () => {
  const run = await runSeeded();
  const seen = [];
  let prev = null;
  for (const t of run.traceUpdates.filter((u) => u?.step === 1)) {
    for (const [name, stage] of Object.entries(t.stages)) {
      const key = `${name}:${stage.status}`;
      if (stage.status !== 'idle' && (!prev || prev.stages[name].status !== stage.status)) seen.push(key);
    }
    prev = t;
  }
  const order = ['perceive:active', 'perceive:done', 'redact:active', 'redact:done', 'plan:active', 'plan:done', 'check:active', 'check:done', 'act:active', 'act:done'];
  assert.deepEqual(seen.filter((k) => order.includes(k)), order);
});

test('a literal typed value is masked in inbound', async () => {
  const literal = { ...TYPE_TOKEN, value: 'hunter2' };
  const run = await runSeeded({ warden: { strip: seededStrip, plan: planSeq(literal) } });
  const step1 = run.traceUpdates.filter((t) => t?.step === 1).at(-1);
  assert.equal(step1.inbound.value, '*******');
  for (const t of run.traceUpdates) assert.equal(JSON.stringify(t).includes('hunter2'), false);
});

test('screenshot fails closed: a capture that cannot be masked is null in the trace', async () => {
  const run = await runTask({
    scan: scanOf([FIELD], { piiFields: [{ x: 0, y: 0, width: 10, height: 10, kind: 'field:email', confidence: 'field-value' }] }),
    capture: PNG_1x1,
    warden: { plan: planSeq(FINISH) },
  });
  // Node has no createImageBitmap / Image, so masking throws; the capture must not survive.
  const t = run.pipelineTrace;
  assert.deepEqual(t.screenshot, { dataUrl: null, width: null, height: null });
  assert.equal(JSON.stringify(run.traceUpdates).includes(PNG_1x1.slice(30)), false);
});

test('a rejected plan marks check as error and plan goes active again', async () => {
  const bad = { ...TYPE_TOKEN, target_selector: '#nope' };
  const run = await runSeeded({ warden: { strip: seededStrip, plan: planSeq(bad, TYPE_TOKEN) } });
  const step1 = run.traceUpdates.filter((t) => t?.step === 1);
  const rejected = step1.find((t) => t.stages.check.status === 'error');
  assert.ok(rejected);
  assert.equal(rejected.check.gate, 'reject');
  assert.match(rejected.stages.check.detail, /selector-in-scene/);
  const replanned = step1.find((t) => t.stages.plan.status === 'active' && /re-planning/.test(t.stages.plan.detail || ''));
  assert.ok(replanned);
});

test('HIGHLIGHT_REDACTIONS goes to the tab after /strip; CLEAR_HIGHLIGHTS and END_TASK at run end', async () => {
  const run = await runSeeded();
  const types = run.tabMessages.map((m) => m.type);
  const hl = run.tabMessages.find((m) => m.type === 'HIGHLIGHT_REDACTIONS');
  assert.deepEqual(hl.tokens, { 'EMAIL#1': SECRET });
  assert.ok(types.indexOf('SET_VAULT') < types.indexOf('HIGHLIGHT_REDACTIONS'));
  assert.ok(types.lastIndexOf('CLEAR_HIGHLIGHTS') > types.lastIndexOf('EXECUTE_ACTION'));
  assert.equal(types.at(-1), 'END_TASK');
});

test('REVEAL_TOKEN answers the side panel only, from the live vault only', async () => {
  const run = await runSeeded({
    onPrompt: async (prompt, { send }) => ({
      panel: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, PANEL_SENDER),
      panelWithQuery: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { ...PANEL_SENDER, url: `${PANEL_SENDER.url}?x=1#y` }),
      contentScript: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { id: 'dhristi-test', url: 'https://example.com/', tab: { id: 7 } }),
      panelUrlInTab: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { ...PANEL_SENDER, tab: { id: 7 } }),
      otherPage: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { id: 'dhristi-test', url: 'chrome-extension://dhristi-test/options.html' }),
      lookalike: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { id: 'dhristi-test', url: 'chrome-extension://dhristi-test/evil/sidepanel.html' }),
      foreign: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, { id: 'other-extension', url: PANEL_SENDER.url }),
      unknown: await send({ type: 'REVEAL_TOKEN', token: 'EMAIL#9' }, PANEL_SENDER),
      malformed: await send({ type: 'REVEAL_TOKEN', token: 'toJSON' }, PANEL_SENDER),
    }),
  });
  const r = run.hookResults[0];
  assert.deepEqual(r.panel, { token: 'EMAIL#1', value: SECRET });
  assert.deepEqual(r.panelWithQuery, { token: 'EMAIL#1', value: SECRET });
  for (const key of ['contentScript', 'panelUrlInTab', 'otherPage', 'lookalike', 'unknown', 'malformed']) {
    assert.equal(typeof r[key].error, 'string', `${key} was refused`);
    assert.equal('value' in r[key], false, `${key} carries no value`);
  }
  assert.equal(r.foreign, undefined, 'a foreign sender gets no answer at all');
  // The vault ends with the run.
  const after = await run.send({ type: 'REVEAL_TOKEN', token: 'EMAIL#1' }, PANEL_SENDER);
  assert.equal(typeof after.error, 'string');
  // Nothing the worker broadcast carries the value (the user's own task text is the one place it is,
  // by design, in the transcript's `user` entry).
  const broadcast = run.runtimeMessages.filter((m) => m.type !== 'SESSION_UPDATE');
  assert.equal(JSON.stringify(broadcast).includes(SECRET), false);
});

test('a user-stripped uncertain span is reported with layer user', async () => {
  let calls = 0;
  const strip = (body) => {
    calls += 1;
    const resp = seededStrip(body);
    if (calls === 1) {
      resp.uncertain = [{ id: 'PERSONNAME#1', token: 'PERSONNAME#1', label: 'person', score: 0.5, preview: 'Ravi', source: 'dom' }];
      return resp;
    }
    resp.tokens['PERSONNAME#1'] = 'Ravi';
    resp.decisions.push({ pattern: 'person', token: 'PERSONNAME#1', source: 'dom', layer: 'gliner', score: 0.5 });
    return resp;
  };
  const run = await runSeeded({
    warden: { strip, plan: planSeq(FINISH) },
    // The uncertain prompt is answered 'strip' (anything but 'keep').
    choices: ['strip'],
  });
  const t = run.traceUpdates.filter((u) => u?.step === 1).at(-1);
  assert.equal(t.redaction.uncertainAsked, 1);
  assert.deepEqual(t.redaction.replaced.find((row) => row.token === 'PERSONNAME#1'), { token: 'PERSONNAME#1', type: 'PERSONNAME', source: 'dom', layer: 'user', score: 0.5 });
  for (const u of run.traceUpdates) assert.equal(JSON.stringify(u).includes('Ravi'), false);
});

// Security review, 3 October 2026 (HIGH): the Warden mints token ids per /strip call, so
// "PERSONNAME#1" names a different value on another page. A remembered 'keep' keyed by the id alone
// kept a value nobody was asked about. Each answer now carries the value it was given for, and the
// remembered answers end with the run.
test('an uncertain-PII answer is bound to its value and does not outlive the run', async () => {
  const stripBodies = [];
  const strip = (body) => {
    stripBodies.push(structuredClone(body));
    const resp = seededStrip(body);
    const decided = body.resolved['PERSONNAME#1'];
    if (!decided) resp.uncertain = [{ id: 'PERSONNAME#1', token: 'PERSONNAME#1', label: 'person', score: 0.5, preview: 'Ravi', source: 'dom' }];
    return resp;
  };
  const run = await runSeeded({
    warden: { strip, plan: planSeq(FINISH) },
    choices: [{ 'PERSONNAME#1': 'keep' }, { 'PERSONNAME#1': 'keep' }],
    again: ['second task'],
  });
  assert.equal(run.laterStarts[0].ok, true);
  assert.deepEqual(stripBodies[0].resolved, {});
  assert.deepEqual(stripBodies[1].resolved, { 'PERSONNAME#1': { decision: 'keep', value: 'Ravi' } });
  const secondRunFirst = stripBodies[2];
  assert.deepEqual(secondRunFirst.resolved, {}, 'a new run starts with no remembered answers');
  assert.equal(run.prompts.filter((p) => p.kind === 'uncertain-pii').length, 2, 'the second run asked again');
});

test('plan history carries a typed vault token, never a literal value', async () => {
  const run = await runSeeded({ warden: { strip: seededStrip, plan: planSeq(TYPE_TOKEN, FINISH) } });
  const second = run.fetchBodies.filter((b) => b.path === '/plan')[1].body;
  assert.deepEqual(second.history.at(-1), { stepNumber: 1, action: 'type', target: '#to', status: 'ok', value: 'EMAIL#1' });

  const literal = { ...TYPE_TOKEN, value: 'hunter2' };
  const lit = await runSeeded({ warden: { strip: seededStrip, plan: planSeq(literal, FINISH) } });
  const body = lit.fetchBodies.filter((b) => b.path === '/plan')[1];
  assert.equal('value' in body.body.history.at(-1), false, 'a masked literal is left out of history');
  assert.equal(body.raw.includes('hunter2'), false);
});

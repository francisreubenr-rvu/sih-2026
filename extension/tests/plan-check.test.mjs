// Unit tests for extension/utils/plan-check.js (the local port of warden/validate.py's
// deterministic checks plus the always-ask rule) and the pure helpers in utils/pipeline-trace.js.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTION_KEYS, ALLOWED_ACTIONS, decideLocalGate, questionForTier, runPlanChecks } from '../utils/plan-check.js';
import {
  createPipelineTrace, inboundFromPlan, jsonByteLength, pngSize, replacedFromStrip, toValueToken, tokenizeWithVault,
} from '../utils/pipeline-trace.js';

const SCENE = [
  { selector: 'body > a', tier: 'navigational', handle: 'h1' },
  { selector: '#del', tier: 'destructive', handle: 'h2' },
  { selector: '#q', tier: 'reversible', handle: 'h3' },
  { selector: '#twin', tier: 'navigational', handle: 'h4' },
  { selector: '#twin', tier: 'destructive', handle: 'h5' },
];
const plan = (over = {}) => ({ action: 'click', target_selector: 'body > a', coordinates: { x: 1, y: 2 }, value: null, reasoning_token: 'r', ...over });
const byName = (result) => Object.fromEntries(result.checks.map((c) => [c.name, c]));

test('the closed action and key sets match warden/groq_client.py', () => {
  assert.deepEqual([...ALLOWED_ACTIONS], ['click', 'type', 'scroll', 'wait', 'finish']);
  assert.deepEqual([...ACTION_KEYS].sort(), ['action', 'coordinates', 'reasoning_token', 'target_selector', 'value']);
});

test('a valid navigational click passes every check', () => {
  const r = runPlanChecks(plan(), SCENE);
  assert.equal(r.ok, true);
  assert.equal(r.tier, 'navigational');
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.checks.map((c) => c.name), ['action-allowed', 'no-unexpected-keys', 'selector-in-scene', 'coordinates-finite', 'tier-computed', 'intent-coherence']);
});

test('an unknown action fails action-allowed and tier-computed', () => {
  const r = runPlanChecks(plan({ action: 'hover' }), SCENE);
  const c = byName(r);
  assert.equal(r.ok, false);
  assert.equal(c['action-allowed'].pass, false);
  assert.equal(c['tier-computed'].pass, false);
  assert.equal(r.tier, null);
});

test('extra keys fail no-unexpected-keys, and are named', () => {
  const r = runPlanChecks(plan({ url: 'x', eval: 1 }), SCENE);
  assert.equal(byName(r)['no-unexpected-keys'].pass, false);
  assert.match(byName(r)['no-unexpected-keys'].detail, /\["eval","url"\]/);
  assert.equal(r.ok, false);
});

test('a non-object plan fails without throwing', () => {
  for (const bad of [null, 'click', ['click'], 42]) {
    const r = runPlanChecks(bad, SCENE);
    assert.equal(r.ok, false);
    assert.equal(byName(r)['no-unexpected-keys'].pass, false);
  }
});

test('selector-in-scene resolves against the local scan, exactly once', () => {
  assert.equal(byName(runPlanChecks(plan({ target_selector: '#missing' }), SCENE))['selector-in-scene'].pass, false);
  const twin = runPlanChecks(plan({ target_selector: '#twin' }), SCENE);
  assert.equal(byName(twin)['selector-in-scene'].pass, false);
  assert.match(byName(twin)['selector-in-scene'].detail, /ambiguous/);
  assert.equal(byName(runPlanChecks(plan({ target_selector: 42 }), SCENE))['selector-in-scene'].pass, false);
});

test('click/type without a selector fails; scroll/wait/finish without one passes', () => {
  assert.equal(runPlanChecks(plan({ target_selector: null }), SCENE).ok, false);
  assert.equal(runPlanChecks(plan({ action: 'type', target_selector: null }), SCENE).ok, false);
  for (const action of ['scroll', 'wait', 'finish']) {
    const r = runPlanChecks(plan({ action, target_selector: null }), SCENE);
    assert.equal(r.ok, true, action);
    assert.equal(r.tier, 'reversible');
  }
  // A non-null selector on a non-targeted action must still be in the scene (validate.py rule).
  assert.equal(runPlanChecks(plan({ action: 'scroll', target_selector: '#missing' }), SCENE).ok, false);
});

test('coordinates must be finite and non-negative', () => {
  for (const coordinates of [undefined, null, { x: 1 }, { x: -1, y: 0 }, { x: Infinity, y: 0 }, { x: NaN, y: 0 }, { x: '1', y: 0 }, [1, 2]]) {
    assert.equal(byName(runPlanChecks(plan({ coordinates }), SCENE))['coordinates-finite'].pass, false, JSON.stringify(coordinates));
  }
  assert.equal(byName(runPlanChecks(plan({ coordinates: { x: 0, y: 0 } }), SCENE))['coordinates-finite'].pass, true);
});

test('type is at least state-changing, from the local tier', () => {
  assert.equal(runPlanChecks(plan({ action: 'type', target_selector: '#q', value: 'x' }), SCENE).tier, 'state-changing');
  assert.equal(runPlanChecks(plan({ target_selector: '#del' }), SCENE).tier, 'destructive');
});

test('a precomputed tier is used as given; a tier error fails tier-computed', () => {
  assert.equal(runPlanChecks(plan(), SCENE, { tier: 'navigational', tierError: null }).tier, 'navigational');
  const failed = runPlanChecks(plan(), SCENE, { tier: null, tierError: 'boom' });
  assert.equal(failed.ok, false);
  assert.equal(byName(failed)['tier-computed'].detail, 'boom');
  const unknown = runPlanChecks(plan(), SCENE, { tier: 'harmless', tierError: null });
  assert.equal(unknown.ok, false, 'an unknown tier is not a tier');
});

test('intent coherence fails only when the rewrite was skipped', () => {
  const r = runPlanChecks(plan(), SCENE, { destructiveIntent: true, hasDestructiveControl: false });
  assert.equal(byName(r)['intent-coherence'].pass, false);
  assert.equal(runPlanChecks(plan({ action: 'finish', target_selector: null }), SCENE, { destructiveIntent: true, hasDestructiveControl: false, intentOverridden: true }).ok, true);
  assert.equal(runPlanChecks(plan(), SCENE, { destructiveIntent: true, hasDestructiveControl: true }).ok, true);
});

test('decideLocalGate: F17 is not weakened', () => {
  assert.equal(decideLocalGate({ checksPassed: true, localTier: null }).path, 'reject');
  assert.equal(decideLocalGate({ checksPassed: true, localTier: 'harmless' }).path, 'reject');
  assert.equal(decideLocalGate({ checksPassed: false, localTier: 'reversible' }).path, 'reject');
  assert.equal(decideLocalGate({ checksPassed: 'yes', localTier: 'reversible' }).path, 'reject');
  assert.equal(decideLocalGate({ checksPassed: true, localTier: 'destructive' }).path, 'ask');
  assert.equal(decideLocalGate({ checksPassed: true, localTier: 'state-changing' }).path, 'confirm');
  assert.equal(decideLocalGate({ checksPassed: true, localTier: 'navigational' }).path, 'unattended');
  assert.equal(decideLocalGate({ checksPassed: true, localTier: 'reversible' }).path, 'unattended');
});

test('questionForTier names the tier and target', () => {
  assert.equal(questionForTier('destructive', { target_selector: '#del' }), 'This plan is classified destructive and acts on #del. It changes state that may not be reversible. Proceed?');
  assert.match(questionForTier('destructive', {}), /the selected element/);
});

test('toValueToken passes tokens and integers, masks anything else', () => {
  assert.equal(toValueToken('EMAIL#1'), 'EMAIL#1');
  assert.equal(toValueToken('300'), '300');
  assert.equal(toValueToken('hunter2'), '*******');
  assert.equal(toValueToken('mail EMAIL#1'), '************');
  assert.equal(toValueToken(''), null);
  assert.equal(toValueToken(null), null);
  assert.equal(toValueToken(12), '12');
  assert.equal(toValueToken('x'.repeat(40)), '*'.repeat(18));
});

test('replacedFromStrip lists tokens and types, never values; falls back to the tokens map', () => {
  const rows = replacedFromStrip({
    tokens: { 'EMAIL#1': 'a@b.co' },
    decisions: [
      { token: 'EMAIL#1', source: 'task', layer: 'regex', score: 1, pattern: 'email' },
      { token: 'EMAIL#1', source: 'task', layer: 'regex', score: 1, pattern: 'email' },
      { token: 'bad token', source: 'task', layer: 'regex', score: 1 },
      { pattern: 'email', score: 1, layer: 'regex' },
    ],
  });
  assert.deepEqual(rows, [{ token: 'EMAIL#1', type: 'EMAIL', source: 'task', layer: 'regex', score: 1 }]);
  const fallback = replacedFromStrip({ tokens: { 'PHONE#2': '9876543210' }, decisions: [{ pattern: 'phone', score: 1, layer: 'regex' }] });
  assert.deepEqual(fallback, [{ token: 'PHONE#2', type: 'PHONE', source: null, layer: null, score: null }]);
  assert.equal(JSON.stringify(fallback).includes('9876543210'), false);
});

test('inboundFromPlan masks the value and bounds the reasoning', () => {
  const inbound = inboundFromPlan({ action: 'type', target_selector: '#q', value: 'secret', reasoning_token: 'r'.repeat(900) }, { model: 'm', latencyMs: 5, switched: ['a', 3] });
  assert.equal(inbound.value, '******');
  assert.equal(inbound.reasoning.length, 500);
  assert.deepEqual(inbound.switched, ['a']);
});

test('pngSize reads IHDR, and refuses to guess for anything else', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.deepEqual(pngSize(png), { width: 1, height: 1 });
  assert.deepEqual(pngSize('data:image/jpeg;base64,/9j/4AAQ'), { width: null, height: null });
  assert.deepEqual(pngSize('data:image/png;base64,iVBORw0KGgo='), { width: null, height: null });
  assert.deepEqual(pngSize(null), { width: null, height: null });
});

test('jsonByteLength counts UTF-8 bytes of the serialized body', () => {
  assert.equal(jsonByteLength({ a: 'é' }), Buffer.byteLength(JSON.stringify({ a: 'é' })));
});

test('tokenizeWithVault replaces longest values first and ignores 1-char values', () => {
  const tokens = { 'PERSONNAME#1': 'Ravi', 'PERSONNAME#2': 'Ravi Kumar', 'X#1': 'a' };
  assert.equal(tokenizeWithVault('Call Ravi Kumar or Ravi', tokens), 'Call PERSONNAME#2 or PERSONNAME#1');
  assert.equal(tokenizeWithVault('a label', tokens), 'a label');
});

test('pipeline trace: ms is measured between active and the next status, else null', () => {
  const p = createPipelineTrace();
  assert.equal(p.snapshot(), null);
  p.begin(3, 1);
  p.stage('perceive', 'done', 'never went active');
  assert.equal(p.snapshot().stages.perceive.ms, null);
  p.stage('plan', 'active');
  assert.equal(p.activeStage(), 'plan');
  p.stage('plan', 'done', 'ok');
  const s = p.snapshot();
  assert.equal(s.runId, 3);
  assert.equal(typeof s.stages.plan.ms, 'number');
  assert.equal(s.stages.plan.detail, 'ok');
  assert.equal(p.activeStage(), null);
  p.stage('bogus', 'active');
  p.stage('act', 'bogus');
  assert.equal('bogus' in p.snapshot().stages, false);
  assert.equal(p.snapshot().stages.act.status, 'idle');
  // A snapshot is a copy: later writes do not alias an update already sent.
  const before = p.snapshot();
  p.set('scene', { controls: 9 });
  assert.equal(before.scene.controls, 0);
});

// ---- layaRelease ---------------------------------------------------------------------------------
import { layaRelease, LAYA_RELEASE_MIN_NAVIGATIONAL } from '../utils/plan-check.js';

const UNPROVEN = { selector: 'a.st', tier: 'state-changing', tierBasis: 'unproven' };
const goodReview = (over = {}) => ({ model: 'laya-dhristi-plan-review', fineTuned: true, action: 'click', targetSelector: 'a.st', pNavigational: 0.95, pDestructive: 0.02, pOffTask: 0.1, ...over });
const clickSt = { action: 'click', target_selector: 'a.st' };

test('layaRelease releases only the unproven state-changing click with a confident fine-tuned review', () => {
  assert.equal(layaRelease({ plan: clickSt, sceneElement: UNPROVEN, review: goodReview(), destructiveIntent: false }).released, true);
  assert.equal(LAYA_RELEASE_MIN_NAVIGATIONAL, 0.9);
});

test('layaRelease refuses everything else', () => {
  const cases = [
    { plan: { ...clickSt, action: 'type' } },
    { sceneElement: { ...UNPROVEN, tierBasis: 'submit-keyword' } },
    { sceneElement: { ...UNPROVEN, tierBasis: 'name-mismatch' } },
    { sceneElement: { ...UNPROVEN, tier: 'destructive', tierBasis: 'destructive-keyword' } },
    { sceneElement: { ...UNPROVEN, tierBasis: undefined } },
    { sceneElement: null },
    { destructiveIntent: true },
    { review: null },
    { review: [] },
    { review: goodReview({ fineTuned: 'true' }) },
    { review: goodReview({ targetSelector: 'a.other' }) },
    { review: goodReview({ action: 'type' }) },
    { review: goodReview({ pNavigational: 0.899 }) },
    { review: goodReview({ pNavigational: 1.2 }) },
    { review: goodReview({ pDestructive: 0.5 }) },
    { review: goodReview({ pOffTask: '0.1' }) },
  ];
  for (const over of cases) {
    const args = { plan: clickSt, sceneElement: UNPROVEN, review: goodReview(), destructiveIntent: false, ...over };
    const r = layaRelease(args);
    assert.equal(r.released, false, JSON.stringify(over));
    assert.equal(typeof r.reason, 'string');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATING_MODES,
  resolveOperatingMode,
  createDetectorCache,
  resolvePreviewStrategy,
  summarizeLatencyBreakdown,
  percentile,
  buildLatencyDistributionRecord,
} from '../shared/latency-strategy.mjs';
import { FULL_FLOW_LATENCY_MS } from '../shared/rubric-hooks.mjs';

test('privacy_only mode skips planner and does not claim G11 pass', () => {
  const m = resolveOperatingMode(OPERATING_MODES.privacy_only);
  assert.equal(m.skipPlanner, true);
  assert.equal(m.networkRequired, false);
  const breakdown = summarizeLatencyBreakdown({
    stages: [{ name: 'protect', elapsedMs: 120 }],
    mode: OPERATING_MODES.privacy_only,
  });
  assert.equal(breakdown.plannerMs, 0);
  assert.equal(breakdown.fullFlowMs, 120);
  // Privacy-only under 200ms must still fail G11 — not a full planner+confirm flow.
  assert.equal(breakdown.gate.status, 'fail');
  assert.match(breakdown.gate.note, /Privacy-only/);
  assert.match(breakdown.honesty, /Do not weaken/);
});

test('planner_assisted without measured planner stays fail', () => {
  const breakdown = summarizeLatencyBreakdown({
    stages: [{ name: 'protect', elapsedMs: 100 }],
    mode: OPERATING_MODES.planner_assisted,
  });
  assert.equal(breakdown.fullFlowMs, null);
  assert.equal(breakdown.gate.status, 'fail');
});

test('planner_assisted with historical LLM seconds fails gate', () => {
  const breakdown = summarizeLatencyBreakdown({
    stages: [{ name: 'protect', elapsedMs: 188 }],
    mode: OPERATING_MODES.planner_assisted,
    historicalPlannerMs: 3029,
  });
  assert.equal(breakdown.fullFlowMs, 3217);
  assert.equal(breakdown.gate.status, 'fail');
  assert.equal(breakdown.gate.budgetMs, FULL_FLOW_LATENCY_MS);
});

test('detector cache reuses factory result', async () => {
  const cache = createDetectorCache();
  let builds = 0;
  const factory = async () => { builds += 1; return { id: builds }; };
  const a = await cache.get(factory);
  const b = await cache.get(factory);
  assert.equal(a.cacheHit, false);
  assert.equal(b.cacheHit, true);
  assert.equal(builds, 1);
  assert.equal(a.detector.id, b.detector.id);
});

test('wireframe preview strategy skips mosaic', () => {
  const s = resolvePreviewStrategy('wireframe');
  assert.equal(s.useSelectiveMosaic, false);
  assert.equal(resolvePreviewStrategy('selective').useSelectiveMosaic, true);
});

test('percentile and distribution record keep G11 fail with historical full-flow', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  const rec = buildLatencyDistributionRecord({
    name: 'wave4-core-latency',
    samples: [80, 90, 100, 110, 120],
    mode: OPERATING_MODES.privacy_only,
    historicalFullFlowMs: [3029, 2276],
    notes: ['test'],
  });
  assert.equal(rec.status, 'fail');
  assert.equal(rec.fullFlowHistorical.gate.status, 'fail');
  assert.ok(rec.localProtectLoop.p95 <= 120);
});

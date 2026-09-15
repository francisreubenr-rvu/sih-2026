import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeLocalRiskScore,
  formatLocalRiskSummary,
  scoreHeldOutFixtureCase,
  scoreHeldOutFixtureDocument,
} from '../shared/score-path.mjs';
import { THREE_PATHS, resolveOperatingMode } from '../shared/latency-strategy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('empty scene yields low band and null official score', () => {
  const risk = computeLocalRiskScore({ scene: { controls: [{ id: '1' }], regions: [] } });
  assert.equal(risk.officialScore, null);
  assert.equal(risk.band, 'low');
  assert.equal(risk.path, 'score');
  assert.match(risk.honesty[0], /Local heuristic/);
  assert.equal(risk.rubricWeightsReferenced.combinedApproxPercent, 65);
});

test('faces and password regions elevate risk without inventing SIH score', () => {
  const risk = computeLocalRiskScore({
    scene: {
      controls: [],
      regions: [
        { kind: 'face' },
        { kind: 'face' },
        { kind: 'password' },
        { kind: 'field' },
      ],
    },
  });
  assert.equal(risk.officialScore, null);
  assert.equal(risk.band, 'high');
  assert.ok(risk.points >= 8);
  assert.ok(risk.reasons.some(r => /high-sensitivity/i.test(r)));
});

test('formatLocalRiskSummary stays honest in EN/HI', () => {
  const risk = computeLocalRiskScore({ scene: { controls: [{ id: 'a' }], regions: [{ kind: 'email' }] } });
  assert.match(formatLocalRiskSummary(risk), /official score null/);
  assert.match(formatLocalRiskSummary(risk, { lang: 'hi' }), /null/);
});

test('THREE_PATHS.score is partial_runnable and resolveOperatingMode supports score', () => {
  assert.equal(THREE_PATHS.score.status, 'partial_runnable');
  const m = resolveOperatingMode('score');
  assert.equal(m.skipPlanner, true);
  assert.equal(m.scoreRisk, true);
  assert.equal(m.networkRequired, false);
});

test('held-out fixture case bridges to local risk without inventing WebPII/officialScore', () => {
  const row = scoreHeldOutFixtureCase({
    id: 'bridge-demo',
    description: 'face + field',
    detectorRegions: [{ kind: 'face' }, { kind: 'field' }],
    observedControls: [{ id: 'c0', label: 'Pending' }],
    groundTruthPii: [{ kind: 'face' }, { kind: 'field' }],
  });
  assert.equal(row.officialScore, null);
  assert.equal(row.webPiiScore, null);
  assert.equal(row.status, 'held_out_local_risk_only');
  assert.ok(['low', 'elevated', 'high'].includes(row.localRiskBand));
  assert.equal(row.groundTruthPiiCount, 2);
});

test('wave6 held-out fixture document bridges with null official/WebPII scores', async () => {
  const path = join(root, 'Benchmarks/datasets/wave6-heldout-pii-fixtures.json');
  const doc = JSON.parse(await readFile(path, 'utf8'));
  const bridged = scoreHeldOutFixtureDocument(doc, { sourcePath: 'Benchmarks/datasets/wave6-heldout-pii-fixtures.json' });
  assert.equal(bridged.officialScore, null);
  assert.equal(bridged.webPiiScore, null);
  assert.equal(bridged.webPiiClaim, null);
  assert.equal(bridged.caseCount, 24);
  assert.equal(bridged.rows.length, 24);
  assert.equal(
    bridged.bandCounts.low + bridged.bandCounts.elevated + bridged.bandCounts.high,
    24,
  );
  assert.match(bridged.honesty[0], /Local heuristic/);
});

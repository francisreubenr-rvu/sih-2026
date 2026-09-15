import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLocalRiskScore, formatLocalRiskSummary } from '../shared/score-path.mjs';
import { THREE_PATHS, resolveOperatingMode } from '../shared/latency-strategy.mjs';

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

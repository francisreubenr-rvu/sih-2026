/**
 * Honest SIH26171 rubric measurement hooks.
 * Return labeled unit-fixture / unknown / fail results — never invent saturation.
 * Official weights: visual 25%, PII 20%, redaction 20%, client resources 20%, latency 15%.
 */

import { scoreRedactionPrecision } from './selective-redaction.mjs';
import { summarizeClientResources } from './client-resources.mjs';

export const RUBRIC_WEIGHTS = Object.freeze({
  'visual-context': 25,
  'pii-detection': 20,
  redaction: 20,
  'client-resources': 20,
  'task-latency': 15,
});

/** Full-flow under-200ms gate from Guardrails — do not weaken. */
export const FULL_FLOW_LATENCY_MS = 200;

export function scoreVisualContext({ expectedControls, observedControls }) {
  if (!Array.isArray(expectedControls) || !Array.isArray(observedControls)) throw new Error('Invalid visual inputs');
  const expected = new Set(expectedControls.map(c => `${c.role}:${c.label}`));
  const observed = new Set(observedControls.map(c => `${c.role}:${c.label}`));
  let tp = 0;
  for (const key of observed) if (expected.has(key)) tp++;
  const fp = observed.size - tp;
  const fn = expected.size - tp;
  return {
    metric: 'visual-context',
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    status: 'unit_fixture_only',
    observed: null,
  };
}

export function scorePiiDetection({ groundTruth, predictions, iouThreshold = 0.5 }) {
  // Reuse redaction instance matcher by treating predictions as redacted regions.
  const scored = scoreRedactionPrecision({
    width: 100,
    height: 100,
    groundTruthPii: groundTruth,
    redactedRegions: predictions,
    iouThreshold,
  });
  return {
    metric: 'pii-detection',
    precision: scored.instancePrecision,
    recall: scored.instanceRecall,
    truePositives: scored.truePositives,
    falsePositives: scored.falsePositives,
    falseNegatives: scored.falseNegatives,
    status: 'unit_fixture_only',
    observed: null,
  };
}

export function scoreRedaction(args) {
  const scored = scoreRedactionPrecision(args);
  return {
    metric: 'redaction',
    piiPixelCoverage: scored.piiPixelCoverage,
    nonPiiPreservation: scored.nonPiiPreservation,
    instancePrecision: scored.instancePrecision,
    instanceRecall: scored.instanceRecall,
    status: scored.status,
    observed: null,
    note: 'Pixel coverage and non-PII preservation are reported separately; not a blended vanity score.',
  };
}

export function scoreLatency({ elapsedMs, budgetMs = FULL_FLOW_LATENCY_MS }) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid latency');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('Invalid budget');
  const pass = elapsedMs <= budgetMs;
  return {
    metric: 'task-latency',
    elapsedMs,
    budgetMs,
    status: pass ? 'pass' : 'fail',
    observed: pass ? elapsedMs : null,
    note: pass
      ? `Within ${budgetMs} ms budget.`
      : `Full-flow latency ${elapsedMs} ms exceeds ${budgetMs} ms gate. Gate must not be weakened.`,
  };
}

/**
 * Assert an outbound JSON body contains no screenshot / URL / secret fields.
 * Used by extension and app before fetch.
 */
export function assertSanitizedPayload(body) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  const forbidden = [
    /"screenshot"\s*:/i,
    /"dataUrl"\s*:/i,
    /"raw"\s*:/i,
    /"html"\s*:/i,
    /"url"\s*:/i,
    /data:image\//i,
    /"password"\s*:\s*"/i,
    /"email"\s*:\s*"/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(json)) throw new Error(`Outbound payload contains forbidden field matching ${pattern}`);
  }
  let parsed;
  try { parsed = typeof body === 'string' ? JSON.parse(body) : body; }
  catch { throw new Error('Outbound payload is not JSON'); }
  if (parsed.screenshot != null || parsed.html != null || parsed.url != null || parsed.raw != null) {
    throw new Error('Outbound payload includes raw screen fields');
  }
  if (parsed.scene && (parsed.scene.pixels || parsed.scene.image || parsed.scene.bitmap)) {
    throw new Error('Outbound scene includes pixel fields');
  }
  return true;
}

export function emptyRubricLedger(extra = {}) {
  return {
    problem: 'SIH26171',
    generatedAt: new Date().toISOString(),
    score: null,
    scoreReason: 'Unit-fixture hooks only. No authoritative normalization or dataset saturation.',
    metrics: Object.entries(RUBRIC_WEIGHTS).map(([id, weightPercent]) => ({
      id,
      weightPercent,
      observed: null,
      status: id === 'task-latency' ? 'fail' : 'unknown',
      diagnostic_note: id === 'task-latency'
        ? 'Under-200ms full-flow gate remains failed until measured otherwise.'
        : 'Awaiting labeled dataset measurement beyond unit fixtures.',
    })),
    ...extra,
  };
}

export {
  readJsHeap,
  readClientEnvironment,
  measureStage,
  summarizeClientResources,
} from './client-resources.mjs';

/**
 * Rubric-facing client-resources hook.
 * Always returns observed:null unless a future protocol explicitly saturates budgets.
 */
export function scoreClientResources({ stages = [], env } = {}) {
  const summary = summarizeClientResources(stages, env);
  return {
    ...summary,
    weightPercent: RUBRIC_WEIGHTS['client-resources'],
  };
}

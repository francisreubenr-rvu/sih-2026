/**
 * Score path — local heuristic risk diagnostic (no LLM, no official rubric score).
 *
 * Organizer weights put visual-context + PII + redaction ≈ 65%. This module does
 * NOT claim those rubric percentages. It ranks local scene risk from allowlisted
 * controls and opaque region kinds already present after Fast protect.
 *
 * officialScore stays null. Not WebPII. Not a G11 pass.
 */

import { RUBRIC_WEIGHTS } from './rubric-hooks.mjs';

/** Region kinds that imply higher residual exposure if they leave as structure. */
const HIGH_KIND = new Set(['face', 'password', 'aadhaar', 'pan', 'card-like', 'upi-vpa']);
const MED_KIND = new Set(['email', 'number', 'field', 'sensitive-label', 'ifsc', 'voter-id', 'gstin']);

/**
 * @param {{ scene?: { controls?: unknown[], regions?: Array<{ kind?: string }> }, labels?: string[] }} input
 * @returns {object} diagnostic only — never an official SIH weighted total
 */
export function computeLocalRiskScore({ scene, labels = [] } = {}) {
  const controls = Array.isArray(scene?.controls) ? scene.controls : [];
  const regions = Array.isArray(scene?.regions) ? scene.regions : [];
  const kindCounts = {};
  let high = 0;
  let med = 0;
  for (const r of regions) {
    const kind = typeof r?.kind === 'string' ? r.kind : 'unknown';
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    if (HIGH_KIND.has(kind)) high += 1;
    else if (MED_KIND.has(kind)) med += 1;
    else med += 1; // unknown opaque region still counts as residual structure
  }

  const controlCount = controls.length;
  const allowlistHits = labels.filter(l => typeof l === 'string' && l.trim()).length;
  // Simple ordinal points — diagnostic banding only, not calibrated probabilities.
  let points = high * 3 + med * 1;
  if (controlCount === 0) points += 2; // no usable controls → utility risk
  if (high >= 2) points += 2;

  let band = 'low';
  if (points >= 8) band = 'high';
  else if (points >= 3) band = 'elevated';

  const reasons = [];
  if (high) reasons.push(`${high} high-sensitivity opaque region(s)`);
  if (med) reasons.push(`${med} other opaque region(s)`);
  if (controlCount === 0) reasons.push('no allowlisted controls in scene');
  if (!reasons.length) reasons.push('few opaque regions; layout may still reveal context');

  return {
    path: 'score',
    status: 'partial_runnable',
    band,
    points,
    counts: {
      controls: controlCount,
      regions: regions.length,
      highSensitivityRegions: high,
      otherOpaqueRegions: med,
      kindCounts,
      labelSamples: allowlistHits,
    },
    reasons,
    officialScore: null,
    rubricWeightsReferenced: {
      visualContextPercent: RUBRIC_WEIGHTS['visual-context'],
      piiDetectionPercent: RUBRIC_WEIGHTS['pii-detection'],
      redactionPercent: RUBRIC_WEIGHTS.redaction,
      combinedApproxPercent: RUBRIC_WEIGHTS['visual-context']
        + RUBRIC_WEIGHTS['pii-detection']
        + RUBRIC_WEIGHTS.redaction,
      note: 'Organizer weights for accuracy+PII+redaction ≈65%. These are evaluation weights, not Dhristi scores.',
    },
    honesty: [
      'Local heuristic risk only — not the official SIH weighted score.',
      'officialScore remains null until labeled dataset saturation exists.',
      'Not a WebPII win or G11 pass. Layout can still reveal context.',
    ],
  };
}

/**
 * Human-readable one-line summary for popup / judge script.
 */
export function formatLocalRiskSummary(risk, { lang = 'en' } = {}) {
  if (!risk || typeof risk !== 'object') return '';
  if (lang === 'hi') {
    return `Score पथ (स्थानीय ह्यूरिस्टिक) · जोखिम ${risk.band} · आधिकारिक स्कोर null · G11/WebPII दावा नहीं`;
  }
  return `Score path (local heuristic) · risk ${risk.band} · official score null · not G11/WebPII`;
}

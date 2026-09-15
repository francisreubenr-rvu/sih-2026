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

/**
 * Map one held-out synthetic fixture case → local Score-path risk.
 * Uses detectorRegions + observedControls already authored in the fixture JSON.
 * Does NOT invent WebPII metrics or officialScore.
 *
 * @param {{ id?: string, description?: string, detectorRegions?: unknown[], observedControls?: unknown[], expectedControls?: unknown[], groundTruthPii?: unknown[] }} fixtureCase
 */

/**
 * Collect ground-truth PII kinds from a held-out fixture case.
 * @param {{ groundTruthPii?: Array<{ kind?: string }> }} fixtureCase
 * @returns {string[]}
 */
export function groundTruthKinds(fixtureCase = {}) {
  const gt = Array.isArray(fixtureCase.groundTruthPii) ? fixtureCase.groundTruthPii : [];
  return gt
    .map((x) => (typeof x?.kind === 'string' && x.kind.trim() ? x.kind.trim() : 'unknown'))
    .filter(Boolean);
}

/**
 * Correlation report: local Score bands vs held-out ground-truth PII kinds.
 * Descriptive only — never invents WebPII saturation or officialScore.
 *
 * @param {Array<{ localRiskBand?: string, localRiskPoints?: number, groundTruthPiiCount?: number, groundTruthKinds?: string[], counts?: { kindCounts?: Record<string, number> } }>} rows
 */
export function correlateScoreBandsWithGroundTruthKinds(rows = []) {
  const bandTotals = { low: 0, elevated: 0, high: 0 };
  const byGtKind = {};
  const pointsByGtCount = {};
  let kindMatchCases = 0;
  let kindMismatchCases = 0;
  let casesWithGt = 0;

  for (const row of rows) {
    const band = row?.localRiskBand;
    if (bandTotals[band] !== undefined) bandTotals[band] += 1;
    const kinds = Array.isArray(row?.groundTruthKinds) ? [...new Set(row.groundTruthKinds)] : [];
    const gtCount = typeof row?.groundTruthPiiCount === 'number'
      ? row.groundTruthPiiCount
      : kinds.length;
    const bucket = String(gtCount);
    if (!pointsByGtCount[bucket]) pointsByGtCount[bucket] = { cases: 0, pointsSum: 0, bands: { low: 0, elevated: 0, high: 0 } };
    pointsByGtCount[bucket].cases += 1;
    pointsByGtCount[bucket].pointsSum += Number(row?.localRiskPoints) || 0;
    if (pointsByGtCount[bucket].bands[band] !== undefined) pointsByGtCount[bucket].bands[band] += 1;

    if (kinds.length) casesWithGt += 1;
    for (const kind of (kinds.length ? kinds : ['(none)'])) {
      if (!byGtKind[kind]) byGtKind[kind] = { cases: 0, bands: { low: 0, elevated: 0, high: 0 } };
      byGtKind[kind].cases += 1;
      if (byGtKind[kind].bands[band] !== undefined) byGtKind[kind].bands[band] += 1;
    }

    const detectorKinds = new Set(Object.keys(row?.counts?.kindCounts || {}));
    const gtSet = new Set(kinds);
    if (gtSet.size === 0 && detectorKinds.size === 0) {
      kindMatchCases += 1;
    } else if (gtSet.size && [...gtSet].every((k) => detectorKinds.has(k))) {
      kindMatchCases += 1;
    } else {
      kindMismatchCases += 1;
    }
  }

  const meanPointsByGtCount = {};
  for (const [k, v] of Object.entries(pointsByGtCount)) {
    meanPointsByGtCount[k] = {
      cases: v.cases,
      meanLocalRiskPoints: v.cases ? Math.round((v.pointsSum / v.cases) * 100) / 100 : 0,
      bands: v.bands,
    };
  }

  // Simple ordinal association: higher GT count buckets should tend toward higher mean points.
  const ordered = Object.keys(meanPointsByGtCount)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  let monotonicPairs = 0;
  let comparablePairs = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      comparablePairs += 1;
      const a = meanPointsByGtCount[String(ordered[i])].meanLocalRiskPoints;
      const b = meanPointsByGtCount[String(ordered[j])].meanLocalRiskPoints;
      if (b >= a) monotonicPairs += 1;
    }
  }

  return {
    name: 'score-band-vs-gt-kind-correlation',
    schema_version: 1,
    caseCount: rows.length,
    casesWithGroundTruth: casesWithGt,
    bandTotals,
    byGroundTruthKind: byGtKind,
    meanPointsByGroundTruthCount: meanPointsByGtCount,
    detectorKindCoversAllGtKinds: {
      matchCases: kindMatchCases,
      mismatchCases: kindMismatchCases,
      note: 'Fixture detectorRegions vs groundTruthPii kinds — structural overlap only, not precision/recall.',
    },
    gtCountVsPointsMonotonicShare: comparablePairs
      ? Math.round((monotonicPairs / comparablePairs) * 1000) / 1000
      : null,
    officialScore: null,
    webPiiScore: null,
    honesty: [
      'Descriptive correlation of local heuristic bands vs held-out GT kinds only.',
      'officialScore remains null. webPiiScore remains null — no invented WebPII.',
      'Not a calibrated privacy metric, not organizer weighted score, not a G11 pass.',
      'Kinds such as media that are absent from HIGH/MED tables still count as residual opaque structure.',
    ],
  };
}

export function scoreHeldOutFixtureCase(fixtureCase = {}) {
  const controls = Array.isArray(fixtureCase.observedControls)
    ? fixtureCase.observedControls
    : (Array.isArray(fixtureCase.expectedControls) ? fixtureCase.expectedControls : []);
  const regions = Array.isArray(fixtureCase.detectorRegions)
    ? fixtureCase.detectorRegions
    : [];
  const labels = controls
    .map((c) => (typeof c?.label === 'string' ? c.label : (typeof c?.id === 'string' ? c.id : '')))
    .filter(Boolean);
  const risk = computeLocalRiskScore({
    scene: { controls, regions },
    labels,
  });
  const gtKinds = groundTruthKinds(fixtureCase);
  return {
    id: fixtureCase.id || 'anonymous',
    description: fixtureCase.description || '',
    localRiskBand: risk.band,
    localRiskPoints: risk.points,
    counts: risk.counts,
    reasons: risk.reasons,
    groundTruthPiiCount: gtKinds.length,
    groundTruthKinds: gtKinds,
    officialScore: null,
    webPiiScore: null,
    status: 'held_out_local_risk_only',
    honesty: risk.honesty,
  };
}

/**
 * Bridge an entire held-out fixture document to Score-path diagnostics.
 * @param {{ name?: string, version?: string, cases?: unknown[] }} doc
 * @param {{ sourcePath?: string }} [meta]
 */
export function scoreHeldOutFixtureDocument(doc = {}, meta = {}) {
  const cases = Array.isArray(doc.cases) ? doc.cases : [];
  const rows = cases.map((c) => scoreHeldOutFixtureCase(c));
  const bandCounts = { low: 0, elevated: 0, high: 0 };
  for (const row of rows) {
    if (bandCounts[row.localRiskBand] !== undefined) bandCounts[row.localRiskBand] += 1;
  }
  const gtKindBandCorrelation = correlateScoreBandsWithGroundTruthKinds(rows);
  return {
    name: 'score-path-heldout',
    schema_version: 2,
    sourceFixture: doc.name || null,
    sourceVersion: doc.version || null,
    sourcePath: meta.sourcePath || null,
    caseCount: rows.length,
    bandCounts,
    gtKindBandCorrelation,
    officialScore: null,
    webPiiScore: null,
    webPiiClaim: null,
    status: 'held_out_local_risk_bridge',
    honesty: [
      'Local heuristic risk bands only — bridged from held-out synthetic fixture JSON.',
      'officialScore remains null. webPiiScore remains null (no invented WebPII).',
      'gtKindBandCorrelation is descriptive association only — not WebPII, not official SIH score.',
      'Not a G11 pass. Not official SIH weighted saturation.',
      'Bands describe residual opaque-region structure after Fast protect semantics, not privacy certification.',
    ],
    rows,
  };
}

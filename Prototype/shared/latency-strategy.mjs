/**
 * G11 latency strategy — reduce full-flow time without weakening the <200ms gate.
 *
 * Honest model:
 * - Privacy-only mode ends at local sanitize/review (no planner/LLM network).
 * - Detector session cache avoids cold ONNX reloads on repeat captures.
 * - Fast local heuristics: wireframe preview + DOM region kinds skip heavy mosaic
 *   when the operator chooses preview=wireframe (pixels still never egress).
 * - Full planner-assisted flow still includes seconds of local LLM time historically;
 *   that path remains fail under the 200ms gate until measured otherwise.
 */

import { FULL_FLOW_LATENCY_MS, scoreLatency } from './rubric-hooks.mjs';

export const OPERATING_MODES = Object.freeze({
  privacy_only: 'privacy_only',
  planner_assisted: 'planner_assisted',
});

/** Architect three-path product labels (honesty contract). */
export const THREE_PATHS = Object.freeze({
  fast: {
    id: 'fast',
    label: 'Fast',
    stages: 'capture→detect→mask→privacy review',
    llm: false,
    status: 'implemented',
    g11: 'NOT a G11 full-flow measurement. Local protect timing only.',
    slo: 'Local protect diagnostic; no p95<200ms claim for G11.',
  },
  score: {
    id: 'score',
    label: 'Score',
    stages: 'local heuristic risk after Fast protect (partial)',
    llm: false,
    status: 'partial_runnable',
    g11: 'Not a G11 measurement. Local risk band only; officialScore null.',
    slo: 'Diagnostic risk band only — not official SIH weighted score / not WebPII.',
  },
  reason: {
    id: 'reason',
    label: 'Reason',
    stages: 'Ollama/Qwen plan + human confirm',
    llm: true,
    status: 'implemented',
    g11: 'Included in G11 full-flow. Historically seconds; gate remains fail until p95<200ms at n≥100.',
    slo: 'Outside <200ms budget today; G11 stays fail.',
  },
});


export const PREVIEW_STRATEGIES = Object.freeze({
  selective: 'selective',
  wireframe: 'wireframe',
});

/**
 * @param {'privacy_only'|'planner_assisted'|string} mode
 */
export function resolveOperatingMode(mode) {
  if (mode === OPERATING_MODES.privacy_only || mode === 'score' || mode === THREE_PATHS.score.id) {
    const isScore = mode === 'score' || mode === THREE_PATHS.score.id;
    return {
      mode: isScore ? 'score' : OPERATING_MODES.privacy_only,
      skipPlanner: true,
      skipExecute: true,
      networkRequired: false,
      scoreRisk: isScore,
      label: isScore
        ? 'Score · local heuristic risk (no LLM)'
        : 'Fast · local protect (no LLM)',
      note: isScore
        ? 'After Fast protect: local risk band. officialScore null. Not G11/WebPII.'
        : 'capture→detect→mask→privacy review. Not a G11 full-flow pass.',
    };
  }
  return {
    mode: OPERATING_MODES.planner_assisted,
    skipPlanner: false,
    skipExecute: false,
    networkRequired: true,
    scoreRisk: false,
    label: 'Reason · Ollama/Qwen plan+confirm',
    note: 'Outside <200ms budget historically; G11 remains fail until p95<200 at n≥100.',
  };
}

/**
 * Session-scoped detector holder so warm captures reuse the WASM session.
 * In the MV3 action popup this session is the popup document lifetime only —
 * closing the toolbar popup drops the sandbox iframe / Worker (DBG-002).
 */
export function createDetectorCache() {
  let detector = null;
  let loads = 0;
  return {
    async get(factory) {
      if (detector) return { detector, cacheHit: true, loads };
      detector = await factory();
      loads += 1;
      return { detector, cacheHit: false, loads };
    },
    reset() {
      detector = null;
    },
    stats() {
      return { loaded: Boolean(detector), loads };
    },
  };
}

/**
 * Choose local preview strategy. Wireframe is faster (no RGBA mosaic) for demos
 * that only need the semantic egress story.
 */
export function resolvePreviewStrategy(preference = PREVIEW_STRATEGIES.selective) {
  if (preference === PREVIEW_STRATEGIES.wireframe) {
    return {
      strategy: PREVIEW_STRATEGIES.wireframe,
      useSelectiveMosaic: false,
      expectedCost: 'low',
      note: 'Wireframe paintScene only — faster local preview; still semantics-only egress.',
    };
  }
  return {
    strategy: PREVIEW_STRATEGIES.selective,
    useSelectiveMosaic: true,
    expectedCost: 'medium',
    note: 'Selective pixelation for human review; local-only.',
  };
}

/**
 * Build an honest stage breakdown for evidence (no invented numbers).
 * @param {{ stages: Array<{ name: string, elapsedMs: number }>, mode?: string, budgetMs?: number }} input
 */
export function summarizeLatencyBreakdown({
  stages = [],
  mode = OPERATING_MODES.planner_assisted,
  budgetMs = FULL_FLOW_LATENCY_MS,
  historicalPlannerMs = null,
} = {}) {
  const resolved = resolveOperatingMode(mode);
  const localMs = stages
    .filter(s => s && Number.isFinite(s.elapsedMs))
    .reduce((a, s) => a + s.elapsedMs, 0);
  const plannerMs = resolved.skipPlanner
    ? 0
    : (Number.isFinite(historicalPlannerMs) ? historicalPlannerMs : null);
  const fullFlowMs = plannerMs == null ? null : localMs + plannerMs;
  // Privacy-only local timing must never be scored as a G11 full-flow pass.
  let gate;
  if (resolved.skipPlanner) {
    gate = {
      metric: 'task-latency',
      status: 'fail',
      budgetMs,
      elapsedMs: localMs,
      observed: null,
      note: `Privacy-only local protect ${localMs} ms is not full-flow (no planner/confirm). G11 remains fail; budget ${budgetMs} ms unchanged.`,
    };
  } else if (fullFlowMs == null) {
    gate = {
      metric: 'task-latency',
      status: 'fail',
      budgetMs,
      elapsedMs: null,
      observed: null,
      note: 'Full-flow not measured this run (planner missing). Gate remains fail until p95 <200ms over ≥100 attempts.',
    };
  } else {
    gate = scoreLatency({ elapsedMs: fullFlowMs, budgetMs });
  }

  return {
    mode: resolved.mode,
    skipPlanner: resolved.skipPlanner,
    stages: stages.map(s => ({ name: s.name, elapsedMs: s.elapsedMs })),
    localProtectMs: localMs,
    plannerMs,
    fullFlowMs,
    budgetMs,
    gate,
    strategiesApplied: [
      resolved.skipPlanner ? 'skip_llm_privacy_only' : 'planner_required',
      'detector_session_cache',
      'optional_wireframe_preview',
    ],
    honesty: 'Do not weaken FULL_FLOW_LATENCY_MS. Privacy-only local ms is not a G11 pass.',
  };
}

/**
 * Percentile helper for measured distributions (inclusive nearest-rank).
 * @param {number[]} samples
 * @param {number} p 0–100
 */
export function percentile(samples, p) {
  const v = samples.filter(n => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  if (p <= 0) return v[0];
  if (p >= 100) return v[v.length - 1];
  const idx = Math.ceil((p / 100) * v.length) - 1;
  return v[Math.max(0, Math.min(v.length - 1, idx))];
}

/**
 * Aggregate a latency distribution record for Benchmarks/results/core-latency.json.
 */
export function buildLatencyDistributionRecord({
  name,
  samples = [],
  warmups = 0,
  mode,
  budgetMs = FULL_FLOW_LATENCY_MS,
  notes = [],
  historicalFullFlowMs = [],
} = {}) {
  const local = samples.filter(n => Number.isFinite(n));
  const full = historicalFullFlowMs.filter(n => Number.isFinite(n));
  const localGate = local.length
    ? scoreLatency({ elapsedMs: percentile(local, 95) ?? local[local.length - 1], budgetMs })
    : null;
  // G11 requires full-flow including model — use historical planner-inclusive samples when present.
  const fullGate = full.length
    ? scoreLatency({ elapsedMs: percentile(full, 95) ?? full[full.length - 1], budgetMs })
    : {
        metric: 'task-latency',
        status: 'fail',
        budgetMs,
        elapsedMs: null,
        observed: null,
        note: 'No ≥100-attempt full-flow distribution. Historical planner calls are seconds.',
      };

  return {
    name,
    generatedAt: new Date().toISOString(),
    mode: resolveOperatingMode(mode).mode,
    budgetMs,
    warmups,
    sampleCount: local.length,
    localProtectLoop: {
      unit: 'ms',
      n: local.length,
      min: local.length ? Math.min(...local) : null,
      max: local.length ? Math.max(...local) : null,
      p50: percentile(local, 50),
      p95: percentile(local, 95),
      mean: local.length ? local.reduce((a, b) => a + b, 0) / local.length : null,
      gate_if_misused_as_full_flow: localGate,
      note: 'Local protect-only timings. MUST NOT be reported as G11 full-flow pass.',
    },
    fullFlowHistorical: {
      unit: 'ms',
      n: full.length,
      samples: full,
      p50: percentile(full, 50),
      p95: percentile(full, 95),
      gate: fullGate,
      note: 'Planner-inclusive observations (small n). Gate not weakened.',
    },
    status: 'fail',
    notes,
  };
}

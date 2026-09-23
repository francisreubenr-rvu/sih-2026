/**
 * G11 Option C measurement helpers (W-G11-H-1 … H-5).
 * Times only clocks the caller supplies from the root extension trace.
 * Missing stages stay null. budgetMs stays 200. Privacy-only never mayFlipG11.
 */
import { resolve, sep } from 'node:path';

export const BUDGET_MS = 200;
export const WARDEN_ORIGIN = 'http://127.0.0.1:8756';
export const ARTIFACT_NAME = 'core-latency-warden-option-c.json';
export const SUITE_ID = 'g11-warden-option-c-v1';
export const LANES = ['L0_strip_local', 'L1_plan_validate', 'L2_full_core'];
export const STAGE_KEYS = ['perceive', 'strip', 'plan', 'validate', 'f17_local_tier', 'execute', 'total'];

export const HONESTY = [
  'Privacy-only and Prototype:9041 timings must not be copied into L2 gate.',
  'Validate-only Ollama is not planner label ollama.',
  'Do not weaken budgetMs below or redefine full-flow without Brain+Francis.',
];

const L2_REQUIRED_STAGES = ['perceive', 'strip', 'plan', 'validate', 'f17_local_tier', 'execute', 'total'];

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function fail(message, failures) {
  const error = new Error(message);
  error.failures = failures;
  return error;
}

export function assertWardenOrigin(wardenBaseUrl) {
  let url;
  try {
    url = new URL(wardenBaseUrl);
  } catch {
    throw fail(`wardenBaseUrl is not a URL: ${wardenBaseUrl}`, ['wardenBaseUrl must be http://127.0.0.1:8756']);
  }
  const origin = `${url.protocol}//${url.host}`;
  if (origin !== WARDEN_ORIGIN || url.pathname !== '/' && url.pathname !== '') {
    throw fail(
      `wardenBaseUrl must be ${WARDEN_ORIGIN}`,
      [`wardenBaseUrl must be ${WARDEN_ORIGIN}`],
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw fail('wardenBaseUrl must be http://127.0.0.1:8756', ['wardenBaseUrl must be http://127.0.0.1:8756']);
  }
}

export function assertExtensionPath(extensionPath, repoRoot) {
  const abs = resolve(extensionPath);
  const rootExt = resolve(repoRoot, 'extension');
  const prototypeExt = resolve(repoRoot, 'Prototype', 'extension');
  const normalized = abs.split(sep).join('/');
  if (normalized.includes('Prototype/extension') || abs === prototypeExt || abs.startsWith(prototypeExt + sep)) {
    throw fail('refusing Prototype/extension', ['extension path must be root extension/, not Prototype/extension']);
  }
  if (abs !== rootExt) {
    throw fail(`extension path must be ${rootExt}`, ['extension path must be the root extension/ directory']);
  }
}

export function assertOutPath(outPath) {
  const normalized = String(outPath || '').split(sep).join('/');
  if (normalized.endsWith('/core-latency.json') || normalized === 'Benchmarks/results/core-latency.json' || normalized.endsWith('results/core-latency.json')) {
    throw fail('refusing to overwrite core-latency.json', ['outPath must be Benchmarks/results/core-latency-warden-option-c.json']);
  }
  if (!normalized.endsWith(ARTIFACT_NAME)) {
    throw fail(`outPath must end with ${ARTIFACT_NAME}`, [`outPath must be Benchmarks/results/${ARTIFACT_NAME}`]);
  }
}

function assertPages(pages) {
  if (!Array.isArray(pages) || pages.length < 1) {
    throw fail('pages.length must be >= 1', ['pages.length must be >= 1']);
  }
  for (const page of pages) {
    let url;
    try {
      url = new URL(page);
    } catch {
      throw fail(`page is not an absolute URL: ${page}`, [`page is not an absolute URL: ${page}`]);
    }
    if (!url.protocol || url.protocol === 'about:') {
      throw fail(`page is not an absolute URL: ${page}`, [`page is not an absolute URL: ${page}`]);
    }
  }
}

export function validateConfig(config, repoRoot) {
  const failures = [];
  const push = (message) => failures.push(message);
  if (!config || typeof config !== 'object') {
    throw fail('config object is required', ['config object is required']);
  }
  if (config.suiteId !== SUITE_ID) push(`suiteId must be ${SUITE_ID}`);
  if (!LANES.includes(config.lane)) push('lane must be L0_strip_local, L1_plan_validate, or L2_full_core');
  try {
    assertWardenOrigin(config.wardenBaseUrl);
  } catch (error) {
    push(error.failures?.[0] || error.message);
  }
  try {
    assertExtensionPath(config.extensionPath, repoRoot);
  } catch (error) {
    push(error.failures?.[0] || error.message);
  }
  try {
    assertPages(config.pages);
  } catch (error) {
    push(error.failures?.[0] || error.message);
  }
  try {
    assertOutPath(config.outPath);
  } catch (error) {
    push(error.failures?.[0] || error.message);
  }
  if (config.budgetMs !== BUDGET_MS) push('budgetMs is immutable at 200');
  if (config.budget_weakened === true) push('budget_weakened must be false');
  const warmups = config.warmups ?? 10;
  const sampleCount = config.sampleCount ?? 100;
  if (!Number.isInteger(warmups) || warmups < 0) push('warmups must be an integer >= 0');
  if (!Number.isInteger(sampleCount) || sampleCount < 1) push('sampleCount must be an integer >= 1');
  if (!config.f17 || config.f17.requireOpTierLocal !== true) push('f17.requireOpTierLocal must be true');
  if (!config.f17 || config.f17.trustServerRequiresConfirmation !== false) {
    push('f17.trustServerRequiresConfirmation must be false');
  }
  if (config.privacyOnly === true && config.lane === 'L2_full_core') {
    push('privacy-only / skip-LLM cannot use lane L2_full_core');
  }
  if (config.lane === 'L2_full_core') {
    const policy = config.executePolicy;
    if (policy !== 'confirm_auto_safe_only' && policy !== 'scripted_confirm') {
      push('L2 executePolicy must be confirm_auto_safe_only or scripted_confirm');
    }
  }
  if (!config.planner || typeof config.planner !== 'object') push('planner object is required');
  if (failures.length) throw fail(failures.join('; '), failures);
  return {
    suiteId: config.suiteId,
    lane: config.lane,
    wardenBaseUrl: WARDEN_ORIGIN,
    extensionPath: resolve(repoRoot, 'extension'),
    pages: [...config.pages],
    warmups,
    sampleCount,
    budgetMs: BUDGET_MS,
    f17: { requireOpTierLocal: true, trustServerRequiresConfirmation: false },
    executePolicy: config.executePolicy || null,
    outPath: config.outPath,
    privacyOnly: config.privacyOnly === true,
    planner: config.planner,
  };
}

export function emptyStages() {
  return {
    perceive: null,
    strip: null,
    plan: null,
    validate: null,
    f17_local_tier: null,
    execute: null,
    total: null,
  };
}

function localTierAllowsUnattended(tier) {
  return tier === 'reversible' || tier === 'navigational';
}

export function foldF17(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      opTierLocalComputed: false,
      localTier: null,
      wardenTier: null,
      tiersAgree: false,
      trustedServerRequiresConfirmationAlone: false,
      unattendedExecuteAllowed: false,
      gatePath: 'reject',
      bypassedLocalTier: false,
      ok: false,
      reason: 'opTierLocal did not run inside the extension',
    };
  }
  const last = steps[steps.length - 1];
  const bypass = steps.some((step) => step.bypassedLocalTier === true || step.opTierLocalComputed !== true);
  const trustedAlone = steps.some((step) => step.trustedServerRequiresConfirmationAlone !== false);
  const tierInvalid = steps.some((step) => step.localTier == null || step.tierError);
  const silent = steps.some((step) => (
    (step.gatePath === 'unattended_ok' || step.unattendedExecuteAllowed === true)
    && !localTierAllowsUnattended(step.localTier)
  ));
  const ok = !bypass && !trustedAlone && !silent && !tierInvalid;
  return {
    opTierLocalComputed: last.opTierLocalComputed === true,
    localTier: last.localTier ?? null,
    wardenTier: last.wardenTier ?? null,
    tiersAgree: last.tiersAgree === true,
    trustedServerRequiresConfirmationAlone: false,
    unattendedExecuteAllowed: last.unattendedExecuteAllowed === true && localTierAllowsUnattended(last.localTier),
    gatePath: last.gatePath || 'reject',
    bypassedLocalTier: bypass,
    ok,
    reason: ok ? undefined : 'f17 local tier gate was bypassed or did not run on the client',
  };
}

export function scoreAttempt(attempt) {
  const f17 = foldF17(attempt.f17Steps || (attempt.f17 ? [attempt.f17] : []));
  const stagesMs = emptyStages();
  const stageReasons = {};
  for (const key of STAGE_KEYS) {
    const value = attempt.stagesMs?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      stagesMs[key] = value;
    } else {
      stagesMs[key] = null;
      stageReasons[key] = attempt.stageReasons?.[key] || 'stage clock was not collected';
    }
  }
  const stagesOk = L2_REQUIRED_STAGES.every((key) => typeof stagesMs[key] === 'number');
  const includeInGate = attempt.lane === 'L2_full_core'
    && attempt.privacyOnly !== true
    && attempt.warmup !== true
    && attempt.clockSource === 'extension'
    && attempt.plannerLabel !== 'unknown'
    && attempt.plannerLabel != null
    && f17.ok === true
    && stagesOk
    && attempt.terminal === 'ok';
  return {
    i: attempt.i,
    warmup: attempt.warmup === true,
    page: attempt.page,
    lane: attempt.lane,
    plannerLabel: attempt.plannerLabel,
    stagesMs,
    stageReasons,
    f17,
    terminal: attempt.terminal || 'error',
    includeInGate,
    clockSource: attempt.clockSource || null,
  };
}

export function summarize(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) {
    return { n: 0, minMs: null, maxMs: null, p50Ms: null, p95Ms: null, meanMs: null };
  }
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  return {
    n: nums.length,
    minMs: Math.min(...nums),
    maxMs: Math.max(...nums),
    p50Ms: percentile(nums, 50),
    p95Ms: percentile(nums, 95),
    meanMs: mean,
  };
}

function stageP95(attempts) {
  const out = {};
  for (const key of STAGE_KEYS) {
    const values = attempts
      .map((attempt) => attempt.stagesMs[key])
      .filter((value) => typeof value === 'number');
    out[key] = values.length === attempts.length && values.length > 0 ? percentile(values, 95) : null;
  }
  return out;
}

export function classifyPlannerProbe(status, body) {
  const error = body && typeof body.error === 'string' ? body.error : '';
  const model = body && typeof body.model === 'string' ? body.model : '';
  const blob = `${error}\n${model}`;
  if (status >= 200 && status < 300 && /ollama|11434/i.test(model)) {
    return {
      label: 'ollama',
      detail: 'ollama@127.0.0.1:11434',
      endpointRole: 'plan',
      phase1DefaultLock: true,
    };
  }
  if (/groq/i.test(blob) || body?.groqConfigured === false || (status >= 200 && status < 300 && model && !/ollama|11434/i.test(model))) {
    return {
      label: 'groq',
      detail: 'groq',
      endpointRole: 'plan',
      phase1DefaultLock: true,
    };
  }
  return {
    label: 'unknown',
    detail: 'unverified',
    endpointRole: 'plan',
    phase1DefaultLock: true,
  };
}

export async function probePlanner(wardenBaseUrl, fetchImpl = fetch) {
  assertWardenOrigin(wardenBaseUrl);
  const body = {
    tokenizedTask: 'open the next control',
    sanitizedDom: '<a id="next">Next</a>',
    elements: [{ selector: '#next', label: 'Next', fieldType: 'link', filled: false, x: 8, y: 8 }],
    history: [],
  };
  let response;
  try {
    response = await fetchImpl(`${WARDEN_ORIGIN}/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      label: 'unknown',
      detail: 'unverified',
      endpointRole: 'plan',
      phase1DefaultLock: true,
      probeError: error instanceof Error ? error.message : String(error),
    };
  }
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return classifyPlannerProbe(response.status, parsed);
}

export async function probeHealth(fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${WARDEN_ORIGIN}/health`, { method: 'GET' });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body || body.ok !== true) {
    return { ok: false, reason: 'GET /health did not return ok: true', body };
  }
  return { ok: true, body };
}

function laneShell(mayFlipG11, withGate) {
  if (!withGate) {
    return {
      mayFlipG11,
      aggregates: { n: 0, p50Ms: null, p95Ms: null },
      gate: null,
    };
  }
  return {
    mayFlipG11,
    aggregates: {
      n: 0,
      minMs: null,
      maxMs: null,
      p50Ms: null,
      p95Ms: null,
      meanMs: null,
      stageP95Ms: emptyStages(),
    },
    gate: {
      metric: 'task-latency',
      rule: 'G11',
      required: 'p95 end-to-end <200ms, n≥100 after 10 warmups, frozen core, f17.ok',
      budgetMs: BUDGET_MS,
      elapsedMs: null,
      status: 'fail',
      budget_weakened: false,
      note: '',
    },
  };
}

export function buildArtifact({
  generatedAt = new Date().toISOString(),
  config,
  planner,
  attempts,
  note,
  privacyOnly = false,
}) {
  const scored = attempts.map(scoreAttempt);
  const laneAttempts = {
    L0_strip_local: scored.filter((attempt) => attempt.lane === 'L0_strip_local' && !attempt.warmup),
    L1_plan_validate: scored.filter((attempt) => attempt.lane === 'L1_plan_validate' && !attempt.warmup),
    L2_full_core: scored.filter((attempt) => attempt.lane === 'L2_full_core' && !attempt.warmup),
  };
  const l2Included = laneAttempts.L2_full_core.filter((attempt) => attempt.includeInGate);
  const l2Stats = summarize(l2Included.map((attempt) => attempt.stagesMs.total));
  const plannerLabel = planner?.label || 'unknown';
  const sampleEligible = privacyOnly !== true
    && config.lane === 'L2_full_core'
    && plannerLabel !== 'unknown'
    && config.warmups >= 10
    && l2Included.length >= 100
    && l2Stats.p95Ms != null;
  const l2Pass = sampleEligible && l2Stats.p95Ms < BUDGET_MS;
  const l2MayFlip = privacyOnly !== true;
  const lanes = {
    L0_strip_local: laneShell(false, false),
    L1_plan_validate: laneShell(false, false),
    L2_full_core: laneShell(l2MayFlip, true),
  };
  for (const lane of ['L0_strip_local', 'L1_plan_validate']) {
    const totals = laneAttempts[lane]
      .map((attempt) => attempt.stagesMs.total)
      .filter((value) => typeof value === 'number');
    const stats = summarize(totals);
    lanes[lane].aggregates = { n: stats.n, p50Ms: stats.p50Ms, p95Ms: stats.p95Ms };
  }
  lanes.L2_full_core.aggregates = {
    ...l2Stats,
    stageP95Ms: stageP95(l2Included),
  };
  lanes.L2_full_core.gate.elapsedMs = l2Stats.p95Ms;
  lanes.L2_full_core.gate.status = l2Pass ? 'pass' : 'fail';
  lanes.L2_full_core.gate.budget_weakened = false;
  lanes.L2_full_core.gate.note = note || (l2Pass
    ? 'L2 p95 is under 200 ms on extension clocks with f17.ok.'
    : 'G11 remains fail until a qualifying L2 run exists.');
  const attemptsOk = scored.filter((attempt) => attempt.f17.ok && attempt.lane !== 'L0_strip_local').length;
  const attemptsExcluded = scored.filter((attempt) => attempt.lane === 'L2_full_core' && !attempt.warmup && !attempt.includeInGate).length;
  const status = l2Pass ? 'pass' : 'fail';
  return {
    name: 'core-latency-warden-option-c',
    schemaVersion: 1,
    generatedAt,
    suiteId: config.suiteId,
    frozenCore: {
      surface: 'root-extension+warden',
      loop: ['PERCEIVE', 'STRIP', 'PLAN', 'VALIDATE', 'EXECUTE'],
      warden: WARDEN_ORIGIN,
      notCore: ['prototype:9041', 'Prototype/extension', 'privacy-only'],
    },
    planner: {
      label: plannerLabel,
      detail: planner?.detail || (plannerLabel === 'unknown' ? 'unverified' : plannerLabel),
      endpointRole: 'plan',
      phase1DefaultLock: true,
    },
    budgetMs: BUDGET_MS,
    warmups: config.warmups,
    sampleCount: config.sampleCount,
    pages: [...config.pages],
    timingModel: 'exclusive',
    lanes,
    f17: {
      requireOpTierLocal: true,
      attemptsOk,
      attemptsExcluded,
    },
    attempts: scored,
    honesty: HONESTY,
    status,
    acceptance: {
      rule: 'G11',
      required: 'p95 end-to-end <200ms, n≥100 after 10 warmups per frozen core flow',
      status,
      budget_weakened: false,
      eligible: sampleEligible,
    },
    predecessor: 'Benchmarks/results/core-latency.json',
  };
}

export function configPreconditionFailures(repoRoot) {
  const failures = [];
  const badCases = [
    {
      label: 'budgetMs raised',
      config: { budgetMs: 500 },
    },
    {
      label: 'warden port 9041',
      config: { wardenBaseUrl: 'http://127.0.0.1:9041' },
    },
    {
      label: 'Prototype extension',
      config: { extensionPath: resolve(repoRoot, 'Prototype', 'extension') },
    },
    {
      label: 'historical core-latency.json',
      config: { outPath: 'Benchmarks/results/core-latency.json' },
    },
  ];
  for (const item of badCases) {
    try {
      validateConfig({ ...baseConfig(repoRoot, ['file:///tmp/g11-option-c-page.html']), ...item.config }, repoRoot);
      failures.push(`${item.label}: validation unexpectedly passed`);
    } catch (error) {
      failures.push(`${item.label}: ${(error.failures || [error.message]).join('; ')}`);
    }
  }
  return failures;
}

export function baseConfig(repoRoot, pages) {
  return {
    suiteId: SUITE_ID,
    lane: 'L2_full_core',
    wardenBaseUrl: WARDEN_ORIGIN,
    planner: { endpointRole: 'plan', phase1DefaultLock: true },
    extensionPath: resolve(repoRoot, 'extension'),
    pages,
    warmups: 10,
    sampleCount: 100,
    budgetMs: BUDGET_MS,
    f17: { requireOpTierLocal: true, trustServerRequiresConfirmation: false },
    executePolicy: 'scripted_confirm',
    outPath: `Benchmarks/results/${ARTIFACT_NAME}`,
  };
}

export function missingStageReasons() {
  return {
    perceive: 'no extension stage clock was collected',
    strip: 'no extension stage clock was collected',
    plan: 'no extension stage clock was collected',
    validate: 'no extension stage clock was collected',
    f17_local_tier: 'no extension stage clock was collected',
    execute: 'no extension stage clock was collected',
    total: 'no extension stage clock was collected',
  };
}

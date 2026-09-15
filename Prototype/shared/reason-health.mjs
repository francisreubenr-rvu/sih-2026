/**
 * Reason-path planner health helpers (Ollama reachability).
 * Small, safe pre-Send probe — does not start Ollama, does not claim G11.
 */

export const REASON_HEALTH_PATH = '/api/v1/health';
export const DEFAULT_REASON_ORIGIN = 'http://127.0.0.1:9041';
export const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434';

/**
 * @param {string} [origin]
 * @param {{ probePlanner?: boolean }} [opts]
 */
export function reasonHealthUrl(origin = DEFAULT_REASON_ORIGIN, opts = {}) {
  const base = String(origin || DEFAULT_REASON_ORIGIN).replace(/\/$/, '');
  const url = new URL(REASON_HEALTH_PATH, `${base}/`);
  if (opts.probePlanner) url.searchParams.set('planner', '1');
  return url.toString();
}

/**
 * Ping Ollama /api/tags with a short timeout.
 * @param {{ baseUrl?: string, timeoutMs?: number, fetchImpl?: typeof fetch, expectedModel?: string }} [opts]
 */
export async function pingOllamaTags(opts = {}) {
  const baseUrl = opts.baseUrl || DEFAULT_OLLAMA_BASE;
  const timeoutMs = opts.timeoutMs ?? 1500;
  const fetchImpl = opts.fetchImpl || fetch;
  const started = performance.now();
  try {
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      return {
        reachable: false,
        latencyMs: Math.round(performance.now() - started),
        modelsListed: 0,
        sampleModels: [],
        expectedModelPresent: false,
        error: 'invalid_base_url',
      };
    }
    const response = await fetchImpl(new URL('/api/tags', base), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        reachable: false,
        latencyMs: Math.round(performance.now() - started),
        modelsListed: 0,
        sampleModels: [],
        expectedModelPresent: false,
        error: `http_${response.status}`,
      };
    }
    const body = await response.json().catch(() => ({}));
    const names = Array.isArray(body?.models)
      ? body.models.map((m) => (typeof m?.name === 'string' ? m.name : '')).filter(Boolean)
      : [];
    const expected = opts.expectedModel || '';
    const expectedModelPresent = expected
      ? names.some((n) => n === expected || n.startsWith(`${expected}:`) || n.startsWith(expected))
      : false;
    return {
      reachable: true,
      latencyMs: Math.round(performance.now() - started),
      modelsListed: names.length,
      sampleModels: names.slice(0, 3),
      expectedModelPresent,
      error: null,
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Math.round(performance.now() - started),
      modelsListed: 0,
      sampleModels: [],
      expectedModelPresent: false,
      error: String(err?.name || err?.message || err || 'unreachable').slice(0, 80),
    };
  }
}

/**
 * Interpret a /api/v1/health JSON body for Reason pre-Send gating.
 * @param {unknown} body
 */
export function interpretReasonHealth(body) {
  const data = body && typeof body === 'object' ? body.data : null;
  if (!data || typeof data !== 'object') {
    return { serverReady: false, plannerReachable: false, detail: 'invalid_health_body' };
  }
  const serverReady = data.status === 'ready';
  const planner = data.planner;
  if (!planner || typeof planner !== 'object') {
    return {
      serverReady,
      plannerReachable: false,
      detail: 'planner_not_probed',
      planner: null,
    };
  }
  const reachable = Boolean(planner.reachable);
  return {
    serverReady,
    plannerReachable: reachable,
    detail: reachable ? 'planner_reachable' : (planner.error || 'planner_unreachable'),
    planner,
  };
}

/**
 * Fetch local prototype health with optional Ollama probe (via server).
 * @param {{ origin?: string, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function checkReasonHealthBeforeSend(opts = {}) {
  const origin = opts.origin || DEFAULT_REASON_ORIGIN;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const fetchImpl = opts.fetchImpl || fetch;
  const url = reasonHealthUrl(origin, { probePlanner: true });
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ok: false,
        serverReady: false,
        plannerReachable: false,
        detail: `health_http_${response.status}`,
        planner: null,
      };
    }
    const body = await response.json().catch(() => null);
    const interpreted = interpretReasonHealth(body);
    return {
      ok: interpreted.serverReady && interpreted.plannerReachable,
      ...interpreted,
    };
  } catch (err) {
    return {
      ok: false,
      serverReady: false,
      plannerReachable: false,
      detail: String(err?.message || err || 'health_fetch_failed').slice(0, 120),
      planner: null,
    };
  }
}

/**
 * Client resource measurement hooks for SIH26171 rubric (20% weight).
 * Reports JS heap and timing where the environment exposes them.
 * Never invents process CPU, total RSS, or energy numbers.
 */

/** Snapshot JS heap if Chromium exposes performance.memory; else null fields. */
export function readJsHeap(perf = globalThis.performance) {
  const mem = perf?.memory;
  if (!mem || !Number.isFinite(mem.usedJSHeapSize)) {
    return {
      available: false,
      usedJSHeapSize: null,
      totalJSHeapSize: null,
      jsHeapSizeLimit: null,
      note: 'performance.memory unavailable in this runtime (common outside Chromium).',
    };
  }
  return {
    available: true,
    usedJSHeapSize: mem.usedJSHeapSize,
    totalJSHeapSize: mem.totalJSHeapSize,
    jsHeapSizeLimit: mem.jsHeapSizeLimit,
    note: 'JS heap only. Excludes WASM process RSS, GPU, and energy.',
  };
}

/** Environment hints that are safe to log (no PII). */
export function readClientEnvironment(nav = globalThis.navigator) {
  return {
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemoryGB: nav?.deviceMemory ?? null,
    userAgentPresent: Boolean(nav?.userAgent),
    // Deliberately omit full UA string from persisted extension metrics to reduce fingerprint surface in shared logs.
  };
}

/**
 * Wrap a sync or async operation with elapsed timing + optional heap before/after.
 * Does not claim full-flow latency; callers must label the stage.
 */
export async function measureStage(name, fn, { includeHeap = true } = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Stage name required');
  if (typeof fn !== 'function') throw new Error('Stage function required');
  const startedAt = Date.now();
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const heapBefore = includeHeap ? readJsHeap() : null;
  let result;
  let error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const heapAfter = includeHeap ? readJsHeap() : null;
  const record = {
    stage: name,
    elapsedMs,
    startedAt: new Date(startedAt).toISOString(),
    heapBefore,
    heapAfter,
    heapDeltaBytes:
      heapBefore?.available && heapAfter?.available
        ? heapAfter.usedJSHeapSize - heapBefore.usedJSHeapSize
        : null,
    ok: !error,
    error: error ? String(error.message || error) : null,
    status: 'partial_diagnostic_only',
    limitations: [
      'Stage timing is local wall/high-res time for one operation, not official full-flow latency.',
      'JS heap excludes total process memory, WASM allocator RSS, and energy.',
    ],
  };
  if (error) throw Object.assign(error, { clientResourceRecord: record });
  return { result, record };
}

/**
 * Aggregate stage records into a rubric-facing client-resources diagnostic.
 * observed remains null until a declared device budget protocol is met.
 */
export function summarizeClientResources(stages = [], env = null) {
  if (!Array.isArray(stages)) throw new Error('stages must be an array');
  const elapsed = stages.map(s => s.elapsedMs).filter(Number.isFinite);
  const heaps = stages
    .map(s => s.heapAfter?.usedJSHeapSize)
    .filter(n => Number.isFinite(n));
  return {
    metric: 'client-resources',
    status: 'partial_diagnostic_only',
    observed: null,
    environment: env || readClientEnvironment(),
    stageCount: stages.length,
    stageElapsedMs: elapsed.length
      ? {
          min: Math.min(...elapsed),
          max: Math.max(...elapsed),
          mean: elapsed.reduce((a, b) => a + b, 0) / elapsed.length,
        }
      : null,
    peakUsedJsHeapSize: heaps.length ? Math.max(...heaps) : null,
    stages,
    note: 'Diagnostic only. Not a process-memory or energy budget pass.',
  };
}

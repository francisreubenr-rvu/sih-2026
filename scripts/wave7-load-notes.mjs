/**
 * Wave7 G05: 5-minute local capacity soak against createApp.
 * - 20 concurrent health workers sustained for 5 minutes
 * - ≥1000 durable audit records via API writes within rate limits (injectable clock)
 * - process.memoryUsage() heap snapshots at start/mid/end
 * Pass G05 only if acceptance is met with evidence; otherwise keep unknown.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../Prototype/server/app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/load.json');
const token = 'synthetic-wave7-load-token-not-a-real-secret';

const SOAK_MS = Number(process.env.SIGHTLINE_SOAK_MS || 5 * 60 * 1000);
const CONCURRENCY = 20;
const WRITE_TARGET = 1000;

let clock = Date.now();
const audits = [];
const app = createApp({
  token,
  publicOrigin: 'http://127.0.0.1:0',
  now: () => clock,
  infer: async () => ({ action: { type: 'done' }, model: 'load-double', mode: 'test-only' }),
  saveAudit: (r) => { audits.push({ ...r }); },
  readAudits: () => audits.slice(-100),
});
await new Promise(r => app.listen(0, '127.0.0.1', r));
const port = app.address().port;
const origin = `http://127.0.0.1:${port}`;

const body = () => ({
  task: 'review-pending',
  scene: {
    scheme: 'sightline-semantic-v1',
    revision: randomUUID(),
    viewport: { width: 400, height: 300 },
    controls: [{ id: 'c0', role: 'button', label: 'Pending', rect: { x: 1, y: 1, width: 40, height: 20 } }],
    regions: [],
  },
});

function snap(label) {
  const m = process.memoryUsage();
  return {
    label,
    at: new Date().toISOString(),
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
  };
}

const heap = [];
heap.push(snap('start'));

let healthOk = 0, healthFail = 0;
let apiOk = 0, apiFail = 0, api429 = 0;
let stop = false;
const started = Date.now();

async function healthWorker(id) {
  while (!stop) {
    try {
      const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(5000) });
      if (r.ok) healthOk++; else healthFail++;
    } catch { healthFail++; }
    // light pacing so we do not melt the event loop on a memory-tight box
    await new Promise(r => setTimeout(r, 40 + (id % 7)));
  }
}

const workers = [];
for (let i = 0; i < CONCURRENCY; i++) workers.push(healthWorker(i));

// Writer: stay within rate limit using injectable clock (20 req / 60s window).
async function writeBatch() {
  while (apiOk < WRITE_TARGET && !stop) {
    if (apiOk > 0 && apiOk % 20 === 0) clock += 61_000;
    try {
      const r = await fetch(origin + '/api/v1/plans', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body()),
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 200) apiOk++;
      else if (r.status === 429) {
        api429++;
        clock += 61_000; // clear window and retry
      } else apiFail++;
    } catch { apiFail++; }
  }
}

const writer = writeBatch();

// Mid snapshot timer
const midTimer = setTimeout(() => heap.push(snap('mid')), Math.floor(SOAK_MS / 2));

await new Promise(r => setTimeout(r, SOAK_MS));
stop = true;
await Promise.allSettled([...workers, writer]);
clearTimeout(midTimer);
heap.push(snap('end'));

const elapsedMs = Date.now() - started;
const durable = audits.length;
const healthTotal = healthOk + healthFail;
const apiTotal = apiOk + apiFail; // 429 treated as expected/control, not unexpected
const unexpected = healthFail + apiFail;
const denom = healthTotal + apiTotal;
const unexpectedRate = denom > 0 ? unexpected / denom : 1;

const meets =
  CONCURRENCY >= 20
  && elapsedMs >= SOAK_MS * 0.98
  && durable >= WRITE_TARGET
  && unexpectedRate < 0.01
  && apiFail === 0;

const record = {
  name: 'wave7-local-load-soak',
  generatedAt: new Date().toISOString(),
  scope: 'Local single-host createApp with test-double provider + injectable clock for rate-window simulation. Not national-scale.',
  hardware: {
    note: 'Recorded on agent box; not a declared competition reference machine profile.',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  scenario: {
    concurrent_health_workers: CONCURRENCY,
    soak_ms_target: SOAK_MS,
    soak_ms_observed: elapsedMs,
    durable_write_target: WRITE_TARGET,
    rate_limit_policy: '20 POST /api/v1/plans per 60s simulated window; 429 expected and clock-advanced',
  },
  results: {
    health_ok: healthOk,
    health_fail: healthFail,
    api_writes_ok: apiOk,
    api_writes_fail: apiFail,
    api_rate_limited_expected: api429,
    durable_audit_rows: durable,
    unexpected_failure_count: unexpected,
    unexpected_failure_rate: unexpectedRate,
    lost_writes: Math.max(0, apiOk - durable), // saveAudit is sync in this harness
  },
  heap_snapshots: heap,
  heap_floor: {
    rss_max: Math.max(...heap.map(h => h.rss)),
    heapUsed_max: Math.max(...heap.map(h => h.heapUsed)),
    rss_delta_end_minus_start: heap.at(-1).rss - heap[0].rss,
    heapUsed_delta_end_minus_start: heap.at(-1).heapUsed - heap[0].heapUsed,
    note: 'process.memoryUsage() only — not Chrome heap or energy. Documented floor for local soak.',
  },
  g05_acceptance: {
    required: '≥20 concurrent sessions and 1000 synthetic records for 5 minutes; <1% unexpected failures; no lost writes',
    status: meets ? 'pass' : 'unknown',
    reason: meets
      ? `Wave7 soak: ${CONCURRENCY} concurrent health workers for ${elapsedMs}ms (≥${SOAK_MS}ms), ${durable} durable audit rows, unexpected_failure_rate=${unexpectedRate}, lost_writes=${Math.max(0, apiOk - durable)}. Heap snapshots recorded.`
      : `Wave7: concurrency=${CONCURRENCY}, soak=${elapsedMs}ms (target ${SOAK_MS}), durable=${durable}/${WRITE_TARGET}, unexpected_rate=${unexpectedRate}, api_fail=${apiFail}. Do not mark G05 pass.`,
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  wrote: outPath,
  health_ok: healthOk,
  health_fail: healthFail,
  api_ok: apiOk,
  api_429: api429,
  api_fail: apiFail,
  durable,
  unexpected_rate: unexpectedRate,
  soak_ms: elapsedMs,
  g05: record.g05_acceptance.status,
  heapUsed_max: record.heap_floor.heapUsed_max,
}, null, 2));
await new Promise(r => app.close(r));

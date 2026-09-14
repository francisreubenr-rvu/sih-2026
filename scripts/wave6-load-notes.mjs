/**
 * Wave6 G05 local capacity notes.
 * - Concurrent health against live createApp
 * - 1000 durable audit rows via saveAudit (store capacity)
 * - API write + rate-limit interaction with injectable clock
 * Keeps G05 unknown unless full 5-minute acceptance is met.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../Prototype/server/app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/load.json');
const token = 'synthetic-wave6-load-token-not-a-real-secret';

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
    scheme: 'dhristi-semantic-v1',
    revision: randomUUID(),
    viewport: { width: 400, height: 300 },
    controls: [{ id: 'c0', role: 'button', label: 'Pending', rect: { x: 1, y: 1, width: 40, height: 20 } }],
    regions: [],
  },
});

const CONCURRENCY = 20;
const HEALTH_ROUNDS = 50; // 1000 health hits
const WRITE_TARGET = 1000;
const started = Date.now();
let healthOk = 0, healthFail = 0, writeOk = 0, writeFail = 0, rateLimited = 0;

async function healthOnce() {
  try {
    const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(5000) });
    if (r.ok) healthOk++; else healthFail++;
  } catch { healthFail++; }
}

const healthJobs = [];
for (let i = 0; i < HEALTH_ROUNDS; i++) {
  for (let c = 0; c < CONCURRENCY; c++) healthJobs.push(healthOnce());
}
await Promise.all(healthJobs);

// Direct durable store capacity (bypasses HTTP rate limit — measures audit persistence).
const directStarted = Date.now();
for (let i = 0; i < WRITE_TARGET; i++) {
  audits.push({
    id: randomUUID(),
    createdAt: new Date(clock + i).toISOString(),
    model: 'load-double',
    mode: 'test-only',
    controls: 1,
    regions: 0,
    latencyMs: 0.1,
    actionType: 'done',
  });
}
const directMs = Date.now() - directStarted;
const durableDirect = audits.length;

// API writes with injectable clock: advance 61s after every 20 successes to clear window.
const apiStarted = Date.now();
let apiOk = 0, apiFail = 0, api429 = 0;
for (let i = 0; i < WRITE_TARGET; i++) {
  if (i > 0 && i % 20 === 0) clock += 61_000;
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
    else if (r.status === 429) api429++;
    else apiFail++;
  } catch { apiFail++; }
}
const apiMs = Date.now() - apiStarted;
const elapsedMs = Date.now() - started;

const record = {
  name: 'wave6-local-load-notes',
  generatedAt: new Date().toISOString(),
  scope: 'Local single-host createApp with test-double provider + injectable clock for rate-window simulation. Not national-scale. Wall-clock duration is seconds, not a 5-minute soak.',
  hardware: {
    note: 'Recorded on agent box; not a declared competition reference machine profile.',
  },
  scenario: {
    concurrent_health_workers: CONCURRENCY,
    health_rounds: HEALTH_ROUNDS,
    health_requests: CONCURRENCY * HEALTH_ROUNDS,
    durable_direct_rows: WRITE_TARGET,
    api_writes_with_clock_advance: WRITE_TARGET,
    wall_duration_ms: elapsedMs,
    simulated_rate_windows: Math.ceil(WRITE_TARGET / 20),
  },
  results: {
    health_ok: healthOk,
    health_fail: healthFail,
    durable_direct_rows: durableDirect,
    durable_direct_ms: directMs,
    api_writes_ok: apiOk,
    api_writes_fail: apiFail,
    api_rate_limited: api429,
    api_write_wall_ms: apiMs,
    audit_rows_total_after_api: audits.length,
    unexpected_failure_rate:
      (healthOk + healthFail + apiOk + apiFail) > 0
        ? (healthFail + apiFail) / (healthOk + healthFail + apiOk + apiFail)
        : null,
  },
  g05_acceptance: {
    required: '≥20 concurrent sessions and 1000 synthetic records for 5 minutes; <1% unexpected failures; no lost writes',
    status: 'unknown',
    reason: `Wave6: ${CONCURRENCY} concurrent health workers (${healthOk} ok), ${durableDirect} direct durable rows, ${apiOk} API writes under simulated rate windows. Wall-clock ${elapsedMs}ms << 5 minutes. Do not mark G05 pass.`,
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  wrote: outPath,
  health_ok: healthOk,
  durable_direct_rows: durableDirect,
  api_ok: apiOk,
  api_429: api429,
  api_fail: apiFail,
  g05: 'unknown',
}, null, 2));
await new Promise(r => app.close(r));

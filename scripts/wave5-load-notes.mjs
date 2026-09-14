/**
 * Wave5: lightweight local capacity notes for G05.
 * Runs a bounded concurrent health+plan-rejection load against the local
 * prototype when available. Does NOT claim national-scale capacity.
 * Writes Benchmarks/results/load.json with honest scope.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/load.json');
const origin = 'http://127.0.0.1:9041';

async function ensureServer() {
  try {
    const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1500) });
    if (r.ok) return { started: false, child: null };
  } catch { /* */ }
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.mjs'], {
    cwd: join(root, 'Prototype'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '9041', HOST: '127.0.0.1' },
  });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1000) });
      if (r.ok) return { started: true, child };
    } catch { /* */ }
  }
  child.kill('SIGTERM');
  throw new Error('server not healthy');
}

const handle = await ensureServer();
const CONCURRENCY = 20;
const ROUNDS = 25; // 20*25 = 500 health hits; plus malformed writes
const started = Date.now();
let healthOk = 0, healthFail = 0, rejectOk = 0, rejectFail = 0;

async function healthOnce() {
  try {
    const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(3000) });
    if (r.ok) healthOk++; else healthFail++;
  } catch { healthFail++; }
}

async function badWriteOnce() {
  try {
    const r = await fetch(origin + '/api/v1/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ screenshot: 'data:image/png;base64,AAAA', task: 'x' }),
      signal: AbortSignal.timeout(3000),
    });
    // Expect controlled 4xx, not 5xx
    if (r.status >= 400 && r.status < 500) rejectOk++;
    else rejectFail++;
  } catch { rejectFail++; }
}

const jobs = [];
for (let i = 0; i < ROUNDS; i++) {
  for (let c = 0; c < CONCURRENCY; c++) jobs.push(healthOnce());
}
for (let i = 0; i < 50; i++) jobs.push(badWriteOnce());
await Promise.all(jobs);
const elapsedMs = Date.now() - started;

const record = {
  name: 'wave5-local-load-notes',
  generatedAt: new Date().toISOString(),
  scope: 'Local single-host prototype only. Not national-scale. Not 5-minute soak with 1000 durable records.',
  hardware: {
    note: 'Recorded on agent box; not a declared competition reference machine profile.',
  },
  scenario: {
    concurrent_health_workers: CONCURRENCY,
    health_rounds: ROUNDS,
    health_requests: CONCURRENCY * ROUNDS,
    malformed_plan_posts: 50,
    duration_ms: elapsedMs,
  },
  results: {
    health_ok: healthOk,
    health_fail: healthFail,
    malformed_controlled_4xx: rejectOk,
    malformed_unexpected: rejectFail,
    unexpected_failure_rate:
      (healthOk + healthFail + rejectOk + rejectFail) > 0
        ? (healthFail + rejectFail) / (healthOk + healthFail + rejectOk + rejectFail)
        : null,
  },
  g05_acceptance: {
    required: '≥20 concurrent sessions and 1000 synthetic records for 5 minutes; <1% unexpected failures; no lost writes',
    status: 'unknown',
    reason: 'Wave5 records a short concurrent health + malformed-reject probe only. Full 5-minute / 1000-record durable capacity floor not executed. Do not mark G05 pass.',
  },
  server_started_by_harness: handle.started,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ wrote: outPath, ...record.results, g05: record.g05_acceptance.status }, null, 2));
if (handle.child) {
  handle.child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
}

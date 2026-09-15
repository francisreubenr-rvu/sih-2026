#!/usr/bin/env node
/**
 * One-command Fast-path judge harness — no Ollama required.
 *
 * Runs:
 *  1) Prototype unit tests with OLLAMA_URL forced unreachable (same as test:ci)
 *  2) Local Score-path heuristic self-check (officialScore must stay null)
 *  3) Privacy-only latency microbench (G11 stays fail; Fast ≠ G11)
 *  4) Score path ↔ Wave6 held-out fixture bridge (official/WebPII null)
 *  5) Sanitize assertion on a synthetic semantics-only payload
 *
 * Usage (repo root):
 *   node scripts/judge-fast-path.mjs
 *   # or: cd Prototype && npm run judge:fast
 *
 * Writes Benchmarks/results/judge-fast-path.json
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { assertSanitizedPayload } from '../Prototype/shared/rubric-hooks.mjs';
import { computeLocalRiskScore, scoreHeldOutFixtureDocument } from '../Prototype/shared/score-path.mjs';
import { OPERATING_MODES, summarizeLatencyBreakdown, THREE_PATHS } from '../Prototype/shared/latency-strategy.mjs';
import { redactSelective } from '../Prototype/shared/selective-redaction.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/judge-fast-path.json');
const started = new Date().toISOString();
const checks = {};

function record(name, status, detail = {}) {
  checks[name] = { status, ...detail, at: new Date().toISOString() };
  const mark = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : status.toUpperCase();
  console.log(`[${mark}] ${name}${detail.message ? ` — ${detail.message}` : ''}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || root,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// --- 1) Unit tests without Ollama ---
{
  const t0 = performance.now();
  const result = await run('npm', ['run', 'test:ci'], {
    cwd: join(root, 'Prototype'),
    env: {
      OLLAMA_URL: 'http://127.0.0.1:9',
      DHRISTI_CI: '1',
    },
  });
  const elapsedMs = Math.round(performance.now() - t0);
  const passMatch = result.stdout.match(/# (?:pass|tests)\s+(\d+)/gi) || [];
  const summaryLine = (result.stdout + result.stderr).split('\n').filter((l) => /# (pass|fail|tests)/i.test(l)).slice(-5);
  if (result.code === 0) {
    record('unit_tests_ollama_unreachable', 'pass', {
      elapsedMs,
      exitCode: 0,
      summary: summaryLine,
      message: 'npm run test:ci passed with OLLAMA_URL=http://127.0.0.1:9',
    });
  } else {
    record('unit_tests_ollama_unreachable', 'fail', {
      elapsedMs,
      exitCode: result.code,
      summary: summaryLine,
      stderrTail: result.stderr.slice(-800),
      message: 'Unit tests failed without Ollama',
    });
  }
}

// --- 2) Score path honesty ---
{
  try {
    const risk = computeLocalRiskScore({
      scene: {
        controls: [{ id: 'c1', label: 'Pending' }],
        regions: [{ kind: 'face' }, { kind: 'field' }],
      },
    });
    if (risk.officialScore !== null) throw new Error('officialScore must be null');
    if (THREE_PATHS.score.status !== 'partial_runnable') throw new Error('Score path not marked partial_runnable');
    if (risk.rubricWeightsReferenced.combinedApproxPercent !== 65) throw new Error('expected ≈65% organizer weight reference');
    const mode = summarizeLatencyBreakdown({
      stages: [{ name: 'protect', elapsedMs: 90 }],
      mode: 'score',
    });
    if (mode.gate.status !== 'fail') throw new Error('Score/Fast timing must not pass G11');
    record('score_path_local_heuristic', 'pass', {
      band: risk.band,
      points: risk.points,
      officialScore: risk.officialScore,
      threePathStatus: THREE_PATHS.score.status,
      message: 'Local Score risk runs; officialScore null; G11 not claimed',
    });
  } catch (err) {
    record('score_path_local_heuristic', 'fail', { message: String(err.message || err) });
  }
}

// --- 3) Fast protect microbench (not G11) ---
{
  try {
    const W = 160, H = 120;
    const buf = new Uint8ClampedArray(W * H * 4);
    buf.fill(40);
    const regions = [{ kind: 'face', rect: { x: 8, y: 8, width: 32, height: 32 } }];
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      redactSelective(buf, W, H, regions, { blockSize: 8, padding: 0 });
      samples.push(performance.now() - t0);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const breakdown = summarizeLatencyBreakdown({
      stages: [{ name: 'selective_redact', elapsedMs: mean }],
      mode: OPERATING_MODES.privacy_only,
    });
    if (breakdown.gate.status !== 'fail') throw new Error('Privacy-only must keep G11 fail');
    record('fast_path_microbench', 'pass', {
      samples: samples.length,
      meanMs: Number(mean.toFixed(3)),
      g11: breakdown.gate.status,
      message: 'Fast protect microbench recorded; G11 remains fail (Fast ≠ G11)',
    });
  } catch (err) {
    record('fast_path_microbench', 'fail', { message: String(err.message || err) });
  }
}

// --- 4) Score path ↔ held-out fixture bridge ---
{
  try {
    const fixturePath = join(root, 'Benchmarks/datasets/wave6-heldout-pii-fixtures.json');
    const doc = JSON.parse(await readFile(fixturePath, 'utf8'));
    const bridged = scoreHeldOutFixtureDocument(doc, { sourcePath: 'Benchmarks/datasets/wave6-heldout-pii-fixtures.json' });
    if (bridged.officialScore !== null) throw new Error('officialScore must stay null');
    if (bridged.webPiiScore !== null) throw new Error('webPiiScore must stay null');
    if (bridged.caseCount !== 24) throw new Error(`expected 24 cases, got ${bridged.caseCount}`);
    record('score_heldout_bridge', 'pass', {
      caseCount: bridged.caseCount,
      bandCounts: bridged.bandCounts,
      message: 'Wave6 held-out fixtures bridged to local risk bands; official/WebPII scores null',
    });
  } catch (err) {
    record('score_heldout_bridge', 'fail', { message: String(err.message || err) });
  }
}

// --- 5) Sanitize semantics-only payload ---
{
  try {
    const body = {
      task: 'review-pending',
      scene: {
        scheme: 'dhristi-semantic-v1',
        revision: 'judge-fast',
        viewport: { width: 320, height: 200 },
        controls: [{ id: '1', role: 'button', label: 'Pending', rect: { x: 10, y: 10, width: 80, height: 24 } }],
        regions: [{ kind: 'face', rect: { x: 20, y: 40, width: 40, height: 40 } }],
      },
    };
    assertSanitizedPayload(body);
    let rejected = false;
    try {
      assertSanitizedPayload({ ...body, screenshot: 'data:image/png;base64,xxx' });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Expected screenshot payload to be rejected');
    record('sanitize_semantics_only', 'pass', {
      message: 'Semantics-only payload accepted; screenshot field rejected',
    });
  } catch (err) {
    record('sanitize_semantics_only', 'fail', { message: String(err.message || err) });
  }
}

const judged = Object.values(checks);
const passed = judged.filter((c) => c.status === 'pass').length;
const failed = judged.filter((c) => c.status === 'fail').length;
const recordOut = {
  name: 'judge-fast-path',
  generatedAt: new Date().toISOString(),
  startedAt: started,
  ollamaRequired: false,
  ollamaUrlForced: 'http://127.0.0.1:9',
  purpose: 'One-command Fast (+ Score diagnostic) judge path without Ollama',
  honesty: [
    'Does not claim G11 pass.',
    'Does not invent WebPII or official SIH weighted scores.',
    'Score path officialScore remains null.',
    'submission_ready must stay false.',
  ],
  checks,
  summary: { passed, failed, total: judged.length, status: failed ? 'fail' : 'pass' },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(recordOut, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`Summary: ${passed}/${judged.length} pass (Ollama not required)`);
process.exit(failed ? 1 : 0);

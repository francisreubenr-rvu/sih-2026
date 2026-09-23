import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createG11Trace } from '../extension/utils/g11-stage-clock.js';
import { runHarness } from './g11-warden-option-c-harness.mjs';
import {
  baseConfig,
  buildArtifact,
  classifyPlannerProbe,
  probePlanner,
  scoreAttempt,
  validateConfig,
} from './g11-warden-option-c-lib.mjs';

const repoRoot = resolve(import.meta.dirname, '..');

function extensionAttempt(i, totalMs, extra = {}) {
  const stagesMs = {
    perceive: 1,
    strip: 1,
    plan: 1,
    validate: 1,
    f17_local_tier: 1,
    execute: 1,
    total: totalMs,
  };
  return scoreAttempt({
    i,
    warmup: false,
    page: 'file:///synthetic/g11-option-c-page.html',
    lane: 'L2_full_core',
    plannerLabel: 'ollama',
    clockSource: 'extension',
    terminal: 'ok',
    stagesMs,
    f17Steps: [{
      opTierLocalComputed: true,
      localTier: 'navigational',
      wardenTier: 'navigational',
      tiersAgree: true,
      trustedServerRequiresConfirmationAlone: false,
      unattendedExecuteAllowed: true,
      gatePath: 'unattended_ok',
      bypassedLocalTier: false,
    }],
    ...extra,
  });
}

test('budgetMs other than 200 is refused', () => {
  for (const budgetMs of [199, 201, 0]) {
    assert.throws(() => validateConfig({ ...baseConfig(repoRoot, ['file:///tmp/page.html']), budgetMs }, repoRoot), /200/);
  }
});

test('warden origin, prototype extension, and historical latency file are refused', () => {
  assert.throws(() => validateConfig({
    ...baseConfig(repoRoot, ['file:///tmp/page.html']),
    wardenBaseUrl: 'http://127.0.0.1:9041',
  }, repoRoot), /8756/);
  assert.throws(() => validateConfig({
    ...baseConfig(repoRoot, ['file:///tmp/page.html']),
    wardenBaseUrl: 'http://localhost:8756',
  }, repoRoot), /8756/);
  assert.throws(() => validateConfig({
    ...baseConfig(repoRoot, ['file:///tmp/page.html']),
    extensionPath: join(repoRoot, 'Prototype/extension'),
  }, repoRoot), /Prototype/);
  assert.throws(() => validateConfig({
    ...baseConfig(repoRoot, ['file:///tmp/page.html']),
    outPath: 'Benchmarks/results/core-latency.json',
  }, repoRoot), /core-latency/);
});

test('privacy-only artifact does not set mayFlipG11', () => {
  const config = validateConfig({
    ...baseConfig(repoRoot, ['file:///tmp/page.html']),
    lane: 'L0_strip_local',
    privacyOnly: true,
    executePolicy: null,
  }, repoRoot);
  const artifact = buildArtifact({
    config,
    planner: { label: 'unknown', detail: 'unverified' },
    attempts: [],
    privacyOnly: true,
    note: 'privacy-only',
  });
  assert.equal(artifact.lanes.L0_strip_local.mayFlipG11, false);
  assert.equal(artifact.lanes.L1_plan_validate.mayFlipG11, false);
  assert.equal(artifact.lanes.L2_full_core.mayFlipG11, false);
  assert.equal(artifact.status, 'fail');
  assert.equal(artifact.acceptance.budget_weakened, false);
  assert.equal(artifact.lanes.L2_full_core.gate.budget_weakened, false);
});

test('f17 bypass is excluded from the L2 aggregate', () => {
  const good = extensionAttempt(0, 20);
  const bypass = extensionAttempt(1, 5, {
    f17Steps: [{
      opTierLocalComputed: false,
      localTier: null,
      wardenTier: 'reversible',
      tiersAgree: false,
      trustedServerRequiresConfirmationAlone: false,
      unattendedExecuteAllowed: true,
      gatePath: 'unattended_ok',
      bypassedLocalTier: true,
    }],
  });
  assert.equal(good.includeInGate, true);
  assert.equal(bypass.includeInGate, false);
  assert.equal(bypass.f17.ok, false);
  const config = validateConfig(baseConfig(repoRoot, ['file:///tmp/page.html']), repoRoot);
  const artifact = buildArtifact({
    config,
    planner: { label: 'ollama', detail: 'ollama@127.0.0.1:11434' },
    attempts: [good, bypass],
  });
  assert.equal(artifact.lanes.L2_full_core.aggregates.n, 1);
  assert.equal(artifact.f17.attemptsExcluded, 1);
  assert.equal(artifact.status, 'fail');
});

test('foldF17 rejects a null local tier or a tier error', () => {
  const missingTier = scoreAttempt({
    i: 0,
    warmup: false,
    page: 'file:///tmp/page.html',
    lane: 'L2_full_core',
    plannerLabel: 'ollama',
    clockSource: 'extension',
    terminal: 'ok',
    stagesMs: {
      perceive: 1, strip: 1, plan: 1, validate: 1, f17_local_tier: 1, execute: 1, total: 10,
    },
    f17Steps: [{
      opTierLocalComputed: true,
      localTier: null,
      wardenTier: null,
      tiersAgree: false,
      trustedServerRequiresConfirmationAlone: false,
      unattendedExecuteAllowed: false,
      gatePath: 'reject',
      bypassedLocalTier: false,
      tierError: true,
    }],
  });
  assert.equal(missingTier.f17.ok, false);
  assert.equal(missingTier.includeInGate, false);
});

test('missing stage stays null and cannot pass G11', () => {
  const partial = extensionAttempt(0, 10, {
    stagesMs: { perceive: 4, strip: 4, plan: 4, validate: 4, f17_local_tier: 1, execute: null, total: 10 },
    stageReasons: { execute: 'execute did not run' },
  });
  assert.equal(partial.stagesMs.execute, null);
  assert.equal(partial.stageReasons.execute, 'execute did not run');
  assert.equal(partial.includeInGate, false);
});

test('qualifying extension clocks can pass the gate object without touching release status', () => {
  const attempts = [];
  for (let i = 0; i < 100; i += 1) attempts.push(extensionAttempt(i, 20 + (i % 5)));
  const config = validateConfig(baseConfig(repoRoot, ['file:///tmp/page.html']), repoRoot);
  const artifact = buildArtifact({
    config,
    planner: { label: 'ollama', detail: 'ollama@127.0.0.1:11434' },
    attempts,
  });
  assert.equal(artifact.lanes.L2_full_core.aggregates.n, 100);
  assert.ok(artifact.lanes.L2_full_core.aggregates.p95Ms < 200);
  assert.equal(artifact.lanes.L2_full_core.gate.status, 'pass');
  assert.equal(artifact.lanes.L2_full_core.gate.budgetMs, 200);
  assert.equal(artifact.acceptance.eligible, true);
  assert.equal(artifact.budget_weakened, undefined);
  assert.equal(artifact.lanes.L2_full_core.gate.budget_weakened, false);
});

test('p95 at or above 200 stays fail with the budget intact', () => {
  const attempts = [];
  for (let i = 0; i < 100; i += 1) attempts.push(extensionAttempt(i, 250));
  const config = validateConfig(baseConfig(repoRoot, ['file:///tmp/page.html']), repoRoot);
  const artifact = buildArtifact({
    config,
    planner: { label: 'groq', detail: 'groq' },
    attempts,
  });
  assert.equal(artifact.status, 'fail');
  assert.equal(artifact.acceptance.eligible, true);
  assert.equal(artifact.lanes.L2_full_core.gate.budget_weakened, false);
  assert.equal(artifact.lanes.L2_full_core.gate.budgetMs, 200);
});

test('unknown planner is not L2 gate-eligible', () => {
  const attempts = [];
  for (let i = 0; i < 100; i += 1) attempts.push(extensionAttempt(i, 10, { plannerLabel: 'unknown' }));
  const config = validateConfig(baseConfig(repoRoot, ['file:///tmp/page.html']), repoRoot);
  const artifact = buildArtifact({
    config,
    planner: { label: 'unknown', detail: 'unverified' },
    attempts,
  });
  assert.equal(artifact.lanes.L2_full_core.aggregates.n, 0);
  assert.equal(artifact.acceptance.eligible, false);
  assert.equal(artifact.status, 'fail');
});

test('planner probe labels /plan, not validate-only Ollama', async () => {
  assert.deepEqual(classifyPlannerProbe(503, {
    error: 'Groq is not configured: GROQ_API_KEY is absent',
    groqConfigured: false,
  }), {
    label: 'groq',
    detail: 'groq',
    endpointRole: 'plan',
    phase1DefaultLock: true,
  });
  assert.equal(classifyPlannerProbe(200, {
    model: 'openai/gpt-oss-20b',
    note: 'ollama was used for validate only',
  }).label, 'groq');
  assert.equal(classifyPlannerProbe(200, { model: 'ollama qwen2.5' }).detail, 'ollama@127.0.0.1:11434');
  const unknown = await probePlanner('http://127.0.0.1:8756', async () => {
    throw new Error('connect refused');
  });
  assert.equal(unknown.label, 'unknown');
  assert.equal(unknown.detail, 'unverified');
});

test('extension stage clock leaves a missing stage null', () => {
  const trace = createG11Trace();
  trace.beginRun();
  trace.markWallStart();
  trace.add('perceive', 3.5);
  const snapshot = trace.finish('error');
  assert.equal(snapshot.stagesMs.perceive, 3.5);
  assert.equal(snapshot.stagesMs.plan, null);
  assert.match(snapshot.reasons.plan, /did not run/);
  assert.equal(typeof snapshot.stagesMs.total, 'number');
});

test('dry-run exits 0 with a fail artifact and does not rewrite core-latency.json', async () => {
  const historical = join(repoRoot, 'Benchmarks/results/core-latency.json');
  const before = createHash('sha256').update(await readFile(historical)).digest('hex');
  const result = await runHarness(['--dry-run', '--out', join(repoRoot, 'Benchmarks/results/core-latency-warden-option-c.json')], { write: false });
  const after = createHash('sha256').update(await readFile(historical)).digest('hex');
  assert.equal(before, after);
  assert.equal(result.exitCode, 0);
  assert.equal(result.artifact.status, 'fail');
  assert.equal(result.artifact.schemaVersion, 1);
  assert.equal(result.artifact.budgetMs, 200);
  assert.equal(result.artifact.lanes.L2_full_core.aggregates.n, 0);
  assert.equal(result.artifact.lanes.L2_full_core.aggregates.p95Ms, null);
  assert.equal(result.artifact.liveL2SamplesCollected, 0);
  assert.equal(result.artifact.predecessor, 'Benchmarks/results/core-latency.json');
});

test('live precondition failure exits non-zero and writes nothing', async () => {
  let writes = 0;
  const result = await runHarness(['--live'], {
    write: false,
    fetchImpl: async () => {
      throw new Error('warden down');
    },
    collectExtensionAttempts: async () => {
      writes += 1;
      return { ok: true, attempts: [] };
    },
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.artifact, null);
  assert.equal(writes, 0);
});

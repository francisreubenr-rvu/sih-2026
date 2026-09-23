/**
 * G11 Option C Warden latency harness.
 *
 *   node scripts/g11-warden-option-c-harness.mjs --dry-run
 *   node scripts/g11-warden-option-c-harness.mjs --live --lane L2_full_core
 *
 * --dry-run writes a fail artifact and does not call Warden.
 * --live fail-closes on preconditions (non-zero, no artifact). A completed
 * measurement exits 0 even when gate.status is fail.
 * L2 samples are extension stage clocks only. Missing stages stay null.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARTIFACT_NAME,
  baseConfig,
  buildArtifact,
  configPreconditionFailures,
  missingStageReasons,
  probeHealth,
  probePlanner,
  validateConfig,
} from './g11-warden-option-c-lib.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const defaultPage = pathToFileURL(join(repoRoot, 'Benchmarks/fixtures/g11-option-c-page.html')).href;
const artifactPath = join(repoRoot, 'Benchmarks/results', ARTIFACT_NAME);
const fixturePath = join(repoRoot, 'Benchmarks/results/fixtures/g11-warden-option-c-precondition-fail.json');

function parseArgs(argv) {
  const out = {
    mode: 'dry-run',
    lane: 'L2_full_core',
    pages: [],
    warmups: 10,
    sampleCount: 100,
    outPath: artifactPath,
    privacyOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.mode = 'dry-run';
    else if (arg === '--live') out.mode = 'live';
    else if (arg === '--privacy-only') out.privacyOnly = true;
    else if (arg === '--lane') out.lane = argv[++i];
    else if (arg === '--page') out.pages.push(argv[++i]);
    else if (arg === '--warmups') out.warmups = Number(argv[++i]);
    else if (arg === '--samples') out.sampleCount = Number(argv[++i]);
    else if (arg === '--out') out.outPath = argv[++i];
    else if (arg === '--help') out.mode = 'help';
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!out.pages.length) out.pages = [defaultPage];
  return out;
}

function printSummary(artifact, lane) {
  const gate = artifact.lanes.L2_full_core.gate;
  const n = artifact.lanes.L2_full_core.aggregates.n;
  const f17ok = artifact.lanes.L2_full_core.aggregates.n > 0 && artifact.f17.attemptsExcluded === 0;
  console.log([
    `lane=${lane}`,
    `planner.label=${artifact.planner.label}`,
    `n=${n}`,
    `p95Ms=${gate.elapsedMs ?? 'null'}`,
    `gate.status=${gate.status}`,
    `f17.ok=${f17ok}`,
  ].join(' '));
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function buildDryRunArtifact(config) {
  const artifact = buildArtifact({
    config,
    planner: { label: 'unknown', detail: 'unverified', endpointRole: 'plan', phase1DefaultLock: true },
    attempts: [],
    note: 'Dry run: live Warden and extension clocks were not collected. Gate stays fail. No stage milliseconds were invented.',
    privacyOnly: config.privacyOnly,
  });
  artifact.runKind = 'dry-run';
  artifact.preconditions = {
    checked: false,
    ok: false,
    failures: ['dry-run does not contact Warden or load the extension'],
  };
  artifact.missingStageReasons = missingStageReasons();
  artifact.liveL2SamplesCollected = 0;
  return artifact;
}

export function buildPreconditionFixture(root) {
  return {
    name: 'core-latency-warden-option-c-precondition-fail',
    schemaVersion: 1,
    fixture: 'config-precondition-fail',
    observedLive: false,
    budgetMs: 200,
    budget_weakened: false,
    status: 'fail',
    mayFlipG11: false,
    failures: configPreconditionFailures(root),
    honesty: [
      'This file records config rejections from the harness. It is not a latency sample.',
      'Privacy-only and Prototype:9041 timings must not be copied into L2 gate.',
    ],
  };
}

async function collectExtensionAttempts(config, plannerLabel) {
  if (process.env.G11_EXTENSION_LIVE !== '1') {
    return {
      ok: false,
      reason: 'G11_EXTENSION_LIVE is not 1, so the root extension was not loaded and no stage clocks were read',
    };
  }
  let chromium;
  try {
    ({ chromium } = await import('../Prototype/node_modules/playwright-core/index.mjs'));
  } catch (error) {
    return { ok: false, reason: `playwright-core is not available: ${error instanceof Error ? error.message : error}` };
  }
  const chromeCandidates = [
    process.env.DHRISTI_CHROMIUM,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
  ].filter(Boolean);
  const executablePath = chromeCandidates.find((candidate) => existsSync(candidate)) || '';
  if (!executablePath || !existsSync(executablePath)) {
    return { ok: false, reason: 'Chromium executable was not found; extension stage clocks were not collected' };
  }
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const userDataDir = await mkdtemp(join(tmpdir(), 'g11-warden-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${config.extensionPath}`,
        `--load-extension=${config.extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const attempts = [];
    const total = config.warmups + config.sampleCount;
    for (let i = 0; i < total; i += 1) {
      const pageUrl = config.pages[i % config.pages.length];
      const page = context.pages()[0] || await context.newPage();
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      await worker.evaluate(async (task) => {
        await chrome.runtime.sendMessage({ type: 'START_TASK', task });
      }, 'Open Next');
      const started = Date.now();
      let trace = null;
      while (Date.now() - started < 60000) {
        const prompt = await worker.evaluate(async () => chrome.runtime.sendMessage({ type: 'GET_PROMPT' }));
        if (prompt && config.executePolicy === 'scripted_confirm') {
          const answers = prompt.kind === 'uncertain-pii'
            ? Object.fromEntries((prompt.items || []).map((item) => [item.id, 'strip']))
            : { choice: 'proceed' };
          await worker.evaluate(async ({ id, answers: next }) => {
            await chrome.runtime.sendMessage({ type: 'PROMPT_RESPONSE', id, answers: next });
          }, { id: prompt.id, answers });
        }
        trace = await worker.evaluate(async () => chrome.runtime.sendMessage({ type: 'GET_G11_TRACE' }));
        if (trace?.terminal) break;
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
      }
      attempts.push({
        i,
        warmup: i < config.warmups,
        page: pageUrl,
        lane: config.lane,
        plannerLabel,
        privacyOnly: false,
        clockSource: trace ? 'extension' : null,
        stagesMs: trace?.stagesMs || {},
        stageReasons: trace?.reasons || missingStageReasons(),
        f17Steps: trace?.f17Steps || [],
        terminal: trace?.terminal || 'error',
      });
    }
    return { ok: true, attempts };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    if (context) await context.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runHarness(argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.mode === 'help') {
    console.log('Usage: node scripts/g11-warden-option-c-harness.mjs --dry-run | --live [--lane L2_full_core] [--page URL]');
    return { exitCode: 0, artifact: null };
  }
  const config = validateConfig({
    suiteId: 'g11-warden-option-c-v1',
    lane: args.privacyOnly ? 'L0_strip_local' : args.lane,
    wardenBaseUrl: 'http://127.0.0.1:8756',
    planner: { endpointRole: 'plan', phase1DefaultLock: true },
    extensionPath: join(repoRoot, 'extension'),
    pages: args.pages,
    warmups: args.warmups,
    sampleCount: args.sampleCount,
    budgetMs: 200,
    f17: { requireOpTierLocal: true, trustServerRequiresConfirmation: false },
    executePolicy: 'scripted_confirm',
    outPath: args.outPath,
    privacyOnly: args.privacyOnly,
  }, repoRoot);

  if (args.mode === 'dry-run') {
    const artifact = buildDryRunArtifact(config);
    const fixture = buildPreconditionFixture(repoRoot);
    if (deps.write !== false) {
      await writeJson(args.outPath, artifact);
      await writeJson(fixturePath, fixture);
    }
    printSummary(artifact, config.lane);
    return { exitCode: 0, artifact };
  }

  const fetchImpl = deps.fetchImpl || fetch;
  const health = await probeHealth(fetchImpl);
  if (!health.ok) {
    console.error(`precondition failed: ${health.reason}`);
    return { exitCode: 2, artifact: null, failures: [health.reason] };
  }
  const planner = await probePlanner(config.wardenBaseUrl, fetchImpl);
  if (planner.probeError) {
    console.error(`precondition failed: planner probe ${planner.probeError}`);
    return { exitCode: 2, artifact: null, failures: [planner.probeError] };
  }
  if (config.lane === 'L2_full_core' && planner.label === 'unknown') {
    const artifact = buildArtifact({
      config,
      planner,
      attempts: [],
      note: 'Planner probe could not verify ollama or groq. L2 is not gate-eligible. No stage milliseconds were invented.',
    });
    artifact.missingStageReasons = missingStageReasons();
    artifact.liveL2SamplesCollected = 0;
    if (deps.write !== false) await writeJson(args.outPath, artifact);
    printSummary(artifact, config.lane);
    return { exitCode: 0, artifact };
  }
  const collector = deps.collectExtensionAttempts || collectExtensionAttempts;
  const collected = await collector(config, planner.label);
  if (!collected.ok) {
    console.error(`precondition failed: ${collected.reason}`);
    return { exitCode: 2, artifact: null, failures: [collected.reason] };
  }
  const artifact = buildArtifact({
    config,
    planner,
    attempts: collected.attempts,
    note: collected.attempts.some((attempt) => attempt.includeInGate)
      ? 'L2 aggregate uses extension clocks and f17.ok attempts only.'
      : 'Extension trace did not produce gate-eligible L2 attempts. Missing stages stayed null.',
  });
  artifact.liveL2SamplesCollected = artifact.lanes.L2_full_core.aggregates.n;
  if (deps.write !== false) await writeJson(args.outPath, artifact);
  printSummary(artifact, config.lane);
  return { exitCode: 0, artifact };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runHarness(process.argv.slice(2)).then((result) => {
    process.exitCode = result.exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}

export { baseConfig, repoRoot, defaultPage };

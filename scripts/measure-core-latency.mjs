/**
 * Wave4: measure synthetic local protect-stage timing distribution + record
 * historical full-flow planner numbers. Writes Benchmarks/results/core-latency.json.
 * Never weakens the <200ms G11 gate.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { redactSelective } from '../Prototype/shared/selective-redaction.mjs';
import {
  OPERATING_MODES,
  buildLatencyDistributionRecord,
  summarizeLatencyBreakdown,
  percentile,
} from '../Prototype/shared/latency-strategy.mjs';
import { FULL_FLOW_LATENCY_MS } from '../Prototype/shared/rubric-hooks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/core-latency.json');

const W = 320, H = 200, N = 120, WARM = 10;
const regions = [
  { kind: 'face', rect: { x: 16, y: 16, width: 48, height: 48 } },
  { kind: 'field', rect: { x: 80, y: 140, width: 120, height: 24 } },
];

function runOnce() {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 30; buf[i + 1] = 40; buf[i + 2] = 50; buf[i + 3] = 255;
  }
  const t0 = performance.now();
  // Stage: classify telemetry (DOM/text heuristic stand-in)
  const labels = ['Pending', 'Review', 'Next', 'Approve transfer', '27AAPFU0939F1ZV', 'demo@upi'];
  let allow = 0;
  for (const l of labels) if (/^(Pending|Review|Next|Cancel|Help|Back|Compose|Archive|OK|Continue|Submit)$/i.test(l)) allow++;
  void allow;
  // Stage: selective mosaic (optimized subsample average)
  redactSelective(buf, W, H, regions, { blockSize: 8, padding: 0 });
  // Stage: sanitize-shaped object build (allocation only)
  const sanitized = { scheme: 'dhristi-semantic-v1', controls: allow, regions: regions.length };
  void sanitized;
  return performance.now() - t0;
}

/** Multi-stage timing for judge-facing breakdown (Node microbench only). */
function runStagedOnce() {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 30; buf[i + 1] = 40; buf[i + 2] = 50; buf[i + 3] = 255;
  }
  const stages = [];
  let t = performance.now();
  const labels = ['Pending', 'Review', 'Next', 'Approve transfer'];
  let allow = 0;
  for (const l of labels) if (/^(Pending|Review|Next|Cancel|Help|Back|Compose|Archive|OK|Continue|Submit)$/i.test(l)) allow++;
  void allow;
  stages.push({ name: 'dom_allowlist_heuristic', elapsedMs: performance.now() - t });
  t = performance.now();
  redactSelective(buf, W, H, regions, { blockSize: 8, padding: 0 });
  stages.push({ name: 'selective_redact_mosaic', elapsedMs: performance.now() - t });
  t = performance.now();
  const sanitized = { scheme: 'dhristi-semantic-v1', controls: allow, regions: regions.length, revision: 'bench' };
  void JSON.stringify(sanitized);
  stages.push({ name: 'sanitize_serialize_proxy', elapsedMs: performance.now() - t });
  return stages;
}

const warmSamples = [];
for (let i = 0; i < WARM; i++) warmSamples.push(runOnce());
const samples = [];
for (let i = 0; i < N; i++) samples.push(runOnce());

// Historical planner-inclusive observations from committed browser evidence.
const historicalFullFlowMs = [3029, 2276];
try {
  const browser = JSON.parse(await readFile(join(root, 'Benchmarks/results/prototype-v01-browser.json'), 'utf8'));
  const obs = browser?.observations || [];
  for (const o of obs) {
    if (Number.isFinite(o.latencyMsDisplayed)) historicalFullFlowMs.push(o.latencyMsDisplayed);
  }
} catch { /* optional */ }

// Staged microbench for judge breakdown (warm + measured)
for (let i = 0; i < 5; i++) runStagedOnce();
const stagedRuns = [];
for (let i = 0; i < 40; i++) stagedRuns.push(runStagedOnce());
const stageNames = stagedRuns[0].map(s => s.name);
const stageP95 = Object.fromEntries(stageNames.map(name => {
  const vals = stagedRuns.map(run => run.find(s => s.name === name).elapsedMs);
  return [name, percentile(vals, 95)];
}));

const privacyBreakdown = summarizeLatencyBreakdown({
  stages: stageNames.map(name => ({ name, elapsedMs: stageP95[name] })),
  mode: OPERATING_MODES.privacy_only,
});
const plannerBreakdown = summarizeLatencyBreakdown({
  stages: [{ name: 'local_protect_proxy', elapsedMs: percentile(samples, 50) }],
  mode: OPERATING_MODES.planner_assisted,
  historicalPlannerMs: historicalFullFlowMs[0],
});

const record = buildLatencyDistributionRecord({
  name: 'wave7-core-latency',
  samples,
  warmups: WARM,
  mode: OPERATING_MODES.planner_assisted,
  budgetMs: FULL_FLOW_LATENCY_MS,
  historicalFullFlowMs: [...new Set(historicalFullFlowMs)],
  notes: [
    'Local samples are synthetic selective-redaction + allow-list heuristic microbenchmarks in Node — not Chromium captureVisibleTab + UltraFace + DOM collect.',
    'Wave3 harness single-run protect captureMs≈188ms is cited separately as browser evidence, not merged into this Node distribution.',
    'G11 acceptance requires p95 full-flow <200ms over ≥100 attempts after 10 warmups including model/network/action. That remains fail.',
    'Privacy-only skip-LLM path implemented in extension popup; does not constitute a G11 pass.',
    'Detector session cache + optional wireframe preview reduce repeat local cost; planner path still seconds.',
    'Wave6: mosaic subsample stride-2 for large blocks; staged Node microbench (dom heuristic / mosaic / sanitize proxy).',
    'Wave7: mergeOverlappingRegions before mosaic; stride-4 subsample for very large blocks. Full-flow G11 remains fail.',
  ],
});

record.strategies = {
  privacy_only_skip_llm: true,
  detector_session_cache: true,
  optional_wireframe_preview: true,
  streaming_llm: false,
  streaming_note: 'No token streaming implemented; would not bring full-flow under 200ms alone given multi-second generation.',
};
record.breakdowns = { privacy_only: privacyBreakdown, planner_assisted: plannerBreakdown };
record.wave3_browser_protect_single_run_ms = 188;
record.judge_latency_breakdown = {
  title: 'Latency breakdown for judges (Wave6)',
  budgetMs: FULL_FLOW_LATENCY_MS,
  node_stage_p95_ms: stageP95,
  optimizations: [
    'privacy_only_skip_llm (extension default)',
    'detector_session_cache',
    'optional_wireframe_preview',
    'mosaic_subsample_average_stride2_for_large_blocks',
  ],
  paths: [
    {
      name: 'privacy_only_local_protect',
      includes: ['capture (browser)', 'DOM collect', 'UltraFace (optional cache)', 'selective/wireframe preview', 'sanitize assert', 'human review UI'],
      excludes: ['Ollama/Qwen planner', 'network plan round-trip', 'confirm/execute'],
      node_microbench_p95_ms: record.localProtectLoop.p95,
      node_stage_p95_ms: stageP95,
      browser_single_run_protect_ms: 188,
      g11_claim: 'NOT a G11 pass — privacy-only omits planner/confirm required by full-flow definition',
    },
    {
      name: 'planner_assisted_full_flow',
      includes: ['local protect', 'local LLM plan', 'human confirm', 'optional execute'],
      historical_samples_ms: [...new Set(historicalFullFlowMs)],
      p95_ms: record.fullFlowHistorical.p95,
      dominant_cost: 'local LLM generation (seconds)',
      g11_status: 'fail',
      budget_weakened: false,
    },
  ],
  note: 'Organizers requiring <200ms full-flow must treat planner-assisted path as fail until measured under budget. Do not substitute privacy-only ms. Wave6 adds stage p95 breakdown + mosaic subsample optimization.',
};

record.acceptance = {
  rule: 'G11',
  required: 'p95 end-to-end <200ms, n≥100 after 10 warmups per frozen core flow',
  status: 'fail',
  budget_weakened: false,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  wrote: outPath,
  local_n: samples.length,
  local_p95: record.localProtectLoop.p95,
  full_p95: record.fullFlowHistorical.p95,
  status: record.status,
}, null, 2));

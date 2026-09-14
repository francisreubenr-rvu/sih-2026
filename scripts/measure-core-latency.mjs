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
  redactSelective(buf, W, H, regions, { blockSize: 8, padding: 0 });
  // Cheap DOM-heuristic stand-in: classify a few label strings.
  const labels = ['Pending', 'Review', 'Next', 'Approve transfer'];
  let allow = 0;
  for (const l of labels) if (/^(Pending|Review|Next|Cancel|Help|Back|Compose|Archive|OK|Continue|Submit)$/i.test(l)) allow++;
  void allow;
  return performance.now() - t0;
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

const privacyBreakdown = summarizeLatencyBreakdown({
  stages: [{ name: 'selective_redact_heuristic', elapsedMs: percentile(samples, 95) }],
  mode: OPERATING_MODES.privacy_only,
});
const plannerBreakdown = summarizeLatencyBreakdown({
  stages: [{ name: 'local_protect_proxy', elapsedMs: percentile(samples, 50) }],
  mode: OPERATING_MODES.planner_assisted,
  historicalPlannerMs: historicalFullFlowMs[0],
});

const record = buildLatencyDistributionRecord({
  name: 'wave4-core-latency',
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

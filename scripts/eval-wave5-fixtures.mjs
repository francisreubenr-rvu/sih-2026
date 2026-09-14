/**
 * Wave5: score expanded held-out synthetic PII/redaction/utility fixtures.
 * Writes honest metrics; never claims official rubric saturation.
 *
 * Usage: node scripts/eval-wave2-fixtures.mjs [--json outfile]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scoreRedaction,
  scorePiiDetection,
  scoreVisualContext,
  scoreLatency,
  FULL_FLOW_LATENCY_MS,
} from '../Prototype/shared/rubric-hooks.mjs';
import { redactSelective } from '../Prototype/shared/selective-redaction.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'Benchmarks/datasets/wave5-heldout-pii-fixtures.json');
const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0
  ? argv[jsonFlag + 1]
  : join(root, 'Benchmarks/results/wave5-pii-redaction-utility-v01.json');

const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));
const cases = [];

for (const c of fixtures.cases) {
  const redaction = scoreRedaction({
    width: c.width,
    height: c.height,
    groundTruthPii: c.groundTruthPii,
    redactedRegions: c.detectorRegions,
    iouThreshold: fixtures.protocol.iouThreshold,
  });
  const pii = scorePiiDetection({
    groundTruth: c.groundTruthPii,
    predictions: c.detectorRegions,
    iouThreshold: fixtures.protocol.iouThreshold,
  });
  const visual = scoreVisualContext({
    expectedControls: c.expectedControls,
    observedControls: c.observedControls,
  });

  // Exercise selective redaction buffer path (byte preservation of non-sensitive area).
  const buf = new Uint8ClampedArray(c.width * c.height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 30; buf[i + 1] = 40; buf[i + 2] = 50; buf[i + 3] = 255;
  }
  // Marker far from typical PII boxes when possible.
  const mx = c.width - 2, my = c.height - 2;
  const mi = (my * c.width + mx) * 4;
  buf[mi] = 111; buf[mi + 1] = 222; buf[mi + 2] = 33;
  const applied = redactSelective(buf, c.width, c.height, c.detectorRegions, { blockSize: 8, padding: 0 });
  const markerPreserved = applied.data[mi] === 111 && applied.data[mi + 1] === 222;
  // If over-redaction painted the marker, preservation flag is false (expected for full-image case).

  cases.push({
    id: c.id,
    description: c.description,
    redaction: {
      piiPixelCoverage: redaction.piiPixelCoverage,
      nonPiiPreservation: redaction.nonPiiPreservation,
      instancePrecision: redaction.instancePrecision,
      instanceRecall: redaction.instanceRecall,
      status: fixtures.protocol.status_label,
    },
    piiDetection: {
      precision: pii.precision,
      recall: pii.recall,
      truePositives: pii.truePositives,
      falsePositives: pii.falsePositives,
      falseNegatives: pii.falseNegatives,
      status: fixtures.protocol.status_label,
    },
    visualContext: {
      precision: visual.precision,
      recall: visual.recall,
      truePositives: visual.truePositives,
      falsePositives: visual.falsePositives,
      falseNegatives: visual.falseNegatives,
      status: fixtures.protocol.status_label,
    },
    selectiveBuffer: {
      regionsApplied: applied.applied.length,
      cornerMarkerPreserved: markerPreserved,
      localOnly: applied.localOnly,
    },
  });
}

function mean(nums) {
  const v = nums.filter(n => n != null && Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const summary = {
  name: 'wave5-pii-redaction-utility',
  version: 'v01',
  timestamp: new Date().toISOString(),
  fixture_set: fixtures.name,
  fixture_version: fixtures.version,
  case_count: cases.length,
  scope: fixtures.scope,
  aggregates: {
    meanPiiPixelCoverage: mean(cases.map(c => c.redaction.piiPixelCoverage)),
    meanNonPiiPreservation: mean(cases.map(c => c.redaction.nonPiiPreservation)),
    meanPiiInstanceRecall: mean(cases.map(c => c.piiDetection.recall)),
    meanPiiInstancePrecision: mean(cases.map(c => c.piiDetection.precision)),
    meanVisualRecall: mean(cases.map(c => c.visualContext.recall)),
    meanVisualPrecision: mean(cases.map(c => c.visualContext.precision)),
  },
  latency_gate: scoreLatency({ elapsedMs: 3029, budgetMs: FULL_FLOW_LATENCY_MS }),
  official_score: null,
  scoreReason: 'Wave5 expanded held-out synthetic fixtures (18 cases). Not WebPII re-score; not organizer saturation. Official score null. Latency gate remains fail.',
  cases,
  notes: [
    'missed-face-under-redaction intentionally shows coverage failure when the detector misses.',
    'full-image-over-redaction intentionally shows utility destruction despite PII coverage.',
    'false-positive-decorative and shifted-iou-borderline stress precision/IoU.',
    'empty-scene-no-pii is a utility baseline with zero PII.',
    'Egress policy unchanged: these scores apply to local selective preview regions, not raster upload.',
    'External WebPII text retention failure (58/100) is unchanged and remains local-only.',
  ],
};

await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ wrote: jsonOut, case_count: cases.length, aggregates: summary.aggregates, latency: summary.latency_gate.status }, null, 2));

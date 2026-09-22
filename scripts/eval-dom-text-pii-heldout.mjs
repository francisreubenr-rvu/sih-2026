/**
 * Cycle-05: held-out DOM text PII span eval.
 * Publishes real precision/recall + char redaction coverage/preservation.
 * Never invents WebPII or officialScore. Face-only arm documents PS text gap.
 *
 * Usage: node scripts/eval-dom-text-pii-heldout.mjs [--json outfile]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectSensitiveTextSpans,
  faceOnlyTextPredictions,
  scoreTextSpanRedaction,
  classifySensitiveFormField,
} from '../Prototype/shared/dom-text-pii.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'Benchmarks/datasets/cycle05-dom-text-pii-heldout.json');
const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0
  ? argv[jsonFlag + 1]
  : join(root, 'Benchmarks/results/cycle05-dom-text-pii-heldout-v01.json');

const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));
const iouThreshold = fixtures.protocol?.iouThreshold ?? 0.5;

function mean(nums) {
  const v = nums.filter(n => n != null && Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function scoreArm(name, predict) {
  const cases = [];
  for (const c of fixtures.cases) {
    const predictedSpans = predict(c);
    const scored = scoreTextSpanRedaction({
      text: c.text,
      groundTruthSpans: c.groundTruthSpans,
      predictedSpans,
      iouThreshold,
    });
    cases.push({
      id: c.id,
      description: c.description,
      gtSpanCount: c.groundTruthSpans.length,
      predSpanCount: predictedSpans.length,
      redaction: {
        piiCharCoverage: scored.piiCharCoverage,
        nonPiiPreservation: scored.nonPiiPreservation,
        instancePrecision: scored.instancePrecision,
        instanceRecall: scored.instanceRecall,
        truePositives: scored.truePositives,
        falsePositives: scored.falsePositives,
        falseNegatives: scored.falseNegatives,
        status: scored.status,
      },
    });
  }
  const positive = cases.filter(c => c.gtSpanCount > 0);
  return {
    name,
    case_count: cases.length,
    positive_case_count: positive.length,
    aggregates: {
      meanPiiCharCoverage: mean(cases.map(c => c.redaction.piiCharCoverage)),
      meanNonPiiPreservation: mean(cases.map(c => c.redaction.nonPiiPreservation)),
      meanInstancePrecision: mean(cases.map(c => c.redaction.instancePrecision)),
      meanInstanceRecall: mean(cases.map(c => c.redaction.instanceRecall)),
      meanPiiCharCoverageOnPositive: mean(positive.map(c => c.redaction.piiCharCoverage)),
      meanInstanceRecallOnPositive: mean(positive.map(c => c.redaction.instanceRecall)),
      meanInstancePrecisionOnPositive: mean(positive.map(c => c.redaction.instancePrecision)),
    },
    cases,
  };
}

const faceArm = scoreArm('face_only', () => faceOnlyTextPredictions());
const domArm = scoreArm('dom_text_spans', (c) => detectSensitiveTextSpans(c.text));

// Form-field microbench (attrs only — complements free-text spans).
const formFixtures = [
  { id: 'pwd-type', attrs: { type: 'password', name: 'pwd' }, expect: ['password'] },
  { id: 'otp-autocomplete', attrs: { type: 'text', autocomplete: 'one-time-code', name: 'otp' }, expect: ['otp'] },
  { id: 'cc-number', attrs: { type: 'text', autocomplete: 'cc-number', name: 'card' }, expect: ['card-like'] },
  { id: 'cc-csc', attrs: { type: 'text', autocomplete: 'cc-csc', name: 'cvv' }, expect: ['cvv'] },
  { id: 'email-type', attrs: { type: 'email', name: 'mail' }, expect: ['email'] },
  { id: 'benign-search', attrs: { type: 'search', name: 'q', autocomplete: 'off' }, expect: [] },
];
let formTp = 0, formFp = 0, formFn = 0;
const formCases = [];
for (const f of formFixtures) {
  const got = classifySensitiveFormField(f.attrs);
  const exp = new Set(f.expect);
  const gotSet = new Set(got);
  let tp = 0, fp = 0, fn = 0;
  for (const k of gotSet) (exp.has(k) ? tp++ : fp++);
  for (const k of exp) if (!gotSet.has(k)) fn++;
  formTp += tp; formFp += fp; formFn += fn;
  formCases.push({ id: f.id, expect: f.expect, got, tp, fp, fn });
}

const summary = {
  name: 'cycle05-dom-text-pii-heldout',
  version: 'v01',
  timestamp: new Date().toISOString(),
  fixture_set: fixtures.name,
  fixture_version: fixtures.version,
  case_count: fixtures.cases.length,
  scope: fixtures.scope,
  official_score: null,
  webPiiScore: null,
  scoreReason: 'Held-out synthetic DOM/text span eval only. Not WebPII re-score; not organizer saturation. Face-only arm is an honesty baseline (text PII recall ≈ 0).',
  face_only_gap: {
    statement: 'UltraFace / face-only vision cannot detect passwords, OTP codes, card numbers, or PII text listed in the problem statement. On positive text-PII fixtures, face_only char coverage and instance recall are 0 — organizer visual+PII+redaction weights (~65%) need DOM/text paths beyond faces.',
    meanInstanceRecallAllCases: faceArm.aggregates.meanInstanceRecall,
    meanInstanceRecallOnPositive: faceArm.aggregates.meanInstanceRecallOnPositive,
    meanPiiCharCoverageOnPositive: faceArm.aggregates.meanPiiCharCoverageOnPositive,
    note: 'All-case mean recall is >0 only because empty-GT utility cases score recall=1 with zero predictions.',
  },
  arms: {
    face_only: {
      aggregates: faceArm.aggregates,
      cases: faceArm.cases,
    },
    dom_text_spans: {
      aggregates: domArm.aggregates,
      cases: domArm.cases,
    },
  },
  form_field_microbench: {
    precision: formTp + formFp ? formTp / (formTp + formFp) : null,
    recall: formTp + formFn ? formTp / (formTp + formFn) : null,
    truePositives: formTp,
    falsePositives: formFp,
    falseNegatives: formFn,
    cases: formCases,
    status: 'unit_fixture_only',
  },
  notes: [
    'dom_text_spans uses detectSensitiveTextSpans (wired into classifySensitive / page-agent text mosaic).',
    'face_only emits zero text spans — honesty baseline for organizer visual+PII+redaction weights.',
    'Char coverage and non-PII preservation reported separately; not blended into a vanity score.',
    'External WebPII text retention failure (58/100) unchanged and remains local-only.',
    'submission_ready remains false; G11 full-flow remains fail.',
  ],
};

await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({
  wrote: jsonOut,
  case_count: summary.case_count,
  face_only: summary.arms.face_only.aggregates,
  dom_text_spans: summary.arms.dom_text_spans.aggregates,
  form_field_microbench: {
    precision: summary.form_field_microbench.precision,
    recall: summary.form_field_microbench.recall,
  },
  official_score: null,
}, null, 2));

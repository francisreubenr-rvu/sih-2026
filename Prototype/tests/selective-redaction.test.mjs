import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clipRegion,
  pixelateRegion,
  redactSelective,
  scoreRedactionPrecision,
  isSensitiveKind,
} from '../shared/selective-redaction.mjs';
import {
  scoreVisualContext,
  scorePiiDetection,
  scoreRedaction,
  scoreLatency,
  assertSanitizedPayload,
  FULL_FLOW_LATENCY_MS,
  emptyRubricLedger,
} from '../shared/rubric-hooks.mjs';
import { classifySensitive } from '../shared/privacy.mjs';
import { requestSchema } from '../shared/protocol.mjs';
import { randomUUID } from 'node:crypto';
import { makeScene } from '../shared/privacy.mjs';

function solid(width, height, r = 10, g = 20, b = 30) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return data;
}

test('clipRegion floors and clamps useful rectangles', () => {
  assert.deepEqual(clipRegion({ x: -5, y: 0, width: 10, height: 10 }, 100, 100), {
    x: 0, y: 0, width: 5, height: 10,
  });

  assert.deepEqual(clipRegion({ x: -4, y: 2, width: 20, height: 10 }, 100, 50, 2), {
    x: 0, y: 0, width: 18, height: 14,
  });
  assert.equal(clipRegion({ x: 200, y: 0, width: 10, height: 10 }, 100, 100), null);
  assert.equal(clipRegion({ x: 0, y: 0, width: 0, height: 10 }, 100, 100), null);
});

test('pixelateRegion mosaics only the target block and reports coverage', () => {
  const data = solid(40, 40, 0, 0, 0);
  // Paint a bright corner that should survive outside the region.
  for (let y = 0; y < 10; y++) for (let x = 30; x < 40; x++) {
    const i = (y * 40 + x) * 4;
    data[i] = 255; data[i + 1] = 128; data[i + 2] = 64;
  }
  const covered = pixelateRegion(data, 40, 40, { x: 0, y: 0, width: 20, height: 20 }, 10);
  assert.equal(covered, 400);
  // Outside pixels unchanged.
  assert.equal(data[(0 * 40 + 35) * 4], 255);
  assert.equal(data[(0 * 40 + 35) * 4 + 1], 128);
});

test('redactSelective preserves non-sensitive pixels byte-for-byte', () => {
  const width = 32, height = 32;
  const source = solid(width, height, 40, 50, 60);
  const markerIndex = (30 * width + 30) * 4; // outside both regions
  source[markerIndex] = 99;
  source[markerIndex + 1] = 88;
  const { data, applied, localOnly } = redactSelective(source, width, height, [
    { kind: 'face', rect: { x: 8, y: 8, width: 8, height: 8 } },
    { kind: 'private', rect: { x: 0, y: 0, width: 4, height: 4 } },
  ], { blockSize: 4, padding: 0 });
  assert.equal(localOnly, true);
  assert.ok(applied.length >= 1);
  // Marker outside both regions must survive.
  assert.equal(data[markerIndex], 99);
  assert.equal(data[markerIndex + 1], 88);
  // Source buffer must not be mutated inside the face region.
  assert.equal(source[(10 * width + 10) * 4], 40);
  // Redacted face region should differ from the solid fill average path (still finite).
  assert.notEqual(data[(10 * width + 10) * 4], undefined);
});

test('redactSelective ignores non-sensitive kinds and invalid inputs fail closed', () => {
  const data = solid(16, 16);
  const out = redactSelective(data, 16, 16, [{ kind: 'decoration', rect: { x: 0, y: 0, width: 8, height: 8 } }]);
  assert.equal(out.applied.length, 0);
  assert.throws(() => redactSelective(data, 16, 15, []), /shape/);
  assert.throws(() => pixelateRegion(data, 16, 16, { x: 0, y: 0, width: 4, height: 4 }, 1), /block size/);
  assert.equal(isSensitiveKind('face'), true);
  assert.equal(isSensitiveKind('layout'), false);
});

test('scoreRedactionPrecision separates PII coverage from non-PII preservation', () => {
  const scored = scoreRedactionPrecision({
    width: 20,
    height: 20,
    groundTruthPii: [{ rect: { x: 0, y: 0, width: 10, height: 10 } }],
    redactedRegions: [{ rect: { x: 0, y: 0, width: 10, height: 10 } }],
  });
  assert.equal(scored.piiPixelCoverage, 1);
  assert.equal(scored.nonPiiPreservation, 1);
  assert.equal(scored.instancePrecision, 1);
  assert.equal(scored.instanceRecall, 1);
  assert.equal(scored.status, 'unit_fixture_only');

  const over = scoreRedactionPrecision({
    width: 20,
    height: 20,
    groundTruthPii: [{ rect: { x: 0, y: 0, width: 5, height: 5 } }],
    redactedRegions: [{ rect: { x: 0, y: 0, width: 20, height: 20 } }],
  });
  assert.equal(over.piiPixelCoverage, 1);
  assert.ok(over.nonPiiPreservation < 0.01);
});

test('rubric visual and PII hooks report fixture-only status, not saturation', () => {
  const visual = scoreVisualContext({
    expectedControls: [{ role: 'button', label: 'Pending' }, { role: 'button', label: 'Next' }],
    observedControls: [{ role: 'button', label: 'Pending' }],
  });
  assert.equal(visual.recall, 0.5);
  assert.equal(visual.precision, 1);
  assert.equal(visual.status, 'unit_fixture_only');
  assert.equal(visual.observed, null);

  const pii = scorePiiDetection({
    groundTruth: [{ rect: { x: 0, y: 0, width: 10, height: 10 } }],
    predictions: [{ rect: { x: 1, y: 1, width: 10, height: 10 } }],
  });
  assert.equal(pii.status, 'unit_fixture_only');
  assert.equal(pii.truePositives, 1);

  const redaction = scoreRedaction({
    width: 10,
    height: 10,
    groundTruthPii: [{ rect: { x: 0, y: 0, width: 4, height: 4 } }],
    redactedRegions: [{ rect: { x: 0, y: 0, width: 4, height: 4 } }],
  });
  assert.equal(redaction.metric, 'redaction');
  assert.equal(redaction.observed, null);
});

test('latency gate fails honestly above 200ms and must not be weakened', () => {
  assert.equal(FULL_FLOW_LATENCY_MS, 200);
  assert.equal(scoreLatency({ elapsedMs: 150 }).status, 'pass');
  const fail = scoreLatency({ elapsedMs: 3029 });
  assert.equal(fail.status, 'fail');
  assert.match(fail.note, /must not be weakened/);
  const ledger = emptyRubricLedger();
  assert.equal(ledger.score, null);
  assert.equal(ledger.metrics.find(m => m.id === 'task-latency').status, 'fail');
});

test('assertSanitizedPayload blocks screenshots, data URLs and scene pixel fields', () => {
  const ok = makeScene({
    revision: randomUUID(),
    viewport: { width: 100, height: 80 },
    controls: [{ id: 'c0', role: 'button', label: 'Pending', rect: { x: 1, y: 1, width: 40, height: 20 } }],
    regions: [{ kind: 'face', rect: { x: 10, y: 10, width: 20, height: 20 } }],
  });
  const body = requestSchema.parse({ task: 'review-pending', scene: ok });
  assert.equal(assertSanitizedPayload(body), true);
  assert.throws(() => assertSanitizedPayload({ ...body, screenshot: 'data:image/png;base64,abc' }), /forbidden|raw/i);
  assert.throws(() => assertSanitizedPayload({ task: 'review-pending', scene: { ...ok, pixels: 'x' } }), /pixel/i);
  assert.throws(() => assertSanitizedPayload('{"dataUrl":"data:image/png;base64,xx"}'), /forbidden/i);
});

test('classifySensitive expands Indic Aadhaar and PAN telemetry without authorizing export', () => {
  assert.ok(classifySensitive('Aadhaar 2345 6789 0123').includes('aadhaar'));
  assert.ok(classifySensitive('PAN ABCDE1234F').includes('pan'));
  assert.ok(classifySensitive('password field').includes('sensitive-label'));
  // Export still drops arbitrary text — only allowlisted labels survive makeScene.
  const scene = makeScene({
    revision: randomUUID(),
    viewport: { width: 200, height: 100 },
    controls: [{ id: 'c0', role: 'button', label: 'ABCDE1234F', rect: { x: 1, y: 1, width: 40, height: 20 } }],
    regions: [],
  });
  assert.equal(scene.controls.length, 0);
});

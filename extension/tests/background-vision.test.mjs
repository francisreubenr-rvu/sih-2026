// The face stage inside the real extension/background.js step loop, against a fake offscreen
// document (the harness answers the 'dhristi-vision' Port) and a fake Warden.
//
// Node has no canvas, so the face-mask test installs a minimal OffscreenCanvas / createImageBitmap
// / FileReader that records where redactScreenshot() paints. What it proves: a detected face
// becomes a painted mask in capture pixels, and the only image that leaves the step (panel trace,
// OmniParser) is the masked one. What it does not prove: real pixels, real model. That is
// scripts/validate-extension-vision.mjs in Chromium.

import assert from 'node:assert/strict';
import test from 'node:test';

import { VISION_DROP, VISION_HANG, defaultVision, runTask } from './helpers/background-harness.mjs';

const RAW = 'data:image/png;base64,UkFXQ0FQVFVSRQ=='; // "RAWCAPTURE"
const RAW_B64 = RAW.split(',')[1];
const MASKED_B64 = Buffer.from('MASKED').toString('base64');
const H_NEXT = `h${'e'.repeat(32)}`;
const NEXT = { tag: 'button', type: 'button', selector: '#next', handle: H_NEXT, tier: 'navigational', label: 'Next', x: 10, y: 10, filled: false, fieldType: 'button', pii: false };
const FINISH = { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' };
const PII_FIELD = { x: 10, y: 20, width: 100, height: 20, kind: 'field:email', confidence: 'field-value' };

function scan(extra = {}) {
  return {
    elements: [NEXT], dom: '1. BUTTON selector=#next label="Next"', digest: 'x', piiMaskedCount: 0,
    piiFields: [PII_FIELD], viewport: { width: 800, height: 600 }, ...extra,
  };
}

const finishPlan = () => ({ model: 'groq/fake-70b', destination: 'cloud', latencyMs: 5, switched: [], plan: FINISH });

// A 1600x1200 (DPR 2) capture with one face at (800, 400) 100x120 device pixels.
const ONE_FACE = (request) => (request.type === 'detect'
  ? { detections: [{ x: 800, y: 400, width: 100, height: 120, confidence: 0.98 }], width: 1600, height: 1200, inferenceMs: 7, decodeMs: 2, model: 'fake-face', backend: 'fake' }
  : defaultVision(request));

function installCanvasStub() {
  const fills = [];
  const saved = { createImageBitmap: globalThis.createImageBitmap, OffscreenCanvas: globalThis.OffscreenCanvas, FileReader: globalThis.FileReader };
  globalThis.createImageBitmap = async () => ({ width: 1600, height: 1200, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() {
      return { fillStyle: null, drawImage() {}, fillRect: (x, y, w, h) => fills.push([x, y, w, h]) };
    }
    async convertToBlob({ type }) { return new Blob([Buffer.from('MASKED')], { type }); }
  };
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
        this.onload();
      });
    }
  };
  return {
    fills,
    restore() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete globalThis[k];
        else globalThis[k] = v;
      }
    },
  };
}

function everywhereButTheDetectRequest(run) {
  return JSON.stringify([run.runtimeMessages, run.fetchBodies.map((b) => b.raw), run.traceUpdates, run.pipelineTrace, run.entries]);
}

test('a detected face is masked in capture pixels before the panel or OmniParser sees the capture', async (t) => {
  const canvas = installCanvasStub();
  t.after(() => canvas.restore());
  const run = await runTask({ scan: scan(), capture: RAW, vision: ONE_FACE, warden: { plan: finishPlan }, storage: { useOmniparser: true } });
  assert.equal(run.terminal.status, 'finished');

  // The face box, padded 15% a side and taken through CSS pixels and back, rounded outward.
  assert.deepEqual(canvas.fills, [[20, 40, 200, 40], [785, 382, 130, 156]]);

  const step = run.pipelineTrace;
  assert.equal(step.vision.status, 'done');
  assert.equal(step.vision.faces, 1);
  assert.equal(step.vision.inferenceMs, 7);
  assert.equal(step.vision.model, 'fake-face');
  assert.equal(typeof step.vision.ms, 'number');
  assert.equal(step.redaction.screenMasked, 2);
  assert.equal(step.screenshot.dataUrl, `data:image/png;base64,${MASKED_B64}`);
  assert.match(step.stages.perceive.detail, /1 face in \d+ ms/);

  // The raw capture went to the offscreen document's detect request and nowhere else.
  const detects = run.visionRequests.filter((r) => r.type === 'detect');
  assert.equal(detects.length, 1);
  assert.equal(detects[0].dataUrl, RAW);
  assert.equal(everywhereButTheDetectRequest(run).includes(RAW_B64), false);
  const parse = run.fetchBodies.filter((b) => b.path === '/parse/');
  assert.equal(parse.length, 1);
  assert.equal(parse[0].body.base64_image, MASKED_B64, 'OmniParser got the masked capture');
  // Nothing about vision went to the Warden.
  for (const b of run.fetchBodies.filter((f) => f.path !== '/parse/')) assert.equal(/face|vision/i.test(b.raw), false);

  // Clocked as its own exclusive stage; the existing keys still work.
  assert.equal(typeof run.trace.stagesMs.vision, 'number');
  for (const key of ['perceive', 'strip', 'plan', 'validate', 'f17_local_tier', 'total']) assert.equal(typeof run.trace.stagesMs[key], 'number', key);
});

for (const [name, vision, reason] of [
  ['an error reply', (r) => { if (r.type === 'detect') throw new Error('model exploded'); return defaultVision(r); }, /model exploded/],
  ['a malformed reply', (r) => (r.type === 'detect' ? { detections: [{ x: NaN, y: 0, width: 1, height: 1 }], width: 4, height: 4 } : defaultVision(r)), /malformed box/],
  ['a dropped port', (r) => (r.type === 'detect' ? VISION_DROP : defaultVision(r)), /closed the connection/],
  ['a detect that never answers', (r) => (r.type === 'detect' ? VISION_HANG : defaultVision(r)), /longer than 1500 ms/],
]) {
  test(`fails closed on ${name}: no capture for the panel or OmniParser, and the run continues`, async () => {
    const run = await runTask({ scan: scan(), capture: RAW, vision, warden: { plan: finishPlan }, storage: { useOmniparser: true } });
    assert.equal(run.terminal.status, 'finished', 'the run itself continues');
    const step = run.pipelineTrace;
    assert.equal(step.vision.status, 'error');
    assert.equal(step.vision.faces, null);
    assert.match(step.vision.reason, reason);
    assert.deepEqual(step.screenshot, { dataUrl: null, width: null, height: null });
    assert.equal(step.redaction.screenMasked, 0);
    assert.match(step.stages.perceive.detail, /face check failed, capture discarded/);
    assert.equal(run.fetchBodies.some((b) => b.path === '/parse/'), false, 'OmniParser got nothing');
    assert.equal(everywhereButTheDetectRequest(run).includes(RAW_B64), false);
    assert.match(JSON.stringify(run.entries), /face check failed .* discarded/);
    assert.equal(typeof run.trace.stagesMs.vision, 'number', 'the failed check is still clocked');
    assert.ok(run.fetchBodies.some((b) => b.path === '/plan'), 'planning went ahead without pixels');
  });
}

test('fails closed when the browser has no offscreen document API', async () => {
  const run = await runTask({ scan: scan(), capture: RAW, offscreen: false, warden: { plan: finishPlan } });
  assert.equal(run.terminal.status, 'finished');
  assert.equal(run.pipelineTrace.vision.status, 'error');
  assert.match(run.pipelineTrace.vision.reason, /offscreen document API/);
  assert.equal(run.pipelineTrace.screenshot.dataUrl, null);
  assert.equal(run.visionRequests.length, 0);
});

test('the detector starts once per worker: one offscreen document, warmed at START_TASK', async () => {
  const run = await runTask({ scan: scan({ piiFields: [] }), capture: RAW, warden: { plan: finishPlan } });
  assert.equal(run.offscreenCreates.length, 1);
  assert.equal(run.offscreenCreates[0].url, 'offscreen.html');
  assert.deepEqual(run.offscreenCreates[0].reasons, ['BLOBS']);
  assert.deepEqual(run.visionRequests.map((r) => r.type), ['init', 'detect']);
  // No faces and no PII fields: the checked capture is passed through unchanged.
  assert.equal(run.pipelineTrace.vision.faces, 0);
  assert.equal(run.pipelineTrace.screenshot.dataUrl, RAW);
});

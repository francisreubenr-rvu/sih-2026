// The face stage's pure parts and the worker-side message contract (utils/vision.js,
// utils/vision-client.js), without a browser. The real model in real Chromium is
// scripts/validate-extension-vision.mjs.

import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeFaces, iou, rgbaToNchw } from '../utils/vision.js';
import {
  FACE_PAD_RATIO, OFFSCREEN_PATH, VISION_PORT_NAME, VisionError,
  checkDetectReply, createVisionClient, faceFieldsFromDetections,
} from '../utils/vision-client.js';

test('decodeFaces keeps boxes over the threshold, in source pixels, after NMS', () => {
  // Three anchors: two overlapping strong boxes and one below the threshold.
  const scores = [0.1, 0.9, 0.05, 0.95, 0.5, 0.5];
  const boxes = [0.1, 0.1, 0.3, 0.3, 0.11, 0.11, 0.31, 0.31, 0.6, 0.6, 0.8, 0.8];
  const faces = decodeFaces(scores, boxes, 1000, 500);
  assert.equal(faces.length, 1, 'the overlapping box is suppressed and the weak one dropped');
  assert.equal(faces[0].confidence, 0.95);
  assert.ok(Math.abs(faces[0].x - 110) < 1e-6 && Math.abs(faces[0].y - 55) < 1e-6);
  assert.ok(Math.abs(faces[0].width - 200) < 1e-6 && Math.abs(faces[0].height - 100) < 1e-6);
});

test('decodeFaces treats a malformed tensor as a failed inference, never as no faces', () => {
  assert.throws(() => decodeFaces([0.1, 0.9], [0, 0, 1], 10, 10), /Unexpected face model outputs/);
  assert.throws(() => decodeFaces([0.1, NaN], [0, 0, 1, 1], 10, 10), /score/);
  assert.throws(() => decodeFaces([0.1, 0.9], [0, 0, Infinity, 1], 10, 10), /box/);
  assert.throws(() => decodeFaces([], [], 10, 10), /Unexpected/);
  assert.throws(() => decodeFaces([0.1, 0.9], [0, 0, 1, 1], 0, 10), /Invalid image shape/);
});

test('rgbaToNchw normalises to (v - 127) / 128 in planar order; iou is symmetric', () => {
  const out = rgbaToNchw(new Uint8ClampedArray([255, 127, 0, 255]), 1, 1);
  assert.deepEqual([...out], [1, 0, -127 / 128]);
  assert.throws(() => rgbaToNchw(new Uint8ClampedArray(3), 1, 1), /Invalid image shape/);
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 5, y: 0, width: 10, height: 10 };
  assert.equal(iou(a, b), iou(b, a));
  assert.ok(Math.abs(iou(a, b) - 50 / 150) < 1e-9);
});

test('checkDetectReply rejects anything off-shape', () => {
  const ok = checkDetectReply({ detections: [{ x: 1, y: 2, width: 3, height: 4, confidence: 0.9 }], width: 10, height: 10, inferenceMs: 5, model: 'm' });
  assert.equal(ok.detections.length, 1);
  assert.equal(ok.inferenceMs, 5);
  for (const bad of [
    null,
    { detections: [], width: 0, height: 10 },
    { detections: 'none', width: 10, height: 10 },
    { detections: [{ x: 1, y: 2, width: 0, height: 4 }], width: 10, height: 10 },
    { detections: [{ x: NaN, y: 2, width: 3, height: 4 }], width: 10, height: 10 },
    { detections: Array.from({ length: 101 }, () => ({ x: 1, y: 1, width: 1, height: 1 })), width: 10, height: 10 },
  ]) {
    assert.throws(() => checkDetectReply(bad), (e) => e instanceof VisionError && e.reason === 'malformed');
  }
});

test('face boxes become padded CSS-pixel mask fields, clamped to the viewport', () => {
  // A DPR-2 capture: 1600x1200 device pixels for an 800x600 CSS viewport.
  const [field] = faceFieldsFromDetections([{ x: 800, y: 400, width: 100, height: 120 }], { width: 1600, height: 1200 }, { width: 800, height: 600 });
  const px = 100 * FACE_PAD_RATIO;
  const py = 120 * FACE_PAD_RATIO;
  assert.equal(field.kind, 'face');
  assert.ok(Math.abs(field.x - (800 - px) / 2) < 1e-9);
  assert.ok(Math.abs(field.y - (400 - py) / 2) < 1e-9);
  assert.ok(Math.abs(field.width - (100 + 2 * px) / 2) < 1e-9);
  assert.ok(Math.abs(field.height - (120 + 2 * py) / 2) < 1e-9);
  const [edge] = faceFieldsFromDetections([{ x: 0, y: 0, width: 40, height: 40 }], { width: 800, height: 600 }, { width: 800, height: 600 });
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 0);
  assert.deepEqual(faceFieldsFromDetections([], { width: 1, height: 1 }, null), []);
});

// A fake chrome with the offscreen API and a Port answered by `answer(request)`.
function fakeChrome({ answer, offscreen = true } = {}) {
  const calls = { creates: [], ports: [], requests: [] };
  let open = false;
  const api = {
    runtime: {
      lastError: undefined,
      getURL: (p) => `chrome-extension://x/${p}`,
      getContexts: async () => (open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []),
      connect: ({ name }) => {
        calls.ports.push(name);
        const msgFns = [];
        const discFns = [];
        return {
          onMessage: { addListener: (fn) => msgFns.push(fn) },
          onDisconnect: { addListener: (fn) => discFns.push(fn) },
          disconnect() {},
          postMessage(m) {
            calls.requests.push(m);
            setTimeout(() => {
              if (!open) { discFns.forEach((fn) => fn()); return; }
              const reply = answer(m);
              if (reply !== undefined) msgFns.forEach((fn) => fn(reply));
            }, 0);
          },
        };
      },
    },
  };
  if (offscreen) {
    api.offscreen = { createDocument: async (o) => { calls.creates.push(o); open = true; } };
  }
  return { api, calls };
}

const READY = (m) => (m.type === 'init' ? { id: m.id, ok: true, result: { ready: true, initMs: 3 } } : undefined);

test('client: one offscreen document (BLOBS), one Port name, the capture only in the detect request', async () => {
  const { api, calls } = fakeChrome({
    answer: (m) => READY(m) || { id: m.id, ok: true, result: { detections: [{ x: 1, y: 1, width: 5, height: 5, confidence: 0.9 }], width: 20, height: 10, inferenceMs: 4 } },
  });
  const client = createVisionClient({ chromeApi: api });
  const first = await client.detect('data:image/png;base64,AAAA');
  const second = await client.detect('data:image/png;base64,BBBB');
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].url, OFFSCREEN_PATH);
  assert.deepEqual(calls.creates[0].reasons, ['BLOBS']);
  assert.ok(calls.ports.every((n) => n === VISION_PORT_NAME));
  assert.deepEqual(calls.requests.map((r) => r.type), ['init', 'detect', 'detect']);
  assert.equal(calls.requests[1].dataUrl, 'data:image/png;base64,AAAA');
  assert.equal('dataUrl' in calls.requests[0], false, 'init carries no capture');
  assert.equal(first.detections.length, 1);
  assert.equal(first.width, 20);
  assert.ok(first.waitInitMs >= 0 && second.waitInitMs >= 0);
});

test('client: a detect that does not answer in time rejects as a timeout', async () => {
  const { api } = fakeChrome({ answer: (m) => READY(m) });
  const client = createVisionClient({ chromeApi: api, detectTimeoutMs: 30 });
  await assert.rejects(client.detect('data:image/png;base64,AAAA'), (e) => e instanceof VisionError && e.reason === 'timeout');
});

test('client: an error reply, a missing API and a non-image input all reject', async () => {
  const { api } = fakeChrome({ answer: (m) => READY(m) || { id: m.id, ok: false, error: 'model exploded' } });
  await assert.rejects(createVisionClient({ chromeApi: api }).detect('data:image/png;base64,AAAA'), (e) => e.reason === 'failed' && /model exploded/.test(e.message));
  const none = fakeChrome({ answer: READY, offscreen: false });
  await assert.rejects(createVisionClient({ chromeApi: none.api }).detect('data:image/png;base64,AAAA'), (e) => e.reason === 'unavailable');
  await assert.rejects(createVisionClient({ chromeApi: api }).detect('https://example.com/a.png'), (e) => e.reason === 'malformed');
});

test('client: a start that never answers is capped, and a later call retries the start', async () => {
  let initAnswers = false;
  const { api, calls } = fakeChrome({
    answer: (m) => {
      if (m.type === 'init') return initAnswers ? { id: m.id, ok: true, result: { ready: true } } : undefined;
      return { id: m.id, ok: true, result: { detections: [], width: 2, height: 2 } };
    },
  });
  const client = createVisionClient({ chromeApi: api, initTimeoutMs: 40 });
  await assert.rejects(client.detect('data:image/png;base64,AAAA'), (e) => e.reason === 'timeout');
  initAnswers = true;
  const ok = await client.detect('data:image/png;base64,AAAA');
  assert.equal(ok.detections.length, 0);
  assert.ok(calls.requests.filter((r) => r.type === 'init').length >= 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxVisionDetector } from '../shared/vision-sandbox-client.mjs';

function makeHarness(handler) {
  const bus = new EventTarget();
  let frameWin;
  const documentImpl = {
    body: {
      appendChild(el) {
        frameWin = {
          postMessage(data) {
            queueMicrotask(() => {
              const reply = handler(data);
              const event = new MessageEvent('message', { data: reply });
              Object.defineProperty(event, 'source', { value: frameWin });
              bus.dispatchEvent(event);
            });
          },
        };
        el.contentWindow = frameWin;
        el.contentDocument = { readyState: 'complete' };
        queueMicrotask(() => {
          const ready = new MessageEvent('message', { data: { type: 'sandbox-ready' } });
          Object.defineProperty(ready, 'source', { value: frameWin });
          bus.dispatchEvent(ready);
          el.dispatchEvent(new Event('load'));
        });
      },
    },
    createElement() {
      const listeners = new Map();
      return {
        style: {},
        setAttribute() {},
        addEventListener(type, fn) {
          const list = listeners.get(type) || [];
          list.push(fn);
          listeners.set(type, list);
        },
        removeEventListener(type, fn) {
          listeners.set(type, (listeners.get(type) || []).filter((x) => x !== fn));
        },
        dispatchEvent(ev) {
          for (const fn of listeners.get(ev.type) || []) fn.call(this, ev);
          return true;
        },
        remove() {},
      };
    },
  };
  return { bus, documentImpl };
}

test('sandbox client init + detect via injectable message bus', async () => {
  const { bus, documentImpl } = makeHarness((data) => {
    if (data.type === 'ping') return { id: data.id, ok: true, result: { pong: true } };
    if (data.type === 'init') return { id: data.id, ok: true, result: { ready: true } };
    if (data.type === 'detect') return { id: data.id, ok: true, result: { detections: [], inferenceMs: 1 } };
    return { id: data.id, ok: false, error: 'unknown' };
  });
  const detector = await createSandboxVisionDetector({
    sandboxUrl: 'https://example.test/ort-sandbox.html',
    documentImpl, messageTarget: bus, timeoutMs: 2000,
    bitmapFactory: async () => ({ width: 8, height: 8, close() {} }),
  });
  const result = await detector.detect({});
  assert.equal(result.detections.length, 0);
  assert.equal(result.inferenceMs, 1);
  await detector.dispose();
  await assert.rejects(detector.detect({}), /disposed/);
});

test('sandbox client protectCapture forwards dataUrl and mosaic flag', async () => {
  let seen;
  const { bus, documentImpl } = makeHarness((data) => {
    if (data.type === 'ping') return { id: data.id, ok: true, result: { pong: true } };
    if (data.type === 'init') return { id: data.id, ok: true, result: { ready: true } };
    if (data.type === 'protect') {
      seen = data;
      return { id: data.id, ok: true, result: {
        detections: [{ x: 1, y: 2, width: 3, height: 4 }],
        inferenceMs: 2, bitmapWidth: 100, bitmapHeight: 80,
        previewMeta: { mode: 'wireframe', localOnly: true, host: 'ort-sandbox' },
      }};
    }
    return { id: data.id, ok: false, error: 'unknown' };
  });
  const detector = await createSandboxVisionDetector({
    sandboxUrl: 'https://example.test/ort-sandbox.html',
    documentImpl, messageTarget: bus, timeoutMs: 2000,
  });
  const out = await detector.protectCapture({
    dataUrl: 'data:image/jpeg;base64,xx',
    viewport: { width: 50, height: 40 },
    regions: [{ kind: 'field', rect: { x: 0, y: 0, width: 1, height: 1 } }],
    useSelectiveMosaic: false,
  });
  assert.equal(seen.type, 'protect');
  assert.equal(seen.useSelectiveMosaic, false);
  assert.equal(out.detections.length, 1);
  assert.equal(out.previewMeta.host, 'ort-sandbox');
  assert.equal(detector.alive, true);
  await detector.dispose();
  assert.equal(detector.alive, false);
});

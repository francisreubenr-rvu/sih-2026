import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxVisionDetector } from '../shared/vision-sandbox-client.mjs';

/**
 * Node cannot host a real MV3 sandboxed iframe. Exercise the client with an
 * injectable message bus that mimics parent↔sandbox postMessage.
 */
test('sandbox client init + detect via injectable message bus', async () => {
  const bus = new EventTarget();
  let frameWin;

  const documentImpl = {
    body: {
      appendChild(el) {
        frameWin = {
          postMessage(data) {
            queueMicrotask(() => {
              let reply;
              if (data.type === 'ping') reply = { id: data.id, ok: true, result: { pong: true } };
              else if (data.type === 'init') reply = { id: data.id, ok: true, result: { ready: true } };
              else if (data.type === 'detect') reply = { id: data.id, ok: true, result: { detections: [], inferenceMs: 1 } };
              else reply = { id: data.id, ok: false, error: 'unknown' };
              // Client matches event.source === contentWindow
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

  const detector = await createSandboxVisionDetector({
    sandboxUrl: 'https://example.test/ort-sandbox.html',
    documentImpl,
    messageTarget: bus,
    timeoutMs: 2000,
    bitmapFactory: async () => ({ width: 8, height: 8, close() {} }),
  });
  const result = await detector.detect({});
  assert.equal(result.detections.length, 0);
  assert.equal(result.inferenceMs, 1);
  await detector.dispose();
  await assert.rejects(detector.detect({}), /disposed/);
});

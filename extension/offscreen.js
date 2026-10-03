// offscreen.js: hosts the on-device face detector for the service worker.
//
// Contract (utils/vision-client.js is the only caller): the worker opens a runtime Port named
// 'dhristi-vision' and posts { id, type, ... }; this document answers { id, ok, result | error }
// on the same port.
//   init                load the runtime and the model once   -> { ready, initMs }
//   detect { dataUrl }  decode the capture and find faces     -> { detections, width, height,
//                                                                inferenceMs, decodeMs, model, backend }
//   stats               measurement only                      -> { jsHeap, initMs }
//
// Privacy: the capture arrives from the worker, is decoded here, and is dropped after the
// detection. Only boxes and timings go back. This document makes no network request: the runtime
// and the model are files inside the extension package.

import { createVisionDetector } from './utils/vision.js';

const PORT_NAME = 'dhristi-vision';
const WORKER_URL = chrome.runtime.getURL('background.js');

let detectorPromise = null;
let initMs = null;

function loadDetector() {
  if (!detectorPromise) {
    const t0 = performance.now();
    detectorPromise = createVisionDetector({
      runtimeUrl: chrome.runtime.getURL('models/ort/ort.wasm.min.mjs'),
      modelUrl: chrome.runtime.getURL('models/ultraface-rfb320.onnx'),
    }).then((detector) => {
      initMs = performance.now() - t0;
      return detector;
    });
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

async function detect(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('not an image capture');
  const detector = await loadDetector();
  const t0 = performance.now();
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const decodeMs = performance.now() - t0;
  try {
    const result = await detector.detect(bitmap);
    return { ...result, decodeMs };
  } finally {
    bitmap.close();
  }
}

function jsHeap() {
  const m = performance.memory;
  if (!m) return null;
  return { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit };
}

// Registered synchronously at module start, before any await, so a port opened right after the
// document is created finds a listener.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  // Only this extension's service worker may ask: not a tab, not another extension page.
  const sender = port.sender || {};
  if (sender.id !== chrome.runtime.id || sender.tab || String(sender.url || '').split(/[?#]/)[0] !== WORKER_URL) {
    port.disconnect();
    return;
  }
  port.onMessage.addListener(async (msg) => {
    const id = msg && msg.id;
    if (typeof id !== 'string') return;
    try {
      let result;
      if (msg.type === 'init') {
        await loadDetector();
        result = { ready: true, initMs };
      } else if (msg.type === 'detect') {
        result = await detect(msg.dataUrl);
      } else if (msg.type === 'stats') {
        result = { jsHeap: jsHeap(), initMs };
      } else {
        throw new Error('unknown request');
      }
      port.postMessage({ id, ok: true, result });
    } catch (error) {
      try { port.postMessage({ id, ok: false, error: String(error?.message || error) }); } catch { /* port closed */ }
    }
  });
});

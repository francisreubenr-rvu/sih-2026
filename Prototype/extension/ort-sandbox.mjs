/**
 * ORT host for MV3 manifest sandbox page (DBG-002).
 * No chrome.* APIs — parent passes absolute package URLs or we resolve relative to this document.
 * Raw pixels stay in-browser (postMessage / transferable ImageBitmap only).
 */
import { createVisionDetector } from '../shared/vision.mjs';

let detector;
let initializing;

function packageUrl(relative) {
  return new URL(relative, document.baseURI).href;
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const { id, type, bitmap, runtimeUrl, modelUrl } = data;
  if (id == null || typeof type !== 'string') return;

  let result;
  try {
    if (type === 'ping') {
      result = { pong: true };
    } else if (type === 'init') {
      const opts = {
        runtimeUrl: runtimeUrl || packageUrl('models/ort/ort.wasm.min.mjs'),
        modelUrl: modelUrl || packageUrl('models/ultraface-rfb320.onnx'),
      };
      initializing ??= createVisionDetector(opts);
      detector = await initializing;
      result = { ready: true };
    } else if (type === 'detect') {
      if (!detector) throw new Error('Vision sandbox not initialized');
      result = await detector.detect(bitmap);
    } else {
      throw new Error('Unknown sandbox operation');
    }
    event.source.postMessage({ id, ok: true, result }, '*');
  } catch (error) {
    event.source.postMessage({ id, ok: false, error: error?.message || String(error) }, '*');
  } finally {
    try {
      bitmap?.close?.();
    } catch {
      /* ignore */
    }
  }
});

try {
  window.parent.postMessage({ type: 'sandbox-ready' }, '*');
} catch {
  /* parent may not be ready yet; client also pings on iframe load */
}

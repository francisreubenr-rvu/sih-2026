/**
 * ORT host for MV3 manifest sandbox page (DBG-002 / DBG-003).
 * No chrome.* APIs — parent passes absolute package URLs or we resolve relative to this document.
 * Raw pixels stay in-browser (postMessage / transferable ImageBitmap only).
 *
 * DBG-003: decode → detect → selective mosaic run here so the action popup stays thin
 * (chrome.* + UI messaging only). Sandbox process abort may still require Reload.
 */
import { createVisionDetector } from '../shared/vision.mjs';
import { redactSelective } from '../shared/selective-redaction.mjs';

let detector;
let initializing;

function packageUrl(relative) {
  return new URL(relative, document.baseURI).href;
}

async function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid capture dataUrl');
  }
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Failed to decode capture');
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function selectivePreviewBitmap(bitmap, viewport, regions, blockSize = 14) {
  const width = viewport?.width;
  const height = viewport?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Invalid viewport for selective preview');
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const source = ctx.getImageData(0, 0, width, height);
  const start = performance.now();
  const result = redactSelective(source.data, width, height, regions || [], { blockSize });
  const elapsedMs = performance.now() - start;
  ctx.putImageData(new ImageData(result.data, width, height), 0, 0);
  const previewBitmap = typeof canvas.transferToImageBitmap === 'function'
    ? canvas.transferToImageBitmap()
    : await createImageBitmap(canvas);
  const total = width * height;
  const redacted = result.applied.reduce((n, a) => n + a.pixels, 0);
  return {
    previewBitmap,
    previewMeta: {
      mode: 'selective-pixelate',
      localOnly: true,
      elapsedMs,
      redactedPixels: redacted,
      preservedRatio: total ? (total - redacted) / total : null,
      regionsApplied: result.applied.length,
      host: 'ort-sandbox',
    },
  };
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const { id, type, bitmap, dataUrl, runtimeUrl, modelUrl, viewport, regions, useSelectiveMosaic, blockSize } = data;
  if (id == null || typeof type !== 'string') return;

  let result;
  let transfer = [];
  let ownedBitmap = bitmap;
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
    } else if (type === 'protect') {
      if (!detector) throw new Error('Vision sandbox not initialized');
      ownedBitmap = await decodeDataUrl(dataUrl);
      const detectResult = await detector.detect(ownedBitmap);
      result = {
        detections: detectResult.detections,
        inferenceMs: detectResult.inferenceMs,
        bitmapWidth: ownedBitmap.width,
        bitmapHeight: ownedBitmap.height,
      };
      if (useSelectiveMosaic) {
        const ratioX = (viewport?.width || ownedBitmap.width) / ownedBitmap.width;
        const ratioY = (viewport?.height || ownedBitmap.height) / ownedBitmap.height;
        const mergedRegions = [...(regions || [])];
        for (const face of detectResult.detections || []) {
          mergedRegions.push({
            kind: 'face',
            rect: {
              x: face.x * ratioX,
              y: face.y * ratioY,
              width: face.width * ratioX,
              height: face.height * ratioY,
            },
          });
        }
        const preview = await selectivePreviewBitmap(
          ownedBitmap,
          viewport || { width: ownedBitmap.width, height: ownedBitmap.height },
          mergedRegions,
          blockSize || 14,
        );
        result.previewBitmap = preview.previewBitmap;
        result.previewMeta = preview.previewMeta;
        transfer.push(preview.previewBitmap);
      } else {
        result.previewMeta = { mode: 'wireframe', localOnly: true, elapsedMs: 0, host: 'ort-sandbox' };
      }
    } else {
      throw new Error('Unknown sandbox operation');
    }
    event.source.postMessage({ id, ok: true, result }, '*', transfer);
  } catch (error) {
    for (const bmp of transfer) {
      try { bmp?.close?.(); } catch { /* ignore */ }
    }
    event.source.postMessage({ id, ok: false, error: error?.message || String(error) }, '*');
  } finally {
    try { ownedBitmap?.close?.(); } catch { /* ignore */ }
  }
});

try {
  window.parent.postMessage({ type: 'sandbox-ready' }, '*');
} catch {
  /* parent may not be ready yet */
}

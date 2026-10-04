// vision.js: the on-device face detector (UltraFace RFB-320 on ONNX Runtime Web, WASM backend).
//
// Ported from Prototype/shared/vision.mjs (same pre-processing, decode, threshold and NMS), so the
// root extension does not import from the Prototype tree. Loaded only by offscreen.js: the MV3
// service worker cannot `import()` ONNX Runtime's WASM loader, so the model runs in the offscreen
// document and the worker asks it for boxes over a port (utils/vision-client.js).
//
// Assets are bundled in extension/models/ (no remote code): the runtime ort.wasm.min.mjs with its
// ort-wasm-simd-threaded.{mjs,wasm}, and ultraface-rfb320.onnx. Licences sit beside them.
//
// decodeFaces(), rgbaToNchw() and iou() are pure and run under node --test.

export const MODEL_NAME = 'UltraFace RFB-320';
export const MODEL_INPUT = Object.freeze({ width: 320, height: 240 });
export const FACE_THRESHOLD = 0.7;

function imageShape(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new Error('Invalid image shape');
  }
}

// RGBA bytes to the model's NCHW float input, normalised as (v - 127) / 128.
export function rgbaToNchw(data, width = MODEL_INPUT.width, height = MODEL_INPUT.height) {
  imageShape(width, height);
  if (data.length !== width * height * 4) throw new Error('Invalid image shape');
  const n = width * height;
  const out = new Float32Array(n * 3);
  const byteInput = data instanceof Uint8Array || data instanceof Uint8ClampedArray;
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    if (!byteInput && (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || r < 0 || g < 0 || b < 0 || r > 255 || g > 255 || b > 255)) {
      throw new Error('Invalid image sample');
    }
    out[i] = (r - 127) / 128;
    out[n + i] = (g - 127) / 128;
    out[2 * n + i] = (b - 127) / 128;
  }
  return out;
}

export function iou(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, right - x) * Math.max(0, bottom - y);
  return inter / (a.width * a.height + b.width * b.height - inter || 1);
}

// Model outputs (scores [N,2], boxes [N,4] in 0..1) to face boxes in the source image's pixels.
// A malformed tensor throws: it is a failed inference, never a clean "no faces" result.
export function decodeFaces(scores, boxes, width, height, threshold = FACE_THRESHOLD) {
  imageShape(width, height);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid face threshold');
  if (!scores?.length || scores.length % 2 || scores.length > 200000 || boxes?.length !== scores.length * 2) {
    throw new Error('Unexpected face model outputs');
  }
  for (const score of scores) if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid face model score');
  for (const coordinate of boxes) if (!Number.isFinite(coordinate)) throw new Error('Invalid face model box');
  const candidates = [];
  for (let i = 0; i < scores.length / 2; i += 1) {
    if (scores[i * 2 + 1] < threshold) continue;
    const x = Math.max(0, boxes[i * 4] * width);
    const y = Math.max(0, boxes[i * 4 + 1] * height);
    const right = Math.min(width, boxes[i * 4 + 2] * width);
    const bottom = Math.min(height, boxes[i * 4 + 3] * height);
    if (right > x && bottom > y) candidates.push({ kind: 'face', x, y, width: right - x, height: bottom - y, confidence: scores[i * 2 + 1] });
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const c of candidates) {
    if (kept.every((k) => iou(c, k) < 0.3)) {
      kept.push(c);
      if (kept.length === 100) break;
    }
  }
  return kept;
}

// Browser only (offscreen document). One inference at a time; a second call while one runs is
// refused rather than queued, so a slow capture can never pile raw pixels up in memory.
export async function createVisionDetector({ runtimeUrl, modelUrl }) {
  const ort = await import(runtimeUrl);
  ort.env.wasm.wasmPaths = new URL('.', runtimeUrl).href;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  let canvas;
  let ctx;
  try {
    canvas = new OffscreenCanvas(MODEL_INPUT.width, MODEL_INPUT.height);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Vision canvas unavailable');
  } catch (error) {
    await session.release();
    throw error;
  }
  let disposed = false;
  let active = null;

  async function infer(bitmap) {
    const width = bitmap?.width;
    const height = bitmap?.height;
    imageShape(width, height);
    const tensors = new Set();
    try {
      ctx.drawImage(bitmap, 0, 0, MODEL_INPUT.width, MODEL_INPUT.height);
      const tensor = new ort.Tensor('float32', rgbaToNchw(ctx.getImageData(0, 0, MODEL_INPUT.width, MODEL_INPUT.height).data), [1, 3, MODEL_INPUT.height, MODEL_INPUT.width]);
      tensors.add(tensor);
      const start = performance.now();
      const output = await session.run({ [session.inputNames[0]]: tensor });
      const inferenceMs = performance.now() - start;
      const outputs = Object.values(output);
      for (const value of outputs) tensors.add(value);
      const scores = outputs.find((t) => t.dims.at(-1) === 2);
      const boxes = outputs.find((t) => t.dims.at(-1) === 4);
      if (!scores || !boxes) throw new Error('Unexpected face model outputs');
      const detections = decodeFaces(scores.data, boxes.data, width, height);
      return { detections, width, height, inferenceMs, model: MODEL_NAME, backend: 'wasm-single-thread' };
    } finally {
      // Release tensors on failure as well as success, and wipe the resized pixels from the
      // reusable canvas after every attempt.
      for (const t of tensors) {
        try { t.dispose(); } catch { /* best effort */ }
      }
      try { ctx.clearRect(0, 0, MODEL_INPUT.width, MODEL_INPUT.height); } catch { /* best effort */ }
    }
  }

  return {
    // Requests queue behind a running one instead of failing "busy" (code review, 3 October 2026):
    // a detect the worker abandoned at its 1.5 s cap keeps running here, and refusing the next
    // step's request made one slow capture fail several steps in a row.
    async detect(bitmap) {
      if (disposed) throw new Error('Detector disposed');
      const previous = active;
      const run = (async () => {
        if (previous) { try { await previous; } catch { /* that request's caller saw it */ } }
        if (disposed) throw new Error('Detector disposed');
        return infer(bitmap);
      })();
      active = run;
      try {
        return await run;
      } finally {
        if (active === run) active = null;
      }
    },
    async dispose() {
      disposed = true;
      try { if (active) await active; } catch { /* the caller already saw it */ }
      await session.release();
    },
  };
}

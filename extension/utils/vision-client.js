// vision-client.js: the service worker's side of the on-device face stage.
//
// The face detector (utils/vision.js, ONNX Runtime Web on WASM) cannot run in the MV3 service
// worker: ORT loads its WASM glue with a dynamic import(), which service workers do not allow. It
// runs in an offscreen document (offscreen.html / offscreen.js) instead, and this module talks to
// it over a runtime Port named VISION_PORT_NAME.
//
// Why a Port and not chrome.runtime.sendMessage: sendMessage from the worker is delivered to EVERY
// extension page with an onMessage listener, including the side panel. The detect request carries
// the raw, unmasked capture, so it must reach the offscreen document only. Only offscreen.js
// listens for onConnect with this name, and it answers only a connection opened by this worker.
//
// Privacy: the raw capture goes from this worker to the offscreen document and nowhere else. The
// reply holds boxes, sizes and timings, never pixels. Nothing here talks to the Warden or the
// network.
//
// Failure policy (fail closed): any failure, malformed reply or timeout rejects. background.js
// then discards the capture for that step, so neither the panel nor OmniParser receives an image
// whose faces were not checked. The run itself continues: the planner never sees pixels.

export const VISION_PORT_NAME = 'dhristi-vision';
export const OFFSCREEN_PATH = 'offscreen.html';
// Cap on one detect round trip (decode + inference + reply). A capture not checked within this is
// treated as a failed check.
export const VISION_DETECT_TIMEOUT_MS = 1500;
// Separate cap on the one-time start (create the offscreen document, compile the WASM runtime,
// load the model). Warmed at START_TASK so the first step rarely waits on it.
export const VISION_INIT_TIMEOUT_MS = 10000;
// Each face box is grown by this fraction of its size on every side before masking. UltraFace
// boxes are tight on the face; the codebase's rule is to over-mask rather than under-mask.
export const FACE_PAD_RATIO = 0.15;

export class VisionError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'VisionError';
    this.reason = reason; // 'unavailable' | 'timeout' | 'host' | 'malformed' | 'failed'
  }
}

export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new VisionError('timeout', message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Validates a detect reply from the offscreen document. Anything off-shape is a failed check,
// never "no faces".
export function checkDetectReply(result) {
  if (!result || typeof result !== 'object') throw new VisionError('malformed', 'face check returned no result');
  const { detections, width, height, inferenceMs } = result;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new VisionError('malformed', 'face check returned no image size');
  }
  if (!Array.isArray(detections) || detections.length > 100) throw new VisionError('malformed', 'face check returned no box list');
  const boxes = detections.map((d) => {
    if (!d || !isNum(d.x) || !isNum(d.y) || !isNum(d.width) || !isNum(d.height) || d.width <= 0 || d.height <= 0) {
      throw new VisionError('malformed', 'face check returned a malformed box');
    }
    return { x: d.x, y: d.y, width: d.width, height: d.height, confidence: isNum(d.confidence) ? d.confidence : null };
  });
  return {
    detections: boxes,
    width,
    height,
    inferenceMs: isNum(inferenceMs) ? inferenceMs : null,
    decodeMs: isNum(result.decodeMs) ? result.decodeMs : null,
    model: typeof result.model === 'string' ? result.model : null,
    backend: typeof result.backend === 'string' ? result.backend : null,
  };
}

// Face boxes (capture pixels) to mask fields in the scan's CSS-pixel space, the space
// redactScreenshot() expects (it scales back to capture pixels, rounding outward). Each box is
// padded by `pad` of its size on every side and clamped to the viewport.
export function faceFieldsFromDetections(detections, capture, viewport, pad = FACE_PAD_RATIO) {
  if (!Array.isArray(detections) || detections.length === 0) return [];
  const cw = capture?.width;
  const ch = capture?.height;
  const hasViewport = viewport && isNum(viewport.width) && viewport.width > 0 && isNum(viewport.height) && viewport.height > 0;
  const sx = hasViewport && cw ? viewport.width / cw : 1;
  const sy = hasViewport && ch ? viewport.height / ch : 1;
  const maxW = hasViewport ? viewport.width : cw;
  const maxH = hasViewport ? viewport.height : ch;
  const fields = [];
  for (const d of detections) {
    const px = d.width * pad;
    const py = d.height * pad;
    const x0 = Math.max(0, (d.x - px) * sx);
    const y0 = Math.max(0, (d.y - py) * sy);
    const x1 = Math.min(maxW, (d.x + d.width + px) * sx);
    const y1 = Math.min(maxH, (d.y + d.height + py) * sy);
    if (!(x1 > x0 && y1 > y0)) continue;
    fields.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, kind: 'face', confidence: 'model' });
  }
  return fields;
}

// chromeApi is injectable so the message contract can be tested without a browser.
export function createVisionClient({
  chromeApi = globalThis.chrome,
  detectTimeoutMs = VISION_DETECT_TIMEOUT_MS,
  initTimeoutMs = VISION_INIT_TIMEOUT_MS,
} = {}) {
  let seq = 0;
  let warming = null;
  let initInfo = null;

  async function hostExists() {
    if (typeof chromeApi.runtime?.getContexts === 'function') {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chromeApi.runtime.getURL(OFFSCREEN_PATH)],
      });
      return Array.isArray(contexts) && contexts.length > 0;
    }
    return false;
  }

  async function ensureHost() {
    if (!chromeApi?.offscreen?.createDocument) throw new VisionError('unavailable', 'this browser has no offscreen document API');
    if (await hostExists()) return;
    try {
      await chromeApi.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        // BLOBS: the document turns the capture (a data: URL) into a Blob and an ImageBitmap to
        // feed the detector. The deeper reason it exists at all is that the worker cannot load
        // ONNX Runtime's WASM glue (no dynamic import in service workers); Chrome has no reason
        // value for "run WebAssembly", and BLOBS names the part of the work only a document can do.
        reasons: ['BLOBS'],
        justification: 'Runs the bundled face detector on the tab capture on this device, so faces are masked before the capture is shown or passed to the optional local detector.',
      });
    } catch (error) {
      // Two starts racing: the second create fails because one document already exists.
      if (!/single offscreen|already/i.test(String(error?.message || error))) throw new VisionError('host', `could not start the face detector: ${error?.message || error}`);
    }
  }

  // One request on a fresh Port. Resolves with the reply's result, rejects on an error reply, on a
  // dropped port, or after timeoutMs. The port is always closed afterwards.
  function request(type, payload, timeoutMs) {
    const id = `v${++seq}`;
    let port;
    const done = new Promise((resolve, reject) => {
      try {
        port = chromeApi.runtime.connect({ name: VISION_PORT_NAME });
      } catch (error) {
        reject(new VisionError('host', `face detector not reachable: ${error?.message || error}`));
        return;
      }
      port.onMessage.addListener((msg) => {
        if (!msg || msg.id !== id) return;
        if (msg.ok === true) resolve(msg.result);
        else reject(new VisionError('failed', `face detector error: ${typeof msg.error === 'string' ? msg.error.slice(0, 200) : 'unknown'}`));
      });
      port.onDisconnect.addListener(() => {
        const why = chromeApi.runtime.lastError?.message;
        reject(new VisionError('host', `face detector closed the connection${why ? `: ${why}` : ''}`));
      });
      port.postMessage({ id, type, ...payload });
    });
    return withTimeout(done, timeoutMs, `face check took longer than ${timeoutMs} ms`).finally(() => {
      try { port?.disconnect(); } catch { /* already closed */ }
    });
  }

  // Start the host and load the model once. A failure clears the memo so a later step retries.
  function warm() {
    if (!warming) {
      const t0 = performance.now();
      warming = withTimeout((async () => {
        await ensureHost();
        // The document may still be wiring its listener just after creation: retry a refused
        // connection briefly before giving up.
        let lastError;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          try {
            const result = await request('init', {}, initTimeoutMs);
            initInfo = { ms: performance.now() - t0, hostInitMs: isNum(result?.initMs) ? result.initMs : null };
            return initInfo;
          } catch (error) {
            lastError = error;
            if (!(error instanceof VisionError) || error.reason !== 'host') throw error;
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        throw lastError;
      })(), initTimeoutMs, `face detector did not start within ${initTimeoutMs} ms`);
      warming.catch(() => { warming = null; });
    }
    return warming;
  }

  return {
    warm,
    // Detect faces on a capture. Returns the validated reply plus the time spent waiting for the
    // detector to start (0 when it was already warm) and the detect round trip.
    async detect(dataUrl) {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new VisionError('malformed', 'no capture to check');
      const t0 = performance.now();
      await warm();
      const t1 = performance.now();
      const result = checkDetectReply(await request('detect', { dataUrl }, detectTimeoutMs));
      return { ...result, waitInitMs: t1 - t0, detectMs: performance.now() - t1 };
    },
    // Measurement only: the host's JS heap (performance.memory, Chromium) and its start time.
    async stats() {
      await warm();
      return request('stats', {}, detectTimeoutMs);
    },
    initInfo: () => initInfo,
  };
}

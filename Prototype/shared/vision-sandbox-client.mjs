/**
 * Bridge from extension popup (or any page) to the MV3 ort-sandbox iframe.
 * Same detector surface as createWorkerVisionDetector: init → detect → dispose.
 * Sandbox process isolation: WASM abort must not kill the popup renderer (DBG-002 H1).
 * DBG-003: protectCapture runs decode/detect/mosaic in the sandbox; soft-recreate on death.
 */
export async function createSandboxVisionDetector({
  sandboxUrl,
  runtimeUrl,
  modelUrl,
  timeoutMs = 30000,
  documentImpl = globalThis.document,
  bitmapFactory = null,
  messageTarget = globalThis,
} = {}) {
  bitmapFactory ??= globalThis.createImageBitmap?.bind(globalThis) || (async () => {
    throw new Error('createImageBitmap unavailable');
  });
  if (!sandboxUrl) throw new Error('sandboxUrl is required');
  if (!documentImpl?.body) throw new Error('document body unavailable for vision sandbox iframe');

  let nextId = 0;
  let disposed = false;
  let active = false;
  let releasePromise;
  let iframe = null;
  let pending = new Map();
  let listeners = [];

  const contentWindow = () => iframe?.contentWindow;
  const failAll = (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };
  const addListener = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };
  const detachListeners = () => {
    for (const off of listeners) off();
    listeners = [];
  };
  const removeFrame = () => {
    try { iframe?.remove?.(); } catch { /* ignore */ }
    iframe = null;
  };
  const onMessage = (event) => {
    if (event.source !== contentWindow()) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'sandbox-ready') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'Local vision failed'));
  };
  const onFrameError = () => {
    if (disposed) return;
    failAll(new Error('Local vision sandbox frame unavailable'));
  };
  const mountFrame = async () => {
    iframe = documentImpl.createElement('iframe');
    iframe.src = sandboxUrl;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:0;top:0';
    documentImpl.body.appendChild(iframe);
    addListener(messageTarget, 'message', onMessage);
    addListener(iframe, 'error', onFrameError);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local vision sandbox load timed out')), timeoutMs);
      const finish = () => { clearTimeout(timer); resolve(); };
      const readyHandler = (event) => {
        if (event.source !== contentWindow()) return;
        if (event.data?.type === 'sandbox-ready' || (event.data?.ok && event.data?.result?.pong)) {
          messageTarget.removeEventListener('message', readyHandler);
          finish();
        }
      };
      messageTarget.addEventListener('message', readyHandler);
      listeners.push(() => messageTarget.removeEventListener('message', readyHandler));
      addListener(iframe, 'load', () => {
        try { contentWindow()?.postMessage({ id: 0, type: 'ping' }, '*'); } catch { /* ignore */ }
      });
      try {
        if (iframe.contentDocument?.readyState === 'complete') {
          contentWindow()?.postMessage({ id: 0, type: 'ping' }, '*');
        }
      } catch { /* opaque */ }
    });
  };
  const request = (type, extra = {}, transfer = []) =>
    new Promise((resolve, reject) => {
      if (disposed) { reject(new Error('Detector disposed')); return; }
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        const error = new Error('Local vision sandbox timed out');
        reject(error);
        failAll(error);
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        const win = contentWindow();
        if (!win) throw new Error('Vision sandbox frame unavailable');
        win.postMessage({ id, type, ...extra }, '*', transfer);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  const initDetector = async () => {
    const initExtra = {};
    if (runtimeUrl) initExtra.runtimeUrl = runtimeUrl;
    if (modelUrl) initExtra.modelUrl = modelUrl;
    await request('init', initExtra);
  };
  try {
    await mountFrame();
    await initDetector();
  } catch (error) {
    detachListeners();
    removeFrame();
    throw error;
  }
  return {
    async detect(source) {
      if (disposed) throw new Error('Detector disposed');
      if (active) throw new Error('Detector busy');
      active = true;
      let bitmap;
      try {
        bitmap = await bitmapFactory(source);
        if (disposed) throw new Error('Detector disposed');
        return await request('detect', { bitmap }, [bitmap]);
      } finally {
        try { bitmap?.close?.(); } catch { /* ignore */ }
        active = false;
      }
    },
    async protectCapture({ dataUrl, viewport, regions = [], useSelectiveMosaic = false, blockSize = 14 } = {}) {
      if (disposed) throw new Error('Detector disposed');
      if (active) throw new Error('Detector busy');
      if (typeof dataUrl !== 'string') throw new Error('dataUrl required');
      active = true;
      try {
        return await request('protect', {
          dataUrl, viewport, regions,
          useSelectiveMosaic: Boolean(useSelectiveMosaic),
          blockSize,
        });
      } finally {
        active = false;
      }
    },
    async recreate() {
      if (disposed) throw new Error('Detector disposed');
      failAll(new Error('Vision sandbox recreating'));
      detachListeners();
      removeFrame();
      pending = new Map();
      await mountFrame();
      await initDetector();
    },
    get alive() { return !disposed && Boolean(contentWindow()); },
    dispose() {
      if (releasePromise) return releasePromise;
      disposed = true;
      releasePromise = Promise.resolve().then(() => {
        failAll(new Error('Detector disposed'));
        detachListeners();
        removeFrame();
      });
      return releasePromise;
    },
  };
}

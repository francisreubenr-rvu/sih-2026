import { createVisionDetector } from '../shared/vision.mjs';
import { makeScene, paintScene } from '../shared/privacy.mjs';
import { requestSchema, validateAction } from '../shared/protocol.mjs';
import { paintSelectivePreview } from '../shared/selective-redaction.mjs';
import { assertSanitizedPayload, readJsHeap, readClientEnvironment } from '../shared/rubric-hooks.mjs';

const api = globalThis.browser ?? globalThis.chrome;
const $ = s => document.querySelector(s);
const endpoint = 'http://127.0.0.1:9041/api/v1/plans';
let prepared, plan, tabId, detector, busy = false, lang = 'en'; lastCaptureMs = null;
let resourceStages = [];

const STRINGS = {
  en: {
    subtitle: 'SIH26171 · on-device review',
    trust: 'on this device',
    trust_hi: 'इस उपकरण पर',
    trust_title: 'Capture and privacy filter run in this browser. Raw pixels are not sent.',
    headline: 'Review what leaves\nyour browser.',
    lede: 'Local capture → privacy filter → protected layout → optional local planner. Confirm every action.',
    token_label: 'Local pairing token',
    token_ph: 'Paste from the local workspace',
    task_label: 'Task',
    task_pending: 'Review a pending request',
    task_completed: 'Show completed requests',
    task_next: 'Go to the next page',
    status_ready: 'Capture the active tab. Filtering runs here before any network call.',
    capture: 'Capture & protect',
    badge_local: 'Local selective preview',
    badge_egress: 'Egress: semantics only',
    plan: 'Send protected layout',
    proposal_empty: 'No action proposed.',
    execute: 'Confirm this action',
    inspect: 'Inspect outbound data',
    setup: 'Server setup',
    setup_body: 'Start the local server at http://127.0.0.1:9041. Add this exact origin to ALLOWED_ORIGINS, then restart it:',
    setup_note: 'Raw screenshots are used locally for vision and selective preview and are not included in requests. Prefer a local Ollama/Qwen planner; cloud LLM keys are not required.',
    capturing: 'Running local vision and selective redaction. No screen data is sent.',
    review: 'Review the selective preview. Outbound JSON is semantics-only — original pixels excluded.',
    sending: 'Sending approved semantics to the local reasoning server.',
  },
  hi: {
    subtitle: 'SIH26171 · ऑन-डिवाइस समीक्षा',
    trust: 'on this device',
    trust_hi: 'इस उपकरण पर',
    trust_title: 'कैप्चर और गोपनीयता फ़िल्टर इस ब्राउज़र में चलते हैं। कच्चे पिक्सेल नहीं भेजे जाते।',
    headline: 'देखें कि आपके ब्राउज़र से\nक्या बाहर जाता है।',
    lede: 'स्थानीय कैप्चर → गोपनीयता फ़िल्टर → सुरक्षित लेआउट → वैकल्पिक स्थानीय प्लानर। प्रत्येक क्रिया की पुष्टि करें।',
    token_label: 'स्थानीय पेयरिंग टोकन',
    token_ph: 'स्थानीय वर्कस्पेस से चिपकाएँ',
    task_label: 'कार्य',
    task_pending: 'लंबित अनुरोध की समीक्षा',
    task_completed: 'पूर्ण अनुरोध दिखाएँ',
    task_next: 'अगले पृष्ठ पर जाएँ',
    status_ready: 'सक्रिय टैब कैप्चर करें। नेटवर्क से पहले फ़िल्टरिंग यहाँ होती है।',
    capture: 'कैप्चर और सुरक्षित करें',
    badge_local: 'स्थानीय चयनात्मक पूर्वावलोकन',
    badge_egress: 'आउटबाउंड: केवल अर्थ',
    plan: 'सुरक्षित लेआउट भेजें',
    proposal_empty: 'कोई क्रिया प्रस्तावित नहीं।',
    execute: 'इस क्रिया की पुष्टि करें',
    inspect: 'आउटबाउंड डेटा देखें',
    setup: 'सर्वर सेटअप',
    setup_body: 'स्थानीय सर्वर http://127.0.0.1:9041 पर चलाएँ। ALLOWED_ORIGINS में यह मूल जोड़कर पुनः आरंभ करें:',
    setup_note: 'स्क्रीनशॉट केवल स्थानीय दृष्टि/पूर्वावलोकन के लिए हैं; अनुरोधों में शामिल नहीं। स्थानीय Ollama/Qwen प्राथमिकता; क्लाउड LLM कुंजी आवश्यक नहीं।',
    capturing: 'स्थानीय दृष्टि और चयनात्मक रेडक्शन चल रहा है। स्क्रीन डेटा नहीं भेजा जाता।',
    review: 'चयनात्मक पूर्वावलोकन देखें। आउटबाउंड JSON केवल अर्थ है — मूल पिक्सेल नहीं।',
    sending: 'अनुमोदित अर्थ स्थानीय रीज़निंग सर्वर को भेजे जा रहे हैं।',
  },
};

function t(key) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}

function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const value = t(key);
    if (el.tagName === 'OPTION') el.textContent = value;
    else el.innerHTML = value.replace(/\n/g, '<br>');
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.getAttribute('data-i18n-title'));
  }
  $('#lang-en').setAttribute('aria-pressed', String(lang === 'en'));
  $('#lang-hi').setAttribute('aria-pressed', String(lang === 'hi'));
}

const status = message => { $('#status').textContent = message; };
const clear = () => {
  prepared = null;
  plan = null;
  lastCaptureMs = null;
  resourceStages = [];
  $('#plan').disabled = true;
  $('#execute').disabled = true;
  $('#proposal').textContent = t('proposal_empty');
};
const setBusy = v => {
  busy = v;
  $('#capture').disabled = v;
  $('#task').disabled = v;
  $('#token').disabled = v;
};

$('#origin').textContent = new URL(api.runtime.getURL('/')).origin;
api.storage.session?.get('pairingToken').then(v => {
  if (v.pairingToken) $('#token').value = v.pairingToken;
});

$('#lang-en').addEventListener('click', () => { lang = 'en'; applyLang(); });
$('#lang-hi').addEventListener('click', () => { lang = 'hi'; applyLang(); });
applyLang();

async function call(message) {
  const response = await api.tabs.sendMessage(tabId, message);
  if (response?.error) throw new Error(response.error);
  if (!response) throw new Error('Page connection lost. Reopen the extension.');
  return response.data;
}

function bitmapToImageData(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Preview canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

$('#capture').addEventListener('click', async () => {
  if (busy) return;
  clear();
  setBusy(true);
  status(t('capturing'));
  let bitmap;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
    await api.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    detector ??= await createVisionDetector({
      runtimeUrl: api.runtime.getURL('models/ort/ort.wasm.min.mjs'),
      modelUrl: api.runtime.getURL('models/ultraface-rfb320.onnx'),
    });
    const captureStarted = performance.now();
    const scene = await call({ kind: 'collect' });
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    bitmap = await createImageBitmap(image);
    const result = await detector.detect(bitmap);
    await call({ kind: 'fresh', revision: scene.revision });
    const ratioX = scene.viewport.width / bitmap.width;
    const ratioY = scene.viewport.height / bitmap.height;
    for (const face of result.detections) {
      scene.regions.push({
        kind: 'face',
        rect: {
          x: face.x * ratioX,
          y: face.y * ratioY,
          width: face.width * ratioX,
          height: face.height * ratioY,
        },
      });
    }
    prepared = requestSchema.parse({ task: $('#task').value, scene: makeScene(scene) });
    assertSanitizedPayload(prepared);

    // Local selective preview: pixelate sensitive regions, keep layout context.
    // Egress remains prepared.scene (no pixels). Wireframe is fallback only.
    const previewCtx = $('#preview').getContext('2d');
    let previewMeta;
    try {
      const scaled = new OffscreenCanvas(scene.viewport.width, scene.viewport.height);
      const sctx = scaled.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(bitmap, 0, 0, scene.viewport.width, scene.viewport.height);
      const source = sctx.getImageData(0, 0, scene.viewport.width, scene.viewport.height);
      previewMeta = paintSelectivePreview(previewCtx, source, prepared.scene, {
        blockSize: 14,
        paintFallback: paintScene,
      });
      scaled.width = 0;
      scaled.height = 0;
    } catch {
      paintScene(previewCtx, prepared.scene);
      previewMeta = { mode: 'wireframe-fallback', localOnly: true };
    }

    lastCaptureMs = performance.now() - captureStarted;
    resourceStages.push({
      stage: 'capture-protect',
      elapsedMs: lastCaptureMs,
      inferenceMs: result.inferenceMs,
      previewElapsedMs: previewMeta.elapsedMs ?? null,
      heapAfter: readJsHeap(),
      environment: readClientEnvironment(),
      status: 'partial_diagnostic_only',
    });
    $('#preview').hidden = false;
    $('#payload').textContent = JSON.stringify(prepared, null, 2);
    const preserved = previewMeta.preservedRatio != null
      ? ` · ${(previewMeta.preservedRatio * 100).toFixed(0)}% layout pixels kept locally`
      : '';
    const heap = readJsHeap();
    const heapTxt = heap.available
      ? ` · heap ${(heap.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MiB JS`
      : '';
    $('#metrics').textContent =
      `${result.detections.length} face(s) · ${result.inferenceMs.toFixed(1)} ms WASM · ` +
      `${prepared.scene.controls.length} controls · ${prepared.scene.regions.length} regions · ` +
      `preview ${previewMeta.mode}${preserved} · capture ${lastCaptureMs.toFixed(0)} ms${heapTxt}`;
    $('#plan').disabled = false;
    status(t('review'));
  } catch (e) {
    clear();
    status(`Capture blocked: ${e.message}`);
  } finally {
    bitmap?.close();
    setBusy(false);
  }
});

$('#plan').addEventListener('click', async () => {
  if (busy || !prepared) return;
  setBusy(true);
  $('#plan').disabled = true;
  try {
    const pairingToken = $('#token').value.trim();
    if (pairingToken.length < 24) throw new Error('Paste your local pairing token first.');
    await api.storage.session?.set({ pairingToken });
    await call({ kind: 'fresh', revision: prepared.scene.revision });
    status(t('sending'));
    const body = requestSchema.parse(prepared);
    assertSanitizedPayload(body);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pairingToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Reasoning failed.');
    await call({ kind: 'fresh', revision: result.data.revision });
    const action = validateAction(result.data.action, prepared.scene);
    plan = { action, revision: result.data.revision };
    const target = prepared.scene.controls.find(c => c.id === action.targetId);
    $('#proposal').textContent =
      action.type === 'click'
        ? `Proposed: click “${target.label}”. Review the real page before confirming.`
        : action.type === 'scroll'
          ? `Proposed: scroll ${action.direction}.`
          : 'Task complete.';
    $('#execute').disabled = action.type === 'done';
    status(`Received a validated action from ${result.data.provider.model}.`);
  } catch (e) {
    clear();
    status(`${e.message} Capture again to retry.`);
  } finally {
    setBusy(false);
  }
});

$('#execute').addEventListener('click', async () => {
  try {
    if (!plan) return;
    await call({ kind: 'execute', plan: { ...plan, userConfirmed: true } });
    clear();
    status('Action executed. Capture the new page to continue.');
  } catch (e) {
    clear();
    status(e.message);
  }
});

$('#task').addEventListener('change', clear);

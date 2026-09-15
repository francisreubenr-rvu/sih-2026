import { createSandboxVisionDetector } from '../shared/vision-sandbox-client.mjs';
import { makeScene, paintScene } from '../shared/privacy.mjs';
import { requestSchema, validateAction } from '../shared/protocol.mjs';
import { assertSanitizedPayload, readJsHeap, readClientEnvironment } from '../shared/rubric-hooks.mjs';
import {
  classifyCaptureError,
  advanceStage,
  summarizeProtectLoop,
  privacyOnlyCompletion,
  TOOLBAR_ACTIVETAB_NOTE,
  snapshotGestureTab,
  assertGestureTabFresh,
  isSandboxDeathError,
} from '../shared/capture-loop.mjs';
import {
  OPERATING_MODES,
  resolveOperatingMode,
  createDetectorCache,
  resolveCapturePreviewStrategy,
  captureVisibleTabOptions,
} from '../shared/latency-strategy.mjs';
import { computeLocalRiskScore, formatLocalRiskSummary } from '../shared/score-path.mjs';

const api = globalThis.browser ?? globalThis.chrome;
const $ = s => document.querySelector(s);
const endpoint = 'http://127.0.0.1:9041/api/v1/plans';
let prepared, plan, tabId, busy = false, lang = 'en', lastCaptureMs = null, lastRisk = null;
const detectorCache = createDetectorCache();
/** Popup-lifetime only — closing the action popup drops the sandbox iframe (DBG-002). */
let visionPreload = null;
/** Active tab snapshot at toolbar-open; Capture refuses navigation since this gesture (DBG-003 H3). */
let gestureTab = null;

function visionFactory() {
  return createSandboxVisionDetector({
    sandboxUrl: api.runtime.getURL('ort-sandbox.html'),
    runtimeUrl: api.runtime.getURL('models/ort/ort.wasm.min.mjs'),
    modelUrl: api.runtime.getURL('models/ultraface-rfb320.onnx'),
  });
}

/** Warm ORT in the sandboxed document on popup open, not only on Capture (DBG-002 H3). */
function ensureVisionPreload() {
  if (!visionPreload) {
    status(t('vision_loading'));
    visionPreload = detectorCache.get(visionFactory).then(
      (hit) => {
        if (!busy && currentStage === 'idle' && !prepared) status(t('status_ready'));
        return hit;
      },
      (err) => {
        visionPreload = null;
        status(`${t('vision_failed')} (${err?.message || err})`);
        throw err;
      },
    );
  }
  return visionPreload;
}

/** Soft-recreate sandbox iframe after death; Reload may still be required (DBG-003 H2). */
async function softRecreateVisionSandbox() {
  status(t('vision_recovering'));
  let hit = null;
  try { hit = await visionPreload; } catch { /* ignore */ }
  try { await hit?.detector?.dispose?.(); } catch { /* ignore */ }
  detectorCache.reset();
  visionPreload = null;
  return ensureVisionPreload();
}

async function recordGestureTab() {
  try {
    const [active] = await api.tabs.query({ active: true, currentWindow: true });
    gestureTab = snapshotGestureTab(active);
  } catch {
    gestureTab = null;
  }
}

let resourceStages = [];
let currentStage = 'idle';
let lastLoopSummary = null;

const STRINGS = {
  en: {
    subtitle: 'SIH26171 · on-device review',
    trust: 'on this device',
    trust_hi: 'इस उपकरण पर',
    trust_title: 'Capture and privacy filter run in this browser. What can leave: semantic scene fields only. Raw pixels stay local.',
    headline: 'Review what leaves\nthis device.',
    lede: 'Three paths: Fast (local protect), Score (local risk), Reason (local LLM). Confirm every action.',
    toolbar_note: TOOLBAR_ACTIVETAB_NOTE.en,
    token_label: 'Local pairing token',
    token_ph: 'Paste from the local workspace',
    task_label: 'Task',
    task_pending: 'Review a pending request',
    task_completed: 'Show completed requests',
    task_next: 'Go to the next page',
    status_ready: 'Capture the active tab. Filtering runs here before any network call.',
    vision_loading: 'Loading local vision…',
    vision_failed: 'Local vision failed to start. Close and reopen the toolbar popup, or Reload the extension.',
    capture: 'Capture & protect',
    badge_local: 'Local selective preview',
    badge_egress: 'What leaves: semantic scene fields only',
    plan: 'Send protected layout (Reason)',
    proposal_empty: 'No action proposed.',
    execute: 'Confirm this action',
    inspect: 'Inspect outbound data',
    setup: 'Server setup',
    setup_body: 'Start the local server at http://127.0.0.1:9041. Add this exact origin to ALLOWED_ORIGINS, then restart it:',
    setup_note: 'Raw screenshots stay on this device for vision/preview and are never in requests. DigiLocker-inspired trust pattern only — not DigiLocker partner, API, or custody. Prefer local Ollama/Qwen; cloud LLM keys not required.',
    capturing: 'Running local vision and selective redaction. No screen data is sent.',
    review: 'Review the selective preview. What leaves: semantic scene fields only — raw pixels stay local.',
    sending: 'Sending approved semantics to the local reasoning server.',
    err_activeTab: 'Tab capture needs the toolbar gesture. Close this window and open Dhristi from the toolbar icon, then Capture again.',
    err_navigated: 'Tab navigated or changed since the toolbar was opened. Close this popup, open Dhristi from the toolbar on the page, then Capture.',
    err_connection: 'Page connection lost. Retrying injection…',
    err_restricted: 'This page blocks extension capture. Open the local fixture or an allowed http(s) page.',
    vision_recovering: 'Local vision sandbox restarted. If Capture still fails, Reload the extension on chrome://extensions.',
    mode_legend: 'Path selection',
    mode_privacy: 'Fast path — privacy-only (no LLM)',
    mode_score: 'Score path — local risk after protect',
    mode_wireframe: 'Wireframe preview (default — safer for public / multi-site)',
    mode_hint: 'Score runs after Fast protect (no LLM). Uncheck Fast to enable Reason. Official SIH score stays null.',
    path_fast_name: 'Fast',
    path_fast_blurb: 'capture→detect→mask→review · no LLM',
    path_score_name: 'Score',
    path_score_blurb: 'local heuristic risk · official null',
    path_reason_name: 'Reason',
    path_reason_blurb: 'Ollama/Qwen · outside <200 ms',
    path_policy: 'Fast timing is not a G11 pass. G11 measures planner-inclusive full-flow p95 <200 ms at n≥100.',
    reason_tag: 'Reason path · local Ollama/Qwen · outside <200 ms G11 budget',
    egress_copy: 'What leaves this device: semantic scene fields only. Raw pixels stay local.',
    digilocker_note: 'DigiLocker-inspired trust pattern only — not DigiLocker partner, API, or custody.',
    privacy_done: 'Fast path complete (no LLM). Timing above is local protect only — not a G11 pass. Uncheck Fast to use Reason.',
    metrics_fast_prefix: 'Fast path (not G11 full-flow)',
    metrics_reason_note: 'Reason path uses local LLM; historically seconds — outside <200 ms budget.',
    score_tag: 'Score path · local heuristic risk · not official SIH score',
    score_empty: 'Capture & protect first. Score ranks local scene risk only.',
    score_disclaimer: 'Organizer weights accuracy+PII+redaction ≈65% — evaluation weights, not our measured score. officialScore remains null. Not WebPII.',
    score_done: 'Score path: local risk band shown. Not a G11 pass; official score null.',
    reason_cold_start: 'Reason planner unavailable (Ollama down or unreachable). Stay on Fast or Score — no LLM required. Start ollama serve + pull qwen2.5:7b-instruct only if you need Reason.',
    reason_failed_keep: 'Reason failed. Protected capture is still here — enable Fast or Score, or fix Ollama and retry Send.',
  },
  hi: {
    subtitle: 'SIH26171 · ऑन-डिवाइस समीक्षा',
    trust: 'on this device',
    trust_hi: 'इस उपकरण पर',
    trust_title: 'कैप्चर और गोपनीयता फ़िल्टर इस ब्राउज़र में चलते हैं। बाहर जा सकता है: केवल अर्थ-दृश्य फ़ील्ड। कच्चे पिक्सेल स्थानीय रहते हैं।',
    headline: 'देखें कि इस उपकरण से\nक्या बाहर जाता है।',
    lede: 'तीन पथ: Fast (स्थानीय protect), Score (स्थानीय जोखिम), Reason (स्थानीय LLM)। प्रत्येक क्रिया की पुष्टि करें।',
    toolbar_note: TOOLBAR_ACTIVETAB_NOTE.hi,
    token_label: 'स्थानीय पेयरिंग टोकन',
    token_ph: 'स्थानीय वर्कस्पेस से चिपकाएँ',
    task_label: 'कार्य',
    task_pending: 'लंबित अनुरोध की समीक्षा',
    task_completed: 'पूर्ण अनुरोध दिखाएँ',
    task_next: 'अगले पृष्ठ पर जाएँ',
    status_ready: 'सक्रिय टैब कैप्चर करें। नेटवर्क से पहले फ़िल्टरिंग यहाँ होती है।',
    vision_loading: 'स्थानीय दृष्टि लोड हो रही है…',
    vision_failed: 'स्थानीय दृष्टि शुरू नहीं हुई। पॉपअप बंद कर फिर खोलें, या एक्सटेंशन Reload करें।',
    capture: 'कैप्चर और सुरक्षित करें',
    badge_local: 'स्थानीय चयनात्मक पूर्वावलोकन',
    badge_egress: 'बाहर जाता है: केवल अर्थ-दृश्य फ़ील्ड',
    plan: 'सुरक्षित लेआउट भेजें (Reason)',
    proposal_empty: 'कोई क्रिया प्रस्तावित नहीं।',
    execute: 'इस क्रिया की पुष्टि करें',
    inspect: 'आउटबाउंड डेटा देखें',
    setup: 'सर्वर सेटअप',
    setup_body: 'स्थानीय सर्वर http://127.0.0.1:9041 पर चलाएँ। ALLOWED_ORIGINS में यह मूल जोड़कर पुनः आरंभ करें:',
    setup_note: 'स्क्रीनशॉट इस उपकरण पर रहते हैं; अनुरोधों में नहीं। DigiLocker-प्रेरित विश्वास पैटर्न मात्र — भागीदार/API/कस्टडी नहीं। स्थानीय Ollama/Qwen प्राथमिकता।',
    capturing: 'स्थानीय दृष्टि और चयनात्मक रेडक्शन चल रहा है। स्क्रीन डेटा नहीं भेजा जाता।',
    review: 'चयनात्मक पूर्वावलोकन देखें। बाहर जाता है: केवल अर्थ-दृश्य फ़ील्ड — कच्चे पिक्सेल स्थानीय।',
    sending: 'अनुमोदित अर्थ स्थानीय रीज़निंग सर्वर को भेजे जा रहे हैं।',
    err_activeTab: 'टैब कैप्चर के लिए टूलबार जेस्चर चाहिए। इस विंडो को बंद कर टूलबार आइकन से Dhristi खोलें, फिर फिर से कैप्चर करें।',
    err_navigated: 'टूलबार खुलने के बाद टैब बदल गया या नेविगेट हुआ। पॉपअप बंद करें, पृष्ठ पर टूलबार से Dhristi खोलें, फिर कैप्चर करें।',
    err_connection: 'पृष्ठ कनेक्शन खो गया। इंजेक्शन पुनः प्रयास…',
    err_restricted: 'यह पृष्ठ एक्सटेंशन कैप्चर रोकता है। स्थानीय फ़िक्स्चर या अनुमत पृष्ठ खोलें।',
    vision_recovering: 'स्थानीय दृष्टि सैंडबॉक्स पुनः आरंभ। फिर भी विफल हो तो chrome://extensions पर Reload करें।',
    mode_legend: 'पथ चयन',
    mode_privacy: 'तेज़ पथ — केवल गोपनीयता (कोई LLM नहीं)',
    mode_score: 'स्कोर पथ — protect के बाद स्थानीय जोखिम',
    mode_wireframe: 'वायरफ़्रेम पूर्वावलोकन (डिफ़ॉल्ट — सार्वजनिक / मल्टी-साइट के लिए सुरक्षित)',
    mode_hint: 'Score Fast protect के बाद चलता है (कोई LLM नहीं)। Reason के लिए Fast अनचेक करें। आधिकारिक SIH स्कोर null।',
    path_fast_name: 'Fast',
    path_fast_blurb: 'कैप्चर→डिटेक्ट→मास्क→समीक्षा · कोई LLM नहीं',
    path_score_name: 'Score',
    path_score_blurb: 'स्थानीय ह्यूरिस्टिक जोखिम · आधिकारिक null',
    path_reason_name: 'Reason',
    path_reason_blurb: 'Ollama/Qwen · <200 ms के बाहर',
    path_policy: 'Fast समय G11 पास नहीं है। G11 = प्लानर सहित full-flow p95 <200 ms, n≥100।',
    reason_tag: 'Reason पथ · स्थानीय Ollama/Qwen · <200 ms G11 बजट के बाहर',
    egress_copy: 'इस उपकरण से बाहर: केवल अर्थ-दृश्य फ़ील्ड। कच्चे पिक्सेल स्थानीय रहते हैं।',
    digilocker_note: 'DigiLocker-प्रेरित विश्वास पैटर्न मात्र — DigiLocker भागीदार, API, या कस्टडी नहीं।',
    privacy_done: 'Fast पथ पूर्ण (कोई LLM नहीं)। ऊपर का समय केवल स्थानीय protect है — G11 पास नहीं। Reason के लिए Fast अनचेक करें।',
    metrics_fast_prefix: 'Fast पथ (G11 full-flow नहीं)',
    metrics_reason_note: 'Reason पथ स्थानीय LLM उपयोग करता है; ऐतिहासिक रूप से सेकंड — <200 ms बजट के बाहर।',
    score_tag: 'Score पथ · स्थानीय ह्यूरिस्टिक जोखिम · आधिकारिक SIH स्कोर नहीं',
    score_empty: 'पहले Capture & protect करें। Score केवल स्थानीय दृश्य जोखिम रैंक करता है।',
    score_disclaimer: 'आयोजक भार accuracy+PII+redaction ≈65% — मूल्यांकन भार, हमारे मापे गए स्कोर नहीं। officialScore null। WebPII नहीं।',
    score_done: 'Score पथ: स्थानीय जोखिम बैंड दिखाया। G11 पास नहीं; आधिकारिक स्कोर null।',
    reason_cold_start: 'Reason प्लानर अनुपलब्ध (Ollama बंद/अगम्य)। Fast या Score पर रहें — LLM आवश्यक नहीं। Reason के लिए ollama serve + qwen2.5:7b-instruct।',
    reason_failed_keep: 'Reason विफल। सुरक्षित कैप्चर अभी भी है — Fast/Score चालू करें, या Ollama ठीक कर फिर Send करें।',
  },
};

function t(key) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}


function syncPathChips() {
  const privacyOnly = Boolean($('#mode-privacy')?.checked);
  const scoreOn = Boolean($('#mode-score')?.checked);
  let active = 'reason';
  if (privacyOnly && scoreOn) active = 'score';
  else if (privacyOnly) active = 'fast';
  else if (scoreOn) active = 'score';
  for (const li of document.querySelectorAll('#path-strip [data-path]')) {
    const name = li.getAttribute('data-path');
    const isActive = name === active;
    li.setAttribute('aria-current', String(isActive));
    li.setAttribute('data-state', isActive ? 'active' : 'available');
  }
  const panel = $('#score-panel');
  if (panel) panel.hidden = !(scoreOn || lastRisk);
}

function renderScorePanel(risk) {
  lastRisk = risk || null;
  const panel = $('#score-panel');
  const summary = $('#score-summary');
  const list = $('#score-reasons');
  if (!panel || !summary || !list) return;
  if (!risk) {
    summary.textContent = t('score_empty');
    list.hidden = true;
    list.innerHTML = '';
    panel.hidden = !Boolean($('#mode-score')?.checked);
    return;
  }
  panel.hidden = false;
  summary.textContent = `${formatLocalRiskSummary(risk, { lang })} · ${risk.reasons?.[0] || ''}`;
  list.innerHTML = '';
  for (const reason of (risk.reasons || [])) {
    const li = document.createElement('li');
    li.textContent = reason;
    list.appendChild(li);
  }
  const meta = document.createElement('li');
  meta.textContent = `controls ${risk.counts?.controls ?? 0} · regions ${risk.counts?.regions ?? 0} · points ${risk.points} · officialScore null`;
  list.appendChild(meta);
  list.hidden = false;
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
  syncPathChips();
}

function setStage(next) {
  const step = advanceStage(currentStage, next);
  currentStage = step.to;
  const order = ['inject', 'collect', 'capture', 'filter', 'sanitize', 'review'];
  const idx = order.indexOf(next);
  for (const li of document.querySelectorAll('#stage-strip [data-stage]')) {
    const name = li.getAttribute('data-stage');
    const pos = order.indexOf(name);
    li.setAttribute('data-active', String(name === next));
    li.setAttribute('data-done', String(pos >= 0 && idx >= 0 && pos < idx));
  }
  return step;
}

function resetStages() {
  currentStage = 'idle';
  for (const li of document.querySelectorAll('#stage-strip [data-stage]')) {
    li.setAttribute('data-active', 'false');
    li.setAttribute('data-done', 'false');
  }
}


function isPlannerColdStartError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return /failed to fetch|networkerror|load failed|econnrefused|connection refused|timeout|abort|unreachable|ollama|fetch failed|network request failed|reasoning failed|503|502|504|err_connection/i.test(msg)
    || err?.name === 'TimeoutError'
    || err?.name === 'AbortError'
    || err?.name === 'TypeError';
}

function preferFastOrScoreAfterReasonFailure() {
  const privacy = $('#mode-privacy');
  if (privacy && !privacy.checked) {
    privacy.checked = true;
  }
  $('#plan').disabled = true;
  syncPathChips();
}

const status = message => { $('#status').textContent = message; };
const clear = () => {
  prepared = null;
  plan = null;
  lastCaptureMs = null;
  lastLoopSummary = null;
  lastRisk = null;
  resourceStages = [];
  resetStages();
  renderScorePanel(null);
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

try {
  if (api?.runtime?.getURL) $('#origin').textContent = new URL(api.runtime.getURL('/')).origin;
  else $('#origin').textContent = '(open from extension toolbar for origin)';
} catch {
  $('#origin').textContent = '(extension origin unavailable)';
}
try {
  api.storage?.session?.get('pairingToken').then(v => {
    if (v?.pairingToken) $('#token').value = v.pairingToken;
  });
} catch { /* non-extension preview */ }

$('#lang-en').addEventListener('click', () => { lang = 'en'; applyLang(); });
$('#lang-hi').addEventListener('click', () => { lang = 'hi'; applyLang(); });
$('#mode-privacy')?.addEventListener('change', () => {
  if (!$('#mode-privacy').checked && $('#mode-score')?.checked) {
    // Reason path: Score diagnostic still allowed as local-only overlay
  }
  syncPathChips();
  if ($('#mode-privacy').checked) {
    $('#plan').disabled = true;
    status($('#mode-score')?.checked ? t('score_done') : t('status_ready'));
  } else if (prepared) {
    $('#plan').disabled = false;
    status(t('review'));
  }
});
$('#mode-score')?.addEventListener('change', () => {
  if ($('#mode-score').checked && !$('#mode-privacy').checked) {
    // Score implies no LLM; force Fast/privacy-only protect
    $('#mode-privacy').checked = true;
    $('#plan').disabled = true;
  }
  syncPathChips();
  if (prepared?.scene) {
    renderScorePanel(computeLocalRiskScore({ scene: prepared.scene }));
    if ($('#mode-score').checked) status(t('score_done'));
  } else {
    renderScorePanel(null);
  }
});
applyLang();
syncPathChips();
try {
  void recordGestureTab();
  ensureVisionPreload();
} catch { /* non-extension preview */ }

async function ensureInjected(id) {
  setStage('inject');
  await api.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
}

async function call(message, { reinject = true } = {}) {
  try {
    const response = await api.tabs.sendMessage(tabId, message);
    if (response?.error) throw new Error(response.error);
    if (!response) throw new Error('Page connection lost. Reopen the extension.');
    return response.data;
  } catch (e) {
    const classified = classifyCaptureError(e);
    if (reinject && classified.code === 'content_script_missing') {
      status(t('err_connection'));
      await ensureInjected(tabId);
      const response = await api.tabs.sendMessage(tabId, message);
      if (response?.error) throw new Error(response.error);
      if (!response) throw new Error('Page connection lost. Reopen the extension.');
      return response.data;
    }
    throw e;
  }
}

function formatCaptureFailure(err) {
  const c = classifyCaptureError(err);
  if (c.code === 'needs_activeTab') return t('err_activeTab');
  if (c.code === 'navigated_since_gesture') return t('err_navigated');
  if (c.code === 'restricted_page') return t('err_restricted');
  if (c.code === 'content_script_missing') return `${t('err_connection')} ${c.message}`;
  return `Capture blocked: ${c.message}`;
}


async function resolveTargetTab() {
  const [active] = await api.tabs.query({ active: true, currentWindow: true });
  const isPage = t => t?.id && t.url && /^https?:/i.test(t.url);
  if (isPage(active)) return active;
  const all = await api.tabs.query({ currentWindow: true });
  const hostMatch = all.find(t => isPage(t) && t.url.includes('127.0.0.1:9041'));
  if (hostMatch) return hostMatch;
  const anyHttp = all.find(isPage);
  if (anyHttp) return anyHttp;
  // Last resort: other windows (popup-as-tab can be alone in a window).
  const everywhere = await api.tabs.query({});
  return everywhere.find(t => isPage(t) && t.url.includes('127.0.0.1:9041'))
    || everywhere.find(isPage)
    || active
    || null;
}

$('#capture').addEventListener('click', async () => {
  if (busy) return;
  clear();
  setBusy(true);
  status(t('capturing'));
  let previewBitmap;
  const completed = [];
  try {
    const tab = await resolveTargetTab();
    if (!tab?.id) throw new Error('No captureable tab. Focus an http(s) page, then open Dhristi from the toolbar.');
    const gestureCheck = assertGestureTabFresh(gestureTab, tab);
    if (!gestureCheck.ok) {
      const err = new Error(gestureCheck.message);
      err.code = gestureCheck.code;
      throw err;
    }
    tabId = tab.id;
    try { await api.tabs.update(tabId, { active: true }); } catch { /* ignore */ }
    await ensureInjected(tabId);
    completed.push('inject');
    let { detector, cacheHit } = await ensureVisionPreload();
    void cacheHit;
    const captureStarted = performance.now();
    setStage('collect');
    const scene = await call({ kind: 'collect' });
    completed.push('collect');
    const previewPref = $('#preview-wireframe')?.checked ? 'wireframe' : 'selective';
    const previewStrategy = resolveCapturePreviewStrategy({
      preference: previewPref,
      viewport: scene.viewport,
      regionCount: scene.regions?.length || 0,
    });
    setStage('capture');
    const dataUrl = await api.tabs.captureVisibleTab(
      tab.windowId,
      captureVisibleTabOptions({ format: 'jpeg', quality: 70 }),
    );
    completed.push('capture');
    setStage('filter');
    let protectResult;
    try {
      protectResult = await detector.protectCapture({
        dataUrl,
        viewport: scene.viewport,
        regions: scene.regions || [],
        useSelectiveMosaic: previewStrategy.useSelectiveMosaic,
        blockSize: 14,
      });
    } catch (protectErr) {
      if (isSandboxDeathError(protectErr)) {
        ({ detector } = await softRecreateVisionSandbox());
        protectResult = await detector.protectCapture({
          dataUrl,
          viewport: scene.viewport,
          regions: scene.regions || [],
          useSelectiveMosaic: previewStrategy.useSelectiveMosaic,
          blockSize: 14,
        });
      } else {
        throw protectErr;
      }
    }
    const result = {
      detections: protectResult.detections || [],
      inferenceMs: protectResult.inferenceMs || 0,
    };
    previewBitmap = protectResult.previewBitmap || null;
    await call({ kind: 'fresh', revision: scene.revision });
    const bw = protectResult.bitmapWidth || scene.viewport.width;
    const bh = protectResult.bitmapHeight || scene.viewport.height;
    const ratioX = scene.viewport.width / bw;
    const ratioY = scene.viewport.height / bh;
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
    completed.push('filter');
    setStage('sanitize');
    prepared = requestSchema.parse({ task: $('#task').value, scene: makeScene(scene) });
    assertSanitizedPayload(prepared);
    completed.push('sanitize');

    const previewCtx = $('#preview').getContext('2d');
    let previewMeta = protectResult.previewMeta || { mode: 'wireframe', localOnly: true, elapsedMs: 0 };
    try {
      if (previewStrategy.useSelectiveMosaic && previewBitmap) {
        previewCtx.canvas.width = scene.viewport.width;
        previewCtx.canvas.height = scene.viewport.height;
        previewCtx.drawImage(previewBitmap, 0, 0);
        previewCtx.save();
        previewCtx.lineWidth = 2;
        previewCtx.strokeStyle = '#0b1f3a';
        previewCtx.fillStyle = 'rgba(11, 31, 58, 0.08)';
        previewCtx.font = '12px system-ui, sans-serif';
        previewCtx.textBaseline = 'middle';
        for (const c of prepared.scene.controls || []) {
          const r = c.rect;
          previewCtx.fillRect(r.x, r.y, r.width, r.height);
          previewCtx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.width - 1), Math.max(0, r.height - 1));
          previewCtx.fillStyle = '#0b1f3a';
          previewCtx.fillText(`${c.id} ${c.label}`, r.x + 6, r.y + r.height / 2);
          previewCtx.fillStyle = 'rgba(11, 31, 58, 0.08)';
        }
        previewCtx.restore();
      } else {
        paintScene(previewCtx, prepared.scene);
        previewMeta = { mode: 'wireframe', localOnly: true, elapsedMs: 0, host: previewMeta.host || 'popup' };
      }
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
    setStage('review');
    completed.push('review');
    lastLoopSummary = summarizeProtectLoop({
      stagesCompleted: completed,
      captureMs: lastCaptureMs,
      inferenceMs: result.inferenceMs,
      controlCount: prepared.scene.controls.length,
      regionCount: prepared.scene.regions.length,
      previewMode: previewMeta.mode,
      sanitized: true,
      toolbarGesture: 'assumed_from_action_popup',
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
    const risk = computeLocalRiskScore({ scene: prepared.scene });
    renderScorePanel(risk);
    const scoreOn = Boolean($('#mode-score')?.checked);
    $('#metrics').textContent =
      `${t('metrics_fast_prefix')} · ${result.detections.length} face(s) · ${result.inferenceMs.toFixed(1)} ms WASM · ` +
      `${prepared.scene.controls.length} controls · ${prepared.scene.regions.length} regions · ` +
      `preview ${previewMeta.mode}${preserved} · capture ${lastCaptureMs.toFixed(0)} ms${heapTxt}` +
      (scoreOn ? ` · ${formatLocalRiskSummary(risk, { lang })}` : '');
    const privacyOnly = Boolean($('#mode-privacy')?.checked);
    const opMode = resolveOperatingMode(
      scoreOn ? 'score' : (privacyOnly ? OPERATING_MODES.privacy_only : OPERATING_MODES.planner_assisted),
    );
    if (opMode.skipPlanner) {
      lastLoopSummary = privacyOnlyCompletion({
        ...lastLoopSummary,
        stagesCompleted: completed,
        captureMs: lastCaptureMs,
        inferenceMs: result.inferenceMs,
        controlCount: prepared.scene.controls.length,
        regionCount: prepared.scene.regions.length,
        previewMode: previewMeta.mode,
        sanitized: true,
        toolbarGesture: 'assumed_from_action_popup',
        scoreRisk: risk,
      });
      $('#plan').disabled = true;
      status(scoreOn ? t('score_done') : t('privacy_done'));
    } else {
      $('#plan').disabled = false;
      status(t('review'));
    }
    syncPathChips();
  } catch (e) {
    clear();
    status(formatCaptureFailure(e));
  } finally {
    try { previewBitmap?.close?.(); } catch { /* ignore */ }
    setBusy(false);
  }
});

$('#plan').addEventListener('click', async () => {
  if (busy || !prepared) return;
  if ($('#mode-privacy')?.checked) {
    status(t('privacy_done'));
    return;
  }
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
    status(`Received a validated action from ${result.data.provider.model}. ${t('metrics_reason_note')}`);
    syncPathChips();
  } catch (e) {
    // Cold-start / planner outage: keep protected capture; steer to Fast/Score (no LLM).
    plan = null;
    $('#execute').disabled = true;
    $('#proposal').textContent = t('proposal_empty');
    preferFastOrScoreAfterReasonFailure();
    if (prepared) {
      $('#plan').disabled = Boolean($('#mode-privacy')?.checked);
      const detail = e?.message || String(e);
      status(isPlannerColdStartError(e)
        ? `${t('reason_cold_start')} (${detail})`
        : `${t('reason_failed_keep')} (${detail})`);
      if (lastRisk) renderScorePanel(lastRisk);
      else if (prepared.scene) {
        const risk = computeLocalRiskScore({ scene: prepared.scene });
        lastRisk = risk;
        renderScorePanel(risk);
      }
    } else {
      clear();
      status(`${e.message} Capture again to retry.`);
    }
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

// Expose loop summary for harnesses opened as extension documents.
Object.defineProperty(globalThis, '__dhristiLoop', {
  get: () => lastLoopSummary,
  configurable: true,
});
Object.defineProperty(globalThis, '__dhristiScore', {
  get: () => lastRisk,
  configurable: true,
});

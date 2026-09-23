import { redactScreenshot, redactText } from './utils/redactor.js';
import { detectElements } from './utils/omniparser.js';
import * as wardenClient from './utils/warden.js';
import { createG11Trace } from './utils/g11-stage-clock.js';
import { OMNIPARSER_DEFAULT_URL, USE_OMNIPARSER_DEFAULT, MAX_STEPS, WARDEN_VALIDATE_MAX_ATTEMPTS } from './config.js';
import { loopbackHttpUrl } from './utils/loopback.js';

// DHRISTI v4 background loop, plus the session transcript that the side panel renders.
//
// Surface (Docs/specs/2026-09-13-sidepanel-chat-ui.md): the extension presents as a Chrome side
// panel, opened by clicking the toolbar icon. The panel is a chat surface: the user types a task
// in natural language and everything the agent does afterwards appears in the transcript as
// activity. Capture, strip, plan, validate and execute are NEVER user-facing controls; they are
// reported as work already performed. Only two things block on the user, because the
// architecture requires a human in the loop: an uncertain-PII decision and a validation
// question. There is no shared secret and no token exchange with the Warden in this build; a
// local token handshake was a v3 concept and is gone.
//
// The five stages are unchanged from Docs/specs/2026-09-13-dhristi-v4-warden.md: PERCEIVE
// (content-script DOM scan + visible-tab capture) -> STRIP (POST /strip) -> PLAN (POST /plan,
// sanitised material only) -> VALIDATE (POST /validate plus this file's own local tier gate) ->
// EXECUTE (local execution with vault rehydration in content.js).

// ---- Configuration ----------------------------------------------------------
const SETTLE_MS = 400;
const PING_MAX_ATTEMPTS = 10;
const PING_INTERVAL_MS = 300;
const HISTORY_LIMIT = 8;
const SCAN_SCRIPT_ID = 'dhristi-scan';
const SITE_ACCESS_ORIGINS = ['<all_urls>'];

const STANDARD_VALIDATION_OPTIONS = [
  { id: 'proceed', label: 'Proceed' },
  { id: 'skip', label: 'Skip this step' },
  { id: 'stop', label: 'Stop the run' },
];

// Verbatim from warden/README.md, "Run" section. Never invented, never paraphrased: the blocked
// card is only useful if the command it shows actually starts the server. If that README's run
// block changes, this constant changes with it.
async function ensureScanRegistration() {
  try {
    const granted = await chrome.permissions.contains({ origins: SITE_ACCESS_ORIGINS });
    if (!granted) return false;
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCAN_SCRIPT_ID] });
    if (existing.length === 0) {
      await chrome.scripting.registerContentScripts([{
        id: SCAN_SCRIPT_ID,
        matches: ['<all_urls>'],
        js: ['utils/visualizer.js', 'content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }]);
    }
    return true;
  } catch {
    return false;
  }
}

ensureScanRegistration();
chrome.runtime.onInstalled.addListener(() => { ensureScanRegistration(); });
chrome.runtime.onStartup.addListener(() => { ensureScanRegistration(); });
chrome.permissions.onAdded.addListener(() => { ensureScanRegistration(); });

const WARDEN_START_COMMAND = [
  'cd warden',
  'export HF_HOME="/Volumes/1TB SSD/LM/hub"',
  '~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756',
].join('\n');

// ============================================================================
// Token vault
// ============================================================================
// The model must never see raw PII. The Warden is the sole stripping authority for the wire:
// every /strip response carries a `tokens` map (TYPE#n -> real value) built from the browser's
// own task text and DOM, and that map is loaded into the vault below exactly as it arrives.
//
// The vault holder's toJSON throws so a stray JSON.stringify over a payload that nested this
// object by mistake (a fetch body, a storage.session write, a JSON-based console.log) fails
// loudly instead of leaking raw values. It is declared non-enumerable, so: (a) it never shows
// up as a fake token entry when the caller iterates the holder's own keys, and (b) the
// structured clone algorithm chrome.tabs.sendMessage uses to deliver SET_VAULT drops
// non-enumerable properties rather than throwing, so the real token entries still reach
// content.js normally.
function createVaultHolder() {
  const holder = {};
  Object.defineProperty(holder, 'toJSON', {
    value() { throw new Error('Vault must never be JSON-serialised.'); },
    enumerable: false,
    configurable: false
  });
  return holder;
}

// ---- Run state -------------------------------------------------------------
// Only non-sensitive loop state (stepNumber, status, elapsedMs, omniStatus) is persisted to
// chrome.storage.session. The task text, step log, and redaction log stay in memory only. The
// vault (raw PII values), the pending prompt, the transcript, and the session's uncertain-PII
// answers are deliberately NOT part of this object.
const state = {
  status: 'idle',      // idle | running | waiting | finished | stopped | error
  task: null,
  tabId: null,
  windowId: null,
  runId: 0,
  stepNumber: 0,
  steps: [],
  redactionLog: [],
  startedAt: 0,
  // 0 while a run is idle/running/waiting; set to Date.now() the moment the run reaches a
  // terminal status (finished, stopped, error), and reset to 0 on the next START_TASK.
  finishedAt: 0,
  omniStatus: 'disabled',
  stopRequested: false,
  // Last GET /health result, refreshed on every panel health check and at the start of every
  // run: { reachable, model, loaded, regexPatterns, groqConfigured, warden, error } or null
  // before the first check. Read-only telemetry; never used to decide execution (that is the
  // local tier gate below).
  wardenHealth: null,
};

// Token-to-value map for the current run, or null between runs. Never read by persistState(),
// never pushed into state.steps, never logged, never placed in a transcript entry.
let currentVault = null;

// Uncertain-PII decisions the user has already made this session, keyed by the exact token id
// the Warden minted (e.g. "PERSONNAME#1"), and sent back as `resolved` on every later /strip
// call so the same span is never asked about twice. In-memory only; never persisted.
let resolvedAnswers = {};

// Measurement-only clocks for the G11 harness (GET_G11_TRACE). Does not gate
// execution. Durations are exclusive spans around work this worker performed.
const g11Trace = createG11Trace();

// ============================================================================
// Session transcript
// ============================================================================
// The transcript is the panel's single source of truth and lives here, in the service worker.
// SESSION_UPDATE always carries the WHOLE `entries` array, so a panel that was closed and
// reopened re-renders from one source instead of replaying a stream of events it may have
// missed while it was closed.
//
// Memory only, deliberately, and this is a privacy rule rather than a simplification: an
// uncertain-PII entry's `preview` field is REAL personal data (the span GLiNER was not
// confident enough to strip), and a `user` entry holds the raw task text. Nothing in
// `transcript` may be written to chrome.storage.
//
// Entry kinds, per the frozen spec's table:
//   user            the task text the user typed
//   stage           one line per stage (PERCEIVE, STRIP, PLAN, VALIDATE, EXECUTE)
//   activity        a completed internal action
//   uncertain-pii   blocking card: one strip/keep choice per detected span
//   question        blocking card: proceed / skip / stop
//   blocked         a refused run, with the exact start command
//   error           a real failure, naming what failed
//   validated       a destructive-tier or reasoned action that was accepted
let transcript = [];
let entrySeq = 0;

function appendEntry(fields) {
  entrySeq += 1;
  const entry = { id: `e${entrySeq}`, ts: Date.now(), ...fields };
  transcript.push(entry);
  return entry;
}

// One stage line, carrying a REAL measured value where one exists and nothing where none does.
// Never pass a placeholder here: an invented number in the transcript is worse than a missing
// one, because a reviewer cannot tell which is which.
function noteStage(stage, value, stepNumber) {
  const entry = appendEntry({ kind: 'stage', stage, value: value == null ? null : String(value), step: stepNumber ?? null });
  emitSession();
  return entry;
}

// A completed internal action. `text` must describe work that actually finished.
function noteActivity(text, stepNumber) {
  const entry = appendEntry({ kind: 'activity', text, step: stepNumber ?? null });
  emitSession();
  return entry;
}

function noteError(text, stepNumber) {
  const entry = appendEntry({ kind: 'error', text, step: stepNumber ?? null });
  emitSession();
  return entry;
}

// The run reached a terminal status. `terminal` is what the panel uses to decide whether a run
// is still in flight (a `user` entry with no terminal marker after it means a live run), so
// every path that accepts a task must end with exactly one of these.
function noteRunEnd(text, status) {
  const entry = appendEntry({ kind: 'activity', text, terminal: true, status });
  emitSession();
  return entry;
}

// Every note* helper above emits on its own, so a stage line can never be appended to the
// transcript without the panel being told about it.
function emitSession() {
  chrome.runtime.sendMessage({ type: 'SESSION_UPDATE', entries: transcript }).catch(() => {});
}

// ---- Blocked (the Warden is not running) -----------------------------------
// At most one standing card per reason, so a failing health poll every few seconds cannot fill
// the transcript with red. `refused` marks a card that also explains a task the user actually
// submitted, which is the one case worth keeping as a muted record after recovery.
const BLOCKED_SERVER_ID = 'blocked-server';
const BLOCKED_LOADING_ID = 'blocked-loading';

function noteBlocked(id, { text, reason, command, refused }) {
  const found = transcript.find((e) => e.id === id);
  const nextRefused = Boolean(refused || found?.refused);
  // Unchanged means unchanged: the health poll runs every few seconds, and rewriting the entry
  // each time would re-render the card under the pointer every few seconds for no reason.
  if (found
    && found.text === text
    && found.reason === (reason || null)
    && found.command === (command || null)
    && found.refused === nextRefused
    && found.resolved === false) {
    return found;
  }
  let entry = found;
  if (!entry) {
    entry = { id, kind: 'blocked', ts: Date.now(), resolved: false, refused: false };
    transcript.push(entry);
  }
  entry.text = text;
  entry.reason = reason || null;
  entry.command = command || null;
  entry.refused = nextRefused;
  entry.resolved = false;
  entry.ts = Date.now();
  emitSession();
  return entry;
}

// The Warden answered again. A pure state card described a state that no longer holds, so it is
// removed rather than left sitting red; a card that explains a real refusal becomes a muted
// one-line record, because that refusal did happen.
function clearBlockedOnRecovery(health, stateName) {
  const survivors = [];
  let changed = false;
  for (const entry of transcript) {
    if (entry.kind !== 'blocked' || entry.resolved) {
      survivors.push(entry);
      continue;
    }
    // The loading refusal stands until the model is actually loaded: the reason it names has
    // not gone away yet, so retiring it here would tell the user the opposite of the truth.
    if (entry.id === BLOCKED_LOADING_ID && (stateName === 'loading' || stateName === 'unreachable')) {
      survivors.push(entry);
      continue;
    }
    changed = true;
    if (entry.refused) {
      entry.resolved = true;
      entry.command = null;
      entry.reason = null;
      entry.text = `That refusal is over: the Warden is answering again${health.model ? ` (${health.model})` : ''}.`;
      survivors.push(entry);
    }
  }
  if (changed) {
    transcript = survivors;
    emitSession();
  }
}

// ============================================================================
// Blocking prompts (uncertain-pii, validation-question)
// ============================================================================
// Exactly one prompt is ever pending at a time: the loop is strictly sequential and does not
// call /plan until an uncertain-PII prompt is answered, nor execute until a validation prompt is
// answered. Kept in service-worker memory, not chrome.storage.session, so GET_PROMPT can answer
// "the pending prompt" to a panel that was closed and reopened without a blocked run ever going
// invisible, and so an uncertain item's `preview` (real detected personal data) never touches
// durable storage.
let promptSeq = 0;
let pendingPrompt = null;
let pendingPromptSettle = null; // { resolve, reject } or null when nothing is pending

// The prompt is both a promise the run loop awaits AND a transcript entry the panel renders.
// Appending the entry here is what makes a blocking decision survive the panel closing: the
// entry is part of the transcript, and SESSION_UPDATE re-delivers the whole transcript.
function requestPrompt(partial, entryFields) {
  return new Promise((resolve, reject) => {
    promptSeq += 1;
    const prompt = { id: `p${promptSeq}`, ...partial };
    appendEntry({ ...entryFields, promptId: prompt.id, pending: true });
    pendingPrompt = prompt;
    pendingPromptSettle = { resolve, reject };
    emitSession();
    // The panel may be closed when this fires; that is fine. GET_PROMPT lets a panel opened
    // later pick up the same pending prompt.
    chrome.runtime.sendMessage({ type: 'PROMPT_REQUEST', prompt }).catch(() => {});
  });
}

// Records the user's answer on the transcript entry, so the reopened panel shows the decision
// that was taken rather than an open question that no longer blocks anything.
function recordAnswer(promptId, answers) {
  const entry = transcript.find((e) => e.promptId === promptId);
  if (!entry) return;
  entry.pending = false;
  if (entry.kind === 'uncertain-pii') {
    for (const item of entry.items || []) {
      const answer = answers[item.id];
      item.decision = answer === 'keep' ? 'keep' : 'strip';
    }
  } else if (entry.kind === 'question') {
    entry.choice = answers.choice || null;
    const option = (entry.options || []).find((o) => o.id === answers.choice);
    entry.choiceLabel = option ? option.label : null;
  }
}

function settlePrompt(id, answers) {
  if (!pendingPrompt || pendingPrompt.id !== id || !pendingPromptSettle) return;
  const { resolve } = pendingPromptSettle;
  pendingPrompt = null;
  pendingPromptSettle = null;
  recordAnswer(id, answers || {});
  emitSession();
  chrome.runtime.sendMessage({ type: 'PROMPT_RESOLVED', id }).catch(() => {});
  resolve(answers || {});
}

function abortPendingPrompt(reason) {
  if (!pendingPrompt || !pendingPromptSettle) return;
  const { reject } = pendingPromptSettle;
  const id = pendingPrompt.id;
  pendingPrompt = null;
  pendingPromptSettle = null;
  const entry = transcript.find((e) => e.promptId === id);
  if (entry) {
    entry.pending = false;
    entry.aborted = true;
  }
  emitSession();
  reject(new Error(reason));
}

// ============================================================================
// Warden health discovery: GET /health at the configured origin, no shared secret
// ============================================================================
// `loadingSince` is when THIS worker first observed the model as reachable-but-not-loaded. The
// elapsed wait shown to the user is measured from that observation, not from whenever the
// Warden process actually started, which this worker cannot know. If the loaded state is the
// first thing observed, elapsedMs is null and the panel shows no elapsed time rather than a
// guess.
let loadingSince = null;

// Consecutive failed /health probes. One failure can mean the Warden is busy rather than absent:
// its model runs on the same event loop, and a /strip in flight can push a /health answer past
// the 3s probe timeout. See refreshHealthAndSync() for what each count is allowed to claim.
let healthFailStreak = 0;

async function refreshWardenHealth() {
  try {
    const health = await wardenClient.health();
    state.wardenHealth = {
      reachable: true,
      ok: health.ok !== false,
      model: health.model || null,
      loaded: health.loaded === true,
      regexPatterns: health.regexPatterns ?? null,
      planner: health.planner || 'ollama',
      groqConfigured: health.groqConfigured === true,
      warden: health.warden || null,
      error: null,
    };
  } catch (error) {
    state.wardenHealth = {
      reachable: false,
      ok: false,
      model: null,
      loaded: false,
      regexPatterns: null,
      planner: 'ollama',
      groqConfigured: false,
      warden: null,
      error: error.message,
    };
  }
  return state.wardenHealth;
}

// unreachable, loading, ready. groq-missing applies only when the server reports
// planner "groq" and no key is configured. The default planner is local Ollama,
// so a missing Groq key does not block a run.
function healthState(health) {
  if (!health || health.reachable !== true) return 'unreachable';
  if (health.loaded !== true) return 'loading';
  if (health.planner === 'groq' && health.groqConfigured !== true) return 'groq-missing';
  return 'ready';
}

// HEALTH_UPDATE carries no secret and no raw value: a model identifier, three booleans, an
// elapsed wait and an error string.
function emitHealth(health) {
  const stateName = healthState(health);
  let elapsedMs = null;
  if (stateName === 'loading') {
    if (loadingSince === null) loadingSince = Date.now();
    elapsedMs = Date.now() - loadingSince;
  } else {
    loadingSince = null;
  }
  chrome.runtime.sendMessage({
    type: 'HEALTH_UPDATE',
    reachable: health.reachable === true,
    model: health.model || null,
    loaded: health.loaded === true,
    planner: health.planner || 'ollama',
    groqConfigured: health.groqConfigured === true,
    elapsedMs,
    error: health.error || null,
  }).catch(() => {});
}

// One health check plus the two transcript consequences: a standing blocked card while the
// server is absent, and recovery the moment it answers. Called on panel open, on the panel's
// polling interval, and at the start of every task submission.
async function refreshHealthAndSync({ refused = false } = {}) {
  const health = await refreshWardenHealth();
  const stateName = healthState(health);
  if (stateName === 'unreachable') {
    healthFailStreak += 1;
    // A task submission refuses on the FIRST failed probe: refusing costs the user one retry,
    // and sending unredacted costs everything. The standing card is stricter, because it makes a
    // lasting claim with a start command attached, so it waits for a second consecutive failure
    // rather than flashing red every time a strip briefly occupies the Warden's event loop.
    if (healthFailStreak >= 2 || refused) {
      const timedOut = /timed out/i.test(health.error || '');
      noteBlocked(BLOCKED_SERVER_ID, {
        // The two failures are reported as what was actually measured, not merged into one
        // claim: a probe that timed out is not the same observation as a refused connection.
        text: timedOut
          ? 'The Warden did not answer GET /health in time. Nothing is sent while it cannot confirm it is up, and no run can start.'
          : 'The Warden is not running. Nothing is sent to it while it is down, and no run can start.',
        reason: health.error,
        command: WARDEN_START_COMMAND,
        refused,
      });
    }
  } else {
    healthFailStreak = 0;
    clearBlockedOnRecovery(health, stateName);
  }
  emitHealth(health);
  return health;
}

// ============================================================================
// Outbound view
// ============================================================================
// The last request body that left this browser for planning. ONLY the /plan body is recorded:
// /strip's body holds the raw task text and the raw DOM by design (the Warden strips it), so it
// is not "already sanitised" and must never be handed to a diagnostics view. This body holds a
// tokenized task, a sanitized DOM, elements whose labels have been locally redacted, and the
// action history.
let lastOutbound = null;

function recordOutbound(path, body) {
  lastOutbound = { path, body };
  chrome.runtime.sendMessage({ type: 'OUTBOUND_UPDATE', body }).catch(() => {});
}

// ---- Message routing: the frozen contract, exactly --------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  switch (message.type) {
    case 'START_TASK':
      startTask(message).then(sendResponse);
      return true;
    case 'STOP_TASK':
      stopTask().then(sendResponse);
      return true;
    case 'GET_SESSION':
      sendResponse({ entries: transcript });
      return false;
    case 'GET_PROMPT':
      sendResponse(pendingPrompt);
      return false;
    case 'PROMPT_RESPONSE':
      settlePrompt(message.id, message.answers);
      sendResponse({ ok: true });
      return false;
    case 'GET_OUTBOUND':
      sendResponse(lastOutbound);
      return false;
    case 'GET_G11_TRACE':
      sendResponse(g11Trace.snapshot());
      return false;
    case 'SET_WARDEN_ORIGIN':
      setWardenOrigin(message.origin).then(sendResponse);
      return true;
    case 'RETRY_HEALTH':
      refreshHealthAndSync().then((health) => sendResponse({ ok: true, state: healthState(health) }));
      return true;
    default:
      return false;
  }
});

// The origin is a loopback URL, not a secret. Stored under the same chrome.storage.local key
// extension/utils/warden.js reads fresh on every request, so a saved origin takes effect on the
// next Warden call with no reload.
async function setWardenOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) {
    await chrome.storage.local.remove('wardenOrigin');
    const health = await refreshHealthAndSync();
    return { ok: true, origin: null, state: healthState(health) };
  }
  if (!loopbackHttpUrl(value)) {
    return {
      ok: false,
      error: 'Warden origin must be http or https on 127.0.0.1, localhost, or ::1.',
      origin: null,
    };
  }
  await chrome.storage.local.set({ wardenOrigin: value });
  const health = await refreshHealthAndSync();
  return { ok: true, origin: value, state: healthState(health) };
}

// ---- Task lifecycle --------------------------------------------------------
async function failStart(task, message) {
  const failedAt = Date.now();
  Object.assign(state, {
    status: 'error',
    task,
    stepNumber: 0,
    steps: [],
    redactionLog: [],
    startedAt: failedAt,
    finishedAt: failedAt, // terminal immediately: the run never started
    stopRequested: false,
  });
  await persistState();
  noteError(message);
  noteRunEnd('No run started.', 'error');
  return { ok: false, error: message, entries: transcript };
}

async function startTask(message) {
  if (state.status === 'running' || state.status === 'waiting') {
    return { ok: false, reason: 'A run is already in progress.', entries: transcript };
  }
  const task = String(message.task || '').trim();
  if (!task) {
    noteError('The task was empty, so nothing was sent.');
    return { ok: false, error: 'Empty task', entries: transcript };
  }

  // The user's own words, in the transcript, in memory only. This is the one entry kind that
  // holds raw user text, which is why the transcript never reaches chrome.storage.
  appendEntry({ kind: 'user', text: task });
  emitSession();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id ?? null;
  const windowId = tab?.windowId ?? null;
  if (!tabId) return failStart(task, 'No active tab to work on.');

  const siteAccess = await chrome.permissions.contains({ origins: SITE_ACCESS_ORIGINS });
  if (!siteAccess) {
    return failStart(task, 'Page scan needs site access. Allow it from the side panel when you send the task. Nothing was sent.');
  }
  await ensureScanRegistration();

  // v4 gate (frozen spec, "Degraded modes"): the Warden must be reachable and its model loaded
  // before a run may start at all. Falling back to the browser-only regex filter would silently
  // downgrade the privacy guarantee already shown to the user, so both cases below are a hard
  // refusal, never a degrade. A refused task is never queued: it is gone.
  const health = await refreshHealthAndSync({ refused: true });
  const stateName = healthState(health);
  if (stateName === 'unreachable') {
    noteRunEnd('The task was not sent.', 'refused');
    return { ok: false, refused: true, reason: 'The Warden is not running.', entries: transcript };
  }
  if (stateName === 'loading') {
    noteBlocked(BLOCKED_LOADING_ID, {
      text: 'The Warden is running but its PII model is still loading, so that task was refused rather than run through a partial filter.',
      reason: 'GET /health reports loaded: false.',
      command: null,
      refused: true,
    });
    noteRunEnd('The task was not sent.', 'refused');
    return { ok: false, refused: true, reason: 'The Warden model is not loaded yet.', entries: transcript };
  }

  // Non-secret local settings only: v4 has no browser-held cloud key. omniparserUrl/useOmniparser
  // point at the on-device element detector, unrelated to the Warden or to any cloud provider.
  let stored = {};
  try {
    stored = await chrome.storage.local.get(['omniparserUrl', 'useOmniparser']);
  } catch { /* storage unavailable; proceed with defaults */ }

  state.runId += 1;
  const runId = state.runId;

  const rawOmni = (stored.omniparserUrl && String(stored.omniparserUrl).trim()) || OMNIPARSER_DEFAULT_URL;
  const secrets = {
    omniparserUrl: loopbackHttpUrl(rawOmni) ? rawOmni : OMNIPARSER_DEFAULT_URL,
    useOmniparser: Boolean(stored.useOmniparser ?? USE_OMNIPARSER_DEFAULT),
  };

  Object.assign(state, {
    status: 'running',
    task,
    tabId,
    windowId,
    stepNumber: 0,
    steps: [],
    redactionLog: [],
    startedAt: Date.now(),
    finishedAt: 0, // reset: the previous run's frozen elapsed time must not leak into this one
    omniStatus: 'disabled',
    stopRequested: false,
  });
  await persistState();
  runLoop(runId, secrets); // fire-and-forget; progress is reported through the transcript
  return { ok: true, entries: transcript };
}

async function stopTask() {
  if (state.status === 'running' || state.status === 'waiting') {
    state.stopRequested = true;
    state.status = 'stopped';
    state.finishedAt = Date.now();
    abortPendingPrompt('Stopped'); // unblock a run parked on a prompt so Stop takes effect now
    await persistState();
  }
  return { ok: true, entries: transcript };
}

function computeElapsedMs() {
  if (!state.startedAt) return 0;
  if (state.finishedAt) return state.finishedAt - state.startedAt;
  return Date.now() - state.startedAt;
}

async function persistState() {
  // Non-sensitive loop state only. No task text, no transcript entry, no vault value, no prompt.
  await chrome.storage.session.set({
    stepNumber: state.stepNumber,
    status: state.status,
    elapsedMs: computeElapsedMs(),
    omniStatus: state.omniStatus,
  });
}

async function restoreState() {
  try {
    const saved = await chrome.storage.session.get(['stepNumber', 'status', 'omniStatus']);
    // The message that wakes the service worker can start a run before this read resolves;
    // never overwrite a run that has already begun.
    if (state.runId !== 0) return;
    state.stepNumber = saved.stepNumber || 0;
    state.omniStatus = saved.omniStatus || 'disabled';
    const s = saved.status;
    state.status = (s === 'running' || s === 'waiting') ? 'idle' : (s || 'idle');
  } catch { /* storage unavailable; keep defaults */ }
  refreshHealthAndSync().catch(() => {});
}

// ============================================================================
// Local operation-tier gating -- ROAST.md F17, THE RULE THAT MUST NOT BE RELAXED
// ============================================================================
// Ported independently from warden/tiers.py (itself adapted from the v3 reference,
// Prototype/shared/op-tier.mjs). Independent, on purpose, not imported: a spoofed or
// compromised loopback listener must not be able to authorise a destructive action by
// controlling both sides of a shared implementation. This copy is what actually gates
// EXECUTE; the Warden's tier and verdict are necessary but never sufficient.
const DESTRUCTIVE_INTENT_RE = /\b(delete|remove|deactivat(?:e|ing|ed)|terminat(?:e|ing|ed)|eras(?:e|ing|ed)|destroy(?:ing|ed)?)\b|\bclose (?:my|the) account\b|\bcancel (?:my|the) (?:account|subscription)\b/i;
const DESTRUCTIVE_LABEL_RE = /delete|remove|deactivat|terminat|eras|destroy|unsubscribe|close account|cancel (account|subscription)/i;
const SUBMIT_LABEL_RE = /submit|save|confirm|pay|checkout|place order|purchase|send/i;
const NAV_LABEL_RE = /^(go to|view|open|back|next|home|menu)\b|\blink\b/i;

function expressesDestructiveIntent(task) {
  return DESTRUCTIVE_INTENT_RE.test(String(task || ''));
}

function findElementBySelector(selector, elements) {
  return (elements || []).find((el) => el.selector === selector) || null;
}

function hasDestructiveControl(elements) {
  return (elements || []).some((el) => DESTRUCTIVE_LABEL_RE.test(`${el.label || ''} ${el.fieldType || ''}`));
}

// Classifies a plan into reversible / navigational / state-changing / destructive. Resolves a
// click target's tier from the scene's own label/fieldType text, never from anything the plan
// or the Warden claims about it. Throws if a click names a selector this scene does not
// contain: this doubles as an independent re-check of the "selector-in-scene" deterministic
// check /validate already runs server-side, so a hostile Warden double cannot get a
// nonexistent target past this extension by lying about that check having passed.
function opTierLocal(plan, elements) {
  const action = plan.action;
  if (action === 'scroll' || action === 'wait' || action === 'finish') return 'reversible';
  if (action === 'type') return 'state-changing';
  if (action === 'click') {
    const el = findElementBySelector(plan.target_selector, elements);
    if (!el) throw new Error(`local tier: click targets a selector not present in this scene: ${plan.target_selector}`);
    const haystack = `${el.label || ''} ${el.fieldType || ''}`;
    if (DESTRUCTIVE_LABEL_RE.test(haystack)) return 'destructive';
    if (SUBMIT_LABEL_RE.test(haystack)) return 'state-changing';
    if (NAV_LABEL_RE.test(haystack)) return 'navigational';
    return 'state-changing'; // conservative default: stop for confirmation, not proven safe
  }
  throw new Error(`local tier: unrecognized action ${action}`);
}

// Rewrites the plan to the reversible 'finish' action when the task expresses destructive
// intent and the scene holds no destructive control (ROAST.md F8's mitigation: a planner
// proposing a plausible-looking wrong click against a delete-account request when no delete
// control is actually on the page). Computed here, locally, because /validate's response never
// carries the Warden's own overridden plan back to the caller.
function applyIntentCoherenceLocal(task, plan, elements) {
  if (!expressesDestructiveIntent(task)) return { plan, overridden: false };
  if (hasDestructiveControl(elements)) return { plan, overridden: false };
  return {
    plan: {
      action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null,
      reasoning_token: 'local intent-coherence override: task implies a destructive action but the scene has no destructive control',
    },
    overridden: true,
  };
}

function tierPermitsUnattended(tier) {
  return tier === 'reversible' || tier === 'navigational';
}

// ---- Warden stages: STRIP, PLAN, VALIDATE -----------------------------------

// STRIP, with the uncertain-PII prompt loop. Blocks until every uncertain span in the
// response has a decision (a fresh one from the user, or an already-remembered one from
// `resolvedAnswers`), per the frozen spec: "the extension MUST prompt the user and MUST NOT
// proceed to /plan for that span until answered."
async function resolveUncertainLoop(runId, task, dom, elements, stepNumber) {
  for (;;) {
    if (aborted(runId)) throw new Error('Stopped');
    const resp = await wardenClient.strip({ task, dom, elements, resolved: resolvedAnswers });
    if (!resp.uncertain || resp.uncertain.length === 0) return resp;

    const items = resp.uncertain.map((u) => ({
      id: u.id, token: u.token, label: u.label, score: u.score, preview: u.preview, source: u.source,
    }));
    noteActivity(`${items.length} span${items.length === 1 ? '' : 's'} scored inside the uncertain band, so the run stopped to ask.`, stepNumber);
    const answers = await requestPrompt(
      { kind: 'uncertain-pii', items },
      {
        kind: 'uncertain-pii',
        step: stepNumber ?? null,
        text: 'The Warden was not confident enough to strip these spans automatically. Choose strip or keep for each one.',
        // `preview` is real personal data. It is rendered in this panel and lives in this
        // worker's memory; it is never written to storage and never crosses the wire.
        items,
      },
    );
    if (aborted(runId)) throw new Error('Stopped');
    for (const item of items) {
      resolvedAnswers[item.token] = answers[item.id] === 'keep' ? 'keep' : 'strip';
    }
    // Loop back and re-strip with the updated `resolved` map. The same raw input plus the
    // same decisions is deterministic, so every previously-uncertain span now resolves
    // silently; any new one raises its own prompt in turn rather than being skipped.
  }
}

// Refreshes the client vault with THIS step's token map and delivers it to the content
// script. Done every step, not once per run: /strip's token set is DOM-dependent and the DOM
// changes every step.
async function refreshVault(tokens) {
  currentVault = createVaultHolder();
  for (const [token, value] of Object.entries(tokens || {})) {
    currentVault[token] = value;
  }
  // Chrome's extension-message serializer inspects an object's own property descriptors
  // regardless of enumerability, so it throws "Could not serialize message" the instant it
  // reaches currentVault's non-enumerable toJSON trap. The trap is still correct and load-bearing
  // for guarding every OTHER accidental serialization; the spread below strips only the
  // non-enumerable toJSON off a throwaway plain copy for this one authorized transmission.
  await sendToTab('SET_VAULT', { tokens: { ...currentVault } });
}

async function planWithWarden(tokenizedTask, sanitizedDom, elements, baseHistory, rejectionReasons) {
  const history = rejectionReasons && rejectionReasons.length
    ? [...baseHistory, { stepNumber: null, action: 'VALIDATION_REJECTED', target: null, status: 'reject', reasons: rejectionReasons }]
    : baseHistory;
  const body = { tokenizedTask, sanitizedDom, elements, history };
  recordOutbound('/plan', body);
  const t0 = performance.now();
  try {
    return await wardenClient.plan(body);
  } finally {
    g11Trace.add('plan', performance.now() - t0);
  }
}

function timeOpTierLocal(plan, elements) {
  const t0 = performance.now();
  try {
    return { tier: opTierLocal(plan, elements), error: null };
  } catch (error) {
    return { tier: null, error };
  } finally {
    g11Trace.add('f17_local_tier', performance.now() - t0);
  }
}

function gatePathFor({ verdict, localTier, choice, tierError }) {
  if (tierError || localTier == null) return 'reject';
  if (verdict === 'reject' || choice === 'stop') return 'reject';
  if (verdict === 'ask') return 'ask';
  if (choice === 'skip') return 'ask';
  if (!tierPermitsUnattended(localTier) || choice === 'proceed') return 'local_confirm_required';
  return 'unattended_ok';
}

function recordF17({ localTier, wardenTier, verdict, choice, tierError }) {
  const tiersAgree = wardenTier != null && localTier != null && wardenTier === localTier;
  g11Trace.recordF17({
    opTierLocalComputed: tierError ? true : localTier != null,
    localTier: localTier ?? null,
    wardenTier: wardenTier ?? null,
    tiersAgree,
    trustedServerRequiresConfirmationAlone: false,
    unattendedExecuteAllowed: false,
    gatePath: gatePathFor({ verdict, localTier, choice, tierError }),
    bypassedLocalTier: false,
    tierError: Boolean(tierError),
  });
}

async function requestValidationQuestion(text, options, attempt, reasons, stepNumber) {
  const answers = await requestPrompt(
    { kind: 'validation-question', text, options: options && options.length ? options : STANDARD_VALIDATION_OPTIONS, attempt, reasons: reasons || [] },
    {
      kind: 'question',
      step: stepNumber ?? null,
      text,
      options: options && options.length ? options : STANDARD_VALIDATION_OPTIONS,
      attempt,
      reasons: reasons || [],
    },
  );
  return answers.choice === 'proceed' || answers.choice === 'skip' || answers.choice === 'stop' ? answers.choice : 'stop';
}

// PLAN + VALIDATE, with the bounded reject/re-plan loop (frozen spec's "Retry and escalation
// loop") and the F17 local gate. Returns { planResp, plan, tier, verdict, checks, choice }:
// `plan` is the plan actually approved to execute (may be the local intent-coherence override)
// and `choice` is null unless a prompt fired, in which case it is 'proceed' | 'skip' | 'stop'.
async function planAndValidate(runId, tokenizedTask, sanitizedDom, elements, baseHistory, stepNumber) {
  let reasons = [];
  for (let attempt = 1; attempt <= WARDEN_VALIDATE_MAX_ATTEMPTS; attempt += 1) {
    if (aborted(runId)) throw new Error('Stopped');
    const planResp = await planWithWarden(tokenizedTask, sanitizedDom, elements, baseHistory, reasons);
    if (aborted(runId)) throw new Error('Stopped');
    const rawPlan = planResp.plan;

    // The model that actually answered, reported by /plan itself. Never a hardcoded name.
    noteStage('PLAN', planResp.model ? `${planResp.model} proposed ${rawPlan.action}${rawPlan.target_selector ? ` on ${rawPlan.target_selector}` : ''}` : `proposed ${rawPlan.action}`, stepNumber);
    if (Array.isArray(planResp.switched) && planResp.switched.length) {
      // A fallback is surfaced rather than silent, per the frozen spec's "cloud model switch" row.
      noteActivity(`Model fallback: ${planResp.switched.join(', ')} failed before ${planResp.model || 'the next model'} answered.`, stepNumber);
    }

    // Local intent-coherence override, applied before this plan is shown to /validate's verdict
    // at all: see applyIntentCoherenceLocal()'s comment for why trusting the Warden's own
    // internal override is not enough.
    const coherence = applyIntentCoherenceLocal(tokenizedTask, rawPlan, elements);
    if (coherence.overridden) {
      noteActivity('The task implies a destructive action but the page holds no destructive control, so the plan was rewritten locally to finish.', stepNumber);
      const timed = timeOpTierLocal(coherence.plan, elements);
      if (timed.error) {
        noteStage('VALIDATE', 'rejected locally, the plan could not be tiered', stepNumber);
        noteError(timed.error.message, stepNumber);
        recordF17({ localTier: null, wardenTier: null, verdict: 'reject', choice: 'stop', tierError: timed.error });
        return {
          planResp, plan: coherence.plan, tier: null, verdict: 'reject',
          checks: [{ name: 'local-tier-computed', pass: false }], choice: 'stop', localError: timed.error.message,
        };
      }
      const tier = timed.tier;
      noteStage('VALIDATE', `accept, rewritten locally (tier: ${tier})`, stepNumber);
      recordF17({ localTier: tier, wardenTier: null, verdict: 'accept', choice: null, tierError: null });
      return {
        planResp, plan: coherence.plan, tier,
        verdict: 'accept', checks: [{ name: 'local-intent-coherence-override', pass: true }], choice: null,
      };
    }

    const timedTier = timeOpTierLocal(rawPlan, elements);
    if (timedTier.error) {
      // A plan naming a selector this scene does not contain, or an unrecognized action,
      // cannot be tiered at all; refuse rather than guess or execute it anyway.
      noteStage('VALIDATE', 'rejected locally, the plan could not be tiered', stepNumber);
      noteError(timedTier.error.message, stepNumber);
      recordF17({ localTier: null, wardenTier: null, verdict: 'reject', choice: 'stop', tierError: timedTier.error });
      return {
        planResp, plan: rawPlan, tier: null, verdict: 'reject',
        checks: [{ name: 'local-tier-computed', pass: false }], choice: 'stop', localError: timedTier.error.message,
      };
    }
    const localTier = timedTier.tier;

    if (aborted(runId)) throw new Error('Stopped');
    const validateT0 = performance.now();
    let vResp;
    try {
      vResp = await wardenClient.validate({ plan: rawPlan, elements, tokenizedTask, attempt });
    } finally {
      g11Trace.add('validate', performance.now() - validateT0);
    }
    const checks = [...(vResp.checks || []), { name: 'local-tier-agreement', pass: vResp.tier === localTier }];
    const passed = checks.filter((c) => c.pass === true).length;
    noteStage('VALIDATE', `${vResp.verdict}, ${passed} of ${checks.length} checks passed (tier: ${localTier})`, stepNumber);

    if (vResp.verdict === 'reject') {
      reasons = vResp.reasons || [];
      noteActivity(`Plan rejected on attempt ${attempt}: ${reasons.length ? reasons.join('; ') : 'no reason returned'}. Re-planning with the reasons attached.`, stepNumber);
      if (attempt === WARDEN_VALIDATE_MAX_ATTEMPTS) {
        const choice = await requestValidationQuestion(
          `The plan was rejected ${attempt} times in a row and the retry budget is exhausted.`,
          STANDARD_VALIDATION_OPTIONS, attempt, reasons, stepNumber,
        );
        recordF17({ localTier, wardenTier: vResp.tier, verdict: 'reject', choice, tierError: null });
        return { planResp, plan: rawPlan, tier: localTier, verdict: 'reject', checks, choice };
      }
      recordF17({ localTier, wardenTier: vResp.tier, verdict: 'reject', choice: null, tierError: null });
      continue; // informed re-plan: planWithWarden's next call carries `reasons`
    }

    if (vResp.verdict === 'ask') {
      const q = vResp.question || {};
      const choice = await requestValidationQuestion(q.text, q.options, attempt, [], stepNumber);
      recordF17({ localTier, wardenTier: vResp.tier, verdict: 'ask', choice, tierError: null });
      return { planResp, plan: rawPlan, tier: localTier, verdict: 'ask', checks, choice };
    }

    // verdict === 'accept'. Necessary, never sufficient (F17): this extension's own tier
    // check is the deciding gate, and a tier that is not proven reversible-or-navigational
    // stops for a LOCAL confirmation even though the Warden already said yes.
    if (!tierPermitsUnattended(localTier)) {
      const disagreement = vResp.tier === localTier
        ? []
        : [`Warden reported tier '${vResp.tier}'; this extension independently computed '${localTier}' from the same scene`];
      const choice = await requestValidationQuestion(
        `This action is tier '${localTier}' and requires local confirmation before it runs. The Warden accepted the plan; this confirmation is the extension's own gate, not the Warden's.`,
        STANDARD_VALIDATION_OPTIONS, attempt, disagreement, stepNumber,
      );
      recordF17({ localTier, wardenTier: vResp.tier, verdict: 'accept', choice, tierError: null });
      return { planResp, plan: rawPlan, tier: localTier, verdict: 'accept', checks, choice };
    }
    recordF17({ localTier, wardenTier: vResp.tier, verdict: 'accept', choice: null, tierError: null });
    return { planResp, plan: rawPlan, tier: localTier, verdict: 'accept', checks, choice: null };
  }
  // Unreachable: every branch inside the loop returns by attempt === WARDEN_VALIDATE_MAX_ATTEMPTS at the latest.
  throw new Error('warden: validation retry loop exited without a verdict');
}

// ---- Agent loop ------------------------------------------------------------
// A run id guards against two loops driving the same tab: startTask() bumps state.runId, and
// this loop bails (without executing a further action, and without touching shared state) the
// moment it is no longer the current run or a stop has been requested.
function aborted(runId) {
  return runId !== state.runId || state.stopRequested;
}

// Chrome's wording for a dropped message port varies by version/path (a navigating click
// tears down the receiving document mid-flight); match all of the observed phrasings rather
// than one exact string.
function isPortClosedError(error) {
  const msg = String(error?.message || '');
  return /Receiving end does not exist|message port closed|Could not establish connection/i.test(msg);
}

// Block on the content script answering PING before trusting PAGE_SCAN. A navigating click
// tears down the old document (and its content script) before the new document's content
// script has attached; this bounded backoff gives the new document time to load rather than
// treating the gap as a fatal error. Also honours a mid-wait Stop.
async function pingContentScript(runId) {
  let lastError = null;
  for (let attempt = 0; attempt < PING_MAX_ATTEMPTS; attempt += 1) {
    if (aborted(runId)) throw new Error('Stopped');
    try {
      const res = await chrome.tabs.sendMessage(state.tabId, { type: 'PING' });
      if (res?.ok) return;
    } catch (error) {
      lastError = error;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: state.tabId },
          files: ['utils/visualizer.js', 'content.js'],
        });
      } catch (injectError) {
        lastError = injectError;
      }
    }
    if (attempt < PING_MAX_ATTEMPTS - 1) await sleep(PING_INTERVAL_MS);
  }
  const waitedS = Math.round((PING_MAX_ATTEMPTS * PING_INTERVAL_MS) / 1000);
  throw new Error(`Content script unreachable after ${PING_MAX_ATTEMPTS} attempts (~${waitedS}s): ${lastError?.message || 'no response'}`);
}

async function runLoop(runId, secrets) {
  g11Trace.beginRun();
  try {
    while (state.stepNumber < MAX_STEPS) {
      if (aborted(runId)) {
        g11Trace.setTerminal('blocked');
        return;
      }
      state.stepNumber += 1;
      const stepNumber = state.stepNumber;
      state.status = 'running';
      await persistState();

      // 1. PERCEIVE: wait for the content script, then scan the page.
      g11Trace.markWallStart();
      const perceiveT0 = performance.now();
      let scan;
      try {
      await pingContentScript(runId);
      if (aborted(runId)) return;

      scan = await sendToTab('PAGE_SCAN');
      if (aborted(runId)) return;
      if (!scan || !Array.isArray(scan.elements)) throw new Error('Invalid scan result');
      noteStage('PERCEIVE', `${scan.elements.length} control${scan.elements.length === 1 ? '' : 's'} found on the page`, stepNumber);

      // PRIVACY: refuse to capture unless the task tab is the browser's visible active tab.
      // Capturing a different foreground tab would send a screenshot of a page the user
      // never asked the agent to see.
      const [activeTab] = await chrome.tabs.query({ active: true, windowId: state.windowId });
      if (!activeTab || activeTab.id !== state.tabId) {
        throw new Error('Task tab is not the visible tab; bring it to the front.');
      }

      const screenshot = await chrome.tabs.captureVisibleTab(state.windowId, { format: 'png' });
      if (aborted(runId)) return;

      // PRIVACY: redact PII from the screenshot before it goes anywhere, including the local
      // OmniParser detector below. Fails CLOSED: a masking failure returns dataUrl: null,
      // never the original unmasked capture.
      const redacted = await redactScreenshot(screenshot, scan.piiFields || [], scan.viewport);
      if (aborted(runId)) return;
      noteActivity(`Screen masked before anything else saw it: ${redacted.maskedCount} region${redacted.maskedCount === 1 ? '' : 's'}.`, stepNumber);

      let omni = { available: false, status: 'disabled', elements: [] };
      if (secrets.useOmniparser) {
        if (redacted.dataUrl) {
          omni = await detectElements({ dataUrl: redacted.dataUrl, enabled: true, endpoint: secrets.omniparserUrl, viewport: scan.viewport });
          if (aborted(runId)) return;
        } else {
          omni = { available: false, status: 'unavailable', elements: [] };
        }
      }
      state.omniStatus = omni.status;
      } finally {
        g11Trace.add('perceive', performance.now() - perceiveT0);
      }
      if (aborted(runId)) return;

      // 2. STRIP: the Warden is the sole stripping authority for the wire from here on. Raw
      //    `state.task` and raw `scan.dom`/`scan.elements` go to this ONE loopback call and
      //    no further; everything downstream in this iteration uses only what /strip returns.
      const stripT0 = performance.now();
      let stripResp;
      try {
        stripResp = await resolveUncertainLoop(runId, state.task, scan.dom, scan.elements, stepNumber);
      } finally {
        g11Trace.add('strip', performance.now() - stripT0);
      }
      if (aborted(runId)) return;

      const tokenCount = Object.keys(stripResp.tokens || {}).length;
      noteStage('STRIP', tokenCount === 0
        ? 'no personal data found, nothing was replaced'
        : `${tokenCount} value${tokenCount === 1 ? '' : 's'} replaced with tokens`, stepNumber);
      if (tokenCount > 0) {
        noteActivity(`Stripped ${tokenCount} value${tokenCount === 1 ? '' : 's'} before anything left this browser.`, stepNumber);
      }
      const regexHits = (stripResp.decisions || []).length;
      if (regexHits > 0) {
        noteActivity(`${regexHits} deterministic pattern match${regexHits === 1 ? '' : 'es'} in the strip layer.`, stepNumber);
      }
      if (stripResp.warden) {
        noteActivity(`Stripped by Warden ${stripResp.warden}${state.wardenHealth?.model ? ` running ${state.wardenHealth.model}` : ''}.`, stepNumber);
      }

      // Defense in depth beyond the frozen contract's minimum: /strip does not rewrite
      // `elements[].label` (only the tokenizedTask/sanitizedDom text is tokenized; see
      // warden/strip.py's out_elements), so a label like "Delete John Smith's account" would
      // otherwise reach /plan verbatim. Apply the same local text-redaction pass v3 used, on
      // the label field only, before these elements go anywhere else.
      const planElements = stripResp.elements.map((el) => ({ ...el, label: redactText(el.label).text }));

      await refreshVault(stripResp.tokens);
      if (aborted(runId)) return;

      const redactionRows = [
        ...(stripResp.decisions || []).map((d) => ({ pattern: d.pattern, match: d.layer, confidence: String(d.score) })),
        ...redacted.decisions.map((d) => ({
          pattern: d.pattern,
          match: `${Math.round(d.bbox[2])}x${Math.round(d.bbox[3])} px`,
          confidence: d.confidence
        }))
      ];
      for (const row of redactionRows) state.redactionLog.push({ stepNumber, ...row });

      // The step record the planner's own history is built from. Internal machinery, not the
      // transcript: it carries the element list, which must not be re-broadcast on every emit.
      const scanStep = {
        stepNumber,
        action: 'PAGE_SCAN',
        status: 'ok',
        elements: planElements,
        elementCount: planElements.length,
        omniElements: omni.elements,
        omniStatus: omni.status,
        domPreview: (stripResp.sanitizedDom || '').slice(0, 2000),
        piiMaskedCount: redacted.maskedCount,
        redactionRows,
        wardenModel: state.wardenHealth?.model || null,
      };
      state.steps.push(scanStep);

      // 3. PLAN + 4. VALIDATE, with the bounded reject/re-plan loop and the local F17 gate.
      const outcome = await planAndValidate(runId, stripResp.tokenizedTask, stripResp.sanitizedDom, planElements, buildHistory(state.steps), stepNumber);
      if (aborted(runId)) return;

      if (outcome.choice === 'proceed') {
        appendEntry({
          kind: 'validated',
          step: stepNumber,
          text: `Approved by you: ${outcome.plan.action}${outcome.plan.target_selector ? ` on ${outcome.plan.target_selector}` : ''} (tier: ${outcome.tier ?? 'unknown'}, verdict: ${outcome.verdict}).`,
        });
      }

      if (outcome.choice === 'stop') {
        state.status = 'stopped';
        state.finishedAt = Date.now();
        state.steps.push({
          stepNumber, action: outcome.plan?.action || 'ERROR', status: 'error',
          reasoningToken: outcome.localError || 'Run stopped by user at a validation prompt.',
          piiMaskedCount: redacted.maskedCount, latencyMs: outcome.planResp?.latencyMs ?? 0,
          elements: planElements, elementCount: planElements.length,
          omniElements: omni.elements, omniStatus: omni.status,
          domPreview: (stripResp.sanitizedDom || '').slice(0, 2000), valueToken: null,
          result: { error: outcome.localError || 'stopped' },
          wardenModel: outcome.planResp?.model || null, switched: outcome.planResp?.switched || [],
          tier: outcome.tier, verdict: outcome.verdict, checks: outcome.checks,
        });
        noteActivity('You stopped the run at a validation question.', stepNumber);
        g11Trace.setTerminal(outcome.verdict === 'reject' ? 'reject' : outcome.verdict === 'ask' ? 'ask' : 'blocked');
        return;
      }

      if (outcome.choice === 'skip') {
        state.steps.push({
          stepNumber, action: outcome.plan.action, target: outcome.plan.target_selector, status: 'ok',
          reasoningToken: 'Step skipped by user at a validation prompt.',
          piiMaskedCount: redacted.maskedCount, latencyMs: outcome.planResp?.latencyMs ?? 0,
          elements: planElements, elementCount: planElements.length,
          omniElements: omni.elements, omniStatus: omni.status,
          domPreview: (stripResp.sanitizedDom || '').slice(0, 2000), valueToken: toValueToken(outcome.plan.value),
          result: { skipped: true },
          wardenModel: outcome.planResp?.model || null, switched: outcome.planResp?.switched || [],
          tier: outcome.tier, verdict: outcome.verdict, checks: outcome.checks,
        });
        noteActivity(`You skipped this step: ${outcome.plan.action}${outcome.plan.target_selector ? ` on ${outcome.plan.target_selector}` : ''}.`, stepNumber);
        state.status = 'waiting';
        await sleep(SETTLE_MS);
        continue;
      }

      const action = outcome.plan;

      // 5. EXECUTE: dispatch the approved action to the content script. A click that triggers
      //    a navigation tears the message port down mid-flight; that is an expected outcome,
      //    not a failure, so it is recorded as an ok step with navigated: true and the next
      //    iteration's pingContentScript() waits for the new document.
      if (outcome.choice == null && outcome.verdict === 'accept' && tierPermitsUnattended(outcome.tier)) {
        g11Trace.patchLatestF17({ unattendedExecuteAllowed: true, gatePath: 'unattended_ok' });
      }
      let result;
      let navigated = false;
      const executeT0 = performance.now();
      try {
        result = await sendToTab('EXECUTE_ACTION', { action });
      } catch (error) {
        if (action.action === 'click' && isPortClosedError(error)) {
          navigated = true;
          result = { ok: true, navigated: true };
        } else {
          throw error;
        }
      } finally {
        g11Trace.add('execute', performance.now() - executeT0);
      }
      if (aborted(runId)) return;

      const failed = !navigated && Boolean(result?.error);
      noteStage('EXECUTE', `${action.action}${action.target_selector ? ` on ${action.target_selector}` : ''}, ${navigated ? 'the page navigated' : failed ? 'failed' : 'done'}`, stepNumber);
      if (failed) noteError(`The page refused that step: ${result.error}`, stepNumber);

      state.steps.push({
        stepNumber, action: action.action, target: action.target_selector,
        status: failed ? 'error' : 'ok', navigated,
        reasoningToken: action.reasoning_token,
        piiMaskedCount: redacted.maskedCount, latencyMs: outcome.planResp?.latencyMs ?? 0,
        elements: planElements, elementCount: planElements.length,
        omniElements: omni.elements, omniStatus: omni.status,
        domPreview: (stripResp.sanitizedDom || '').slice(0, 2000),
        valueToken: toValueToken(action.value),
        result,
        wardenModel: outcome.planResp?.model || null,
        switched: outcome.planResp?.switched || [],
        tier: outcome.tier, verdict: outcome.verdict, checks: outcome.checks,
      });

      if (action.action === 'finish') {
        state.status = 'finished';
        state.finishedAt = Date.now();
        g11Trace.setTerminal(failed ? 'error' : 'ok');
        return;
      }

      // Settle delay before the next scan.
      state.status = 'waiting';
      await sleep(SETTLE_MS);
    }

    // Loop exited because the step limit was reached without a stop or a finish action. This
    // is not a successful completion.
    if (!aborted(runId)) {
      state.status = 'stopped';
      state.finishedAt = Date.now();
      g11Trace.setTerminal('blocked');
      noteError(`The step limit (${MAX_STEPS}) was reached without the agent finishing.`, state.stepNumber);
    }
  } catch (error) {
    if (runId === state.runId) {
      g11Trace.setTerminal(state.status === 'stopped' && error.message === 'Stopped' ? 'blocked' : 'error');
      // A Stop pressed while a prompt was pending unblocks this loop by rejecting that
      // prompt's promise with exactly this message (see abortPendingPrompt()); that is a
      // clean stop, already recorded by stopTask(), not a new failure to report over it.
      const stoppedCleanly = state.status === 'stopped' && error.message === 'Stopped';
      if (!stoppedCleanly) {
        state.status = 'error';
        state.finishedAt = Date.now();
        noteError(error.message, state.stepNumber);
      }
    }
  } finally {
    // The finally block, and every state write in it, applies only to the loop's own run: a
    // superseded run must never clobber a newer one's state.
    if (runId === state.runId) {
      const traced = g11Trace.snapshot();
      if (!traced.terminal) {
        if (state.status === 'finished') g11Trace.setTerminal('ok');
        else if (state.status === 'stopped' || state.stopRequested) g11Trace.setTerminal('blocked');
        else g11Trace.setTerminal('error');
      }
      g11Trace.finish();
      await persistState();
      // Exactly one terminal marker per accepted task, which is what the panel reads to decide
      // whether a run is still in flight.
      noteRunEnd(`Run ${state.status} after ${state.stepNumber} step${state.stepNumber === 1 ? '' : 's'}.`, state.status);
      chrome.tabs.sendMessage(state.tabId, { type: 'END_TASK' }).catch(() => {});
      currentVault = null; // hygiene: the vault must not outlive its run.
    }
  }
}

// ---- Helpers ---------------------------------------------------------------
async function sendToTab(type, payload = {}) {
  try {
    return await chrome.tabs.sendMessage(state.tabId, { type, ...payload });
  } catch (error) {
    throw new Error(`Content script unreachable (${type}): ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A compact, value-free action history so the planner can see it already tried something and
// failed, without re-sending reasoning text or values. PAGE_SCAN entries are omitted; they are
// not an "action" in this sense.
function buildHistory(steps) {
  return steps
    .filter((step) => step.action !== 'PAGE_SCAN')
    .slice(-HISTORY_LIMIT)
    .map((step) => ({ stepNumber: step.stepNumber, action: step.action, target: step.target ?? null, status: step.status }));
}

// PRIVACY: never echo a literal typed value into the transcript. Numeric amounts (scroll/wait)
// are safe. A vault token (EMAIL#1, PERSONNAME#1, ...) is also safe to show verbatim: it names
// a PII type and position, not content.
function toValueToken(value) {
  if (value == null || value === '') return null;
  if (/^[A-Z]+#\d+$/.test(value)) return value;
  if (/^\d+$/.test(value)) return value;
  return '*'.repeat(Math.min(value.length, 18));
}

// ---- Startup ---------------------------------------------------------------
// A toolbar click opens the side panel rather than a popup. There is no default_popup in the
// manifest, deliberately: a popup and a side panel are mutually exclusive on one action, and the
// popup is what this build replaced. Also set on install, because an extension that was already
// installed when this behavior changed keeps its old setting until something re-applies it.
function openPanelOnActionClick() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(openPanelOnActionClick);
chrome.runtime.onStartup.addListener(openPanelOnActionClick);
openPanelOnActionClick();

restoreState().catch(() => {});

import { redactScreenshot, redactText } from './utils/redactor.js';
import { detectElements } from './utils/omniparser.js';
import * as wardenClient from './utils/warden.js';
import { createG11Trace } from './utils/g11-stage-clock.js';
import { OMNIPARSER_DEFAULT_URL, USE_OMNIPARSER_DEFAULT, MAX_STEPS, WARDEN_VALIDATE_MAX_ATTEMPTS } from './config.js';
import { loopbackHttpUrl } from './utils/loopback.js';
import { expressesDestructiveIntent, findSceneElement, hasDestructiveControl, tierForPlan, tierPermitsUnattended } from './utils/op-tier.js';
import { decideLocalGate, layaRelease, questionForTier, runPlanChecks } from './utils/plan-check.js';
import {
  createPipelineTrace, inboundFromPlan, isVaultToken, jsonByteLength, pngSize, replacedFromStrip, toValueToken, tokenizeWithVault,
} from './utils/pipeline-trace.js';

// DHRISTI v5 background loop, plus the session transcript and the pipeline trace that the side
// panel renders.
//
// Surface (Docs/specs/2026-09-13-sidepanel-chat-ui.md): the extension presents as a Chrome side
// panel, opened by clicking the toolbar icon. The panel is a chat surface: the user types a task
// in natural language and everything the agent does afterwards appears in the transcript as
// activity. Capture, strip, plan, check and execute are NEVER user-facing controls; they are
// reported as work already performed. Only two things block on the user, because the
// architecture requires a human in the loop: an uncertain-PII decision and a validation
// question. There is no shared secret and no token exchange with the Warden in this build.
//
// Roles (Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md): the Warden does two
// jobs, local redaction (POST /strip) and a guarded relay to the planner (POST /plan, a cloud
// model by default, local Ollama in offline mode). Every decision about ACTING is made here, in
// the browser: plan schema checks, target-in-scene, the F17 tier gate, intent coherence and the
// human confirmation. The run loop no longer calls POST /validate.
//
// Stages: PERCEIVE (content-script DOM scan + visible-tab capture, masked locally) -> REDACT
// (POST /strip) -> PLAN (POST /plan, sanitised material only) -> CHECK (utils/plan-check.js +
// utils/op-tier.js, local only) -> ACT (local execution with vault rehydration in content.js).

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

// Verbatim from warden/README.md, "Run" section. Never invented, never paraphrased: the blocked
// card is only useful if the command it shows actually starts the server. If that README's run
// block changes, this constant changes with it.
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
  // run: { reachable, model, loaded, regexPatterns, planner, destination, plannerModel,
  // groqConfigured, warden, error } or null before the first check. Never used to decide
  // execution (that is the local gate below); it only decides whether a run may start at all.
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
//   stage           one line per stage (PERCEIVE, STRIP, PLAN, CHECK, EXECUTE; CHECK was VALIDATE before v5)
//   activity        a completed internal action
//   uncertain-pii   blocking card: one strip/keep choice per detected span
//   question        blocking card: proceed / skip / stop
//   blocked         a refused run, with the exact start command
//   error           a real failure, naming what failed
//   validated       an action you approved at a validation question
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
const BLOCKED_GROQ_ID = 'blocked-groq';

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
    // Same rule for the missing cloud key: it stands until /health stops reporting it.
    if (entry.id === BLOCKED_GROQ_ID && (stateName === 'groq-missing' || stateName === 'unreachable')) {
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
      // As reported, or null. Not defaulted: an older Warden that omits the field defaulted to
      // Ollama and a v5 one defaults to Groq, so any default here would be a guess.
      planner: health.planner === 'groq' || health.planner === 'ollama' ? health.planner : null,
      destination: destinationFor(health),
      plannerModel: typeof health.plannerModel === 'string' ? health.plannerModel : null,
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
      planner: null,
      destination: null,
      plannerModel: null,
      groqConfigured: false,
      warden: null,
      error: error.message,
    };
  }
  return state.wardenHealth;
}

// `destination` as /health reports it, else derived from `planner` by the spec's fixed mapping
// (groq -> cloud, ollama -> local), else null.
function destinationFor(health) {
  if (health && (health.destination === 'cloud' || health.destination === 'local')) return health.destination;
  if (health?.planner === 'groq') return 'cloud';
  if (health?.planner === 'ollama') return 'local';
  return null;
}

// unreachable, loading, groq-missing, ready. v5's default planner is Groq (cloud), so a Warden
// reporting planner "groq" with no key configured cannot plan at all: groq-missing blocks a run,
// with a card naming both fixes. An offline Warden (planner "ollama") needs no key.
function healthState(health) {
  if (!health || health.reachable !== true) return 'unreachable';
  if (health.loaded !== true) return 'loading';
  if (health.planner === 'groq' && health.groqConfigured !== true) return 'groq-missing';
  return 'ready';
}

// HEALTH_UPDATE carries no secret and no raw value: model identifiers, the planner's destination,
// three booleans, an elapsed wait and an error string.
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
    planner: health.planner || null,
    destination: health.destination || null,
    plannerModel: health.plannerModel || null,
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

// ============================================================================
// Pipeline trace (TRACE_UPDATE / GET_TRACE)
// ============================================================================
// The whole trace for the current step, rebuilt at the start of every step, sent whole on every
// stage transition. Memory only, like the transcript: it holds the masked screenshot and the
// exact /plan body, and neither belongs in chrome.storage. No vault value is ever put into it;
// see utils/pipeline-trace.js for how each field is built to guarantee that.
const pipeline = createPipelineTrace();

function emitTrace() {
  chrome.runtime.sendMessage({ type: 'TRACE_UPDATE', trace: pipeline.snapshot() }).catch(() => {});
}

function traceStage(name, status, detail) {
  pipeline.stage(name, status, detail);
  emitTrace();
}

function plannerFromHealth(health) {
  return {
    destination: health?.destination ?? null,
    provider: health?.planner ?? null,
    model: health?.plannerModel ?? null,
  };
}

// ============================================================================
// REVEAL_TOKEN
// ============================================================================
// The one path by which a vault value leaves this worker for a UI: an explicit click in the
// extension's own side panel. Answered from the CURRENT run's vault only (null between runs), only
// to a sender that is this extension, not a tab, at exactly the side panel page. Never logged,
// never stored, never added to the transcript or the trace.
function isSidePanelSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id || sender.tab) return false;
  const url = typeof sender.url === 'string' ? sender.url.split(/[?#]/)[0] : '';
  return url === chrome.runtime.getURL('sidepanel.html');
}

function revealToken(message, sender) {
  const token = message && typeof message.token === 'string' ? message.token : null;
  if (!isSidePanelSender(sender)) return { error: 'REVEAL_TOKEN is answered only to the DHRISTI side panel.' };
  if (!isVaultToken(token)) return { error: 'Not a token.' };
  if (!currentVault || !Object.prototype.hasOwnProperty.call(currentVault, token)) {
    return { error: 'That token is not in the current run.' };
  }
  return { token, value: currentVault[token] };
}

// An async handler that throws must still answer: a rejected promise with no reply leaves the
// panel's sendMessage waiting on a port that closes with a generic error instead of the reason.
function respondWith(promise, sendResponse, fallback) {
  promise.then(sendResponse, (error) => sendResponse({ ok: false, error: error?.message || String(error), ...fallback }));
  return true;
}

// ---- Message routing: the frozen contract, exactly --------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  switch (message.type) {
    case 'START_TASK':
      return respondWith(startTask(message), sendResponse, { entries: transcript });
    case 'STOP_TASK':
      return respondWith(stopTask(), sendResponse, { entries: transcript });
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
    case 'GET_TRACE':
      sendResponse(pipeline.snapshot());
      return false;
    case 'REVEAL_TOKEN':
      sendResponse(revealToken(message, sender));
      return false;
    case 'SET_WARDEN_ORIGIN':
      return respondWith(setWardenOrigin(message.origin), sendResponse, { origin: null });
    case 'RETRY_HEALTH':
      return respondWith(refreshHealthAndSync().then((health) => ({ ok: true, state: healthState(health) })), sendResponse);
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

// True from the moment a START_TASK is accepted for checking until it either starts a run or is
// refused. Without it, two sends in quick succession (a double-click on Send) both pass the status
// check below, because status only becomes 'running' after several awaits, and both start a run.
let startInFlight = false;

async function startTask(message) {
  if (startInFlight || state.status === 'running' || state.status === 'waiting') {
    return { ok: false, reason: 'A run is already in progress.', entries: transcript };
  }
  startInFlight = true;
  try {
    return await startTaskChecked(message);
  } finally {
    startInFlight = false;
  }
}

async function startTaskChecked(message) {
  const task = String(message.task || '').trim();
  if (!task) {
    noteError('The task was empty, so nothing was sent.');
    return { ok: false, error: 'Empty task', entries: transcript };
  }

  // The user's own words, in the transcript, in memory only. This is the one entry kind that
  // holds raw user text, which is why the transcript never reaches chrome.storage.
  appendEntry({ kind: 'user', text: task });
  emitSession();

  // Every path after the user entry must end with exactly one terminal marker, including an
  // unexpected throw from a chrome.* call, or the panel shows a run in flight forever.
  try {
    return await startAcceptedTask(task);
  } catch (error) {
    return failStart(task, `The run could not start: ${error?.message || error}`);
  }
}

async function startAcceptedTask(task) {
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
  if (stateName === 'groq-missing') {
    // No start command on this card: the constant starts the server, it does not supply a key,
    // and a command this file cannot verify would be worse than none.
    noteBlocked(BLOCKED_GROQ_ID, {
      text: 'The Warden is set to plan with Groq (cloud) but has no GROQ_API_KEY, so it cannot plan and that task was refused. Set GROQ_API_KEY in warden/.env and restart the Warden, or start it with WARDEN_PLANNER=ollama for offline local planning.',
      reason: 'GET /health reports planner: groq, groqConfigured: false.',
      command: null,
      refused: true,
    });
    noteRunEnd('The task was not sent.', 'refused');
    return { ok: false, refused: true, reason: 'The Warden has no Groq key.', entries: transcript };
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
  // The previous run's trace (its masked screenshot, its /plan body) ends with that run.
  pipeline.clear();
  emitTrace();
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
  // Best effort: this is telemetry for a restarted worker, and a storage failure must not abort a
  // run or skip the run loop's terminal marker (it is awaited inside runLoop's finally).
  try {
    await chrome.storage.session.set({
      stepNumber: state.stepNumber,
      status: state.status,
      elapsedMs: computeElapsedMs(),
      omniStatus: state.omniStatus,
    });
  } catch { /* storage unavailable; the in-memory state is still authoritative */ }
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
// The rules live in utils/op-tier.js (tiers) and utils/plan-check.js (plan checks and the gate),
// ported independently from warden/tiers.py and warden/validate.py, on purpose, not shared. Every
// local tier is computed from the extension's OWN page scan: content.js tiers each element from
// the live DOM and returns it as `tier` alongside an opaque per-scan `handle`. Nothing below reads
// an element list or tier the Warden returned to decide whether to act. In v5 there is no Warden
// verdict at all: the run loop does not call POST /validate, so the local gate is the whole gate.

// Rewrites the plan to the reversible 'finish' action when the task expresses destructive
// intent and the scene holds no destructive control (ROAST.md F8's mitigation: a planner
// proposing a plausible-looking wrong click against a delete-account request when no delete
// control is actually on the page). Reads the raw local task and the local scan only.
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

// ---- Warden stages: STRIP, PLAN ---------------------------------------------
//
// Trace discipline: the pipeline trace is touched only synchronously after an aborted() check,
// never after a bare await, so a run that was stopped and superseded while it waited can never
// write into the next run's trace.

// STRIP, with the uncertain-PII prompt loop. Blocks until every uncertain span in the
// response has a decision (a fresh one from the user, or an already-remembered one from
// `resolvedAnswers`), per the frozen spec: "the extension MUST prompt the user and MUST NOT
// proceed to /plan for that span until answered." Returns the final response and how many spans
// the user was asked about in this step.
async function resolveUncertainLoop(runId, task, dom, elements, stepNumber) {
  let asked = 0;
  for (;;) {
    if (aborted(runId)) throw new Error('Stopped');
    const resp = await wardenClient.strip({ task, dom, elements, resolved: resolvedAnswers });
    if (!resp || typeof resp !== 'object') throw new Error('warden: /strip returned no object');
    if (!Array.isArray(resp.uncertain) || resp.uncertain.length === 0) return { resp, asked };

    const items = resp.uncertain.map((u) => ({
      id: u.id, token: u.token, label: u.label, score: u.score, preview: u.preview, source: u.source,
    }));
    asked += items.length;
    noteActivity(`${items.length} span${items.length === 1 ? '' : 's'} scored inside the uncertain band, so the run stopped to ask.`, stepNumber);
    const answers = await requestPrompt(
      { kind: 'uncertain-pii', items },
      {
        kind: 'uncertain-pii',
        step: stepNumber ?? null,
        text: 'The Warden was not confident enough to strip these spans automatically. Choose strip or keep for each one.',
        // `preview` is real personal data. It is rendered in this panel and lives in this
        // worker's memory; it is never written to storage, never put in the trace, and never
        // crosses the wire.
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

// Element labels for /plan. The Warden tokenizes sanitizedDom (and, from v5, the labels too), but
// a label that repeats a value the Warden tokenized elsewhere must not carry it past /strip, so
// every vault value is replaced with its token first; then the local regex pass runs ONCE per
// distinct label (labels repeat, e.g. a column of "Edit" links). Computed once per step and reused
// by every re-plan attempt.
function planElementsFrom(elements, tokens) {
  const cache = new Map();
  return (elements || []).map((el) => {
    const raw = typeof el.label === 'string' ? el.label : '';
    let label = cache.get(raw);
    if (label === undefined) {
      label = redactText(tokenizeWithVault(raw, tokens)).text;
      cache.set(raw, label);
    }
    return { ...el, label };
  });
}

// A /plan failure, described without echoing anything the Warden might have quoted back. The
// v5 egress guard refuses with 422 and names the pattern and field, never the value.
function planErrorDetail(error) {
  const guard = error?.body && typeof error.body === 'object' ? error.body.egressGuard : null;
  if (error?.status === 422 && guard && typeof guard === 'object') {
    return `the Warden's egress guard refused the request (${String(guard.pattern || 'pattern')} in ${String(guard.field || 'a field')}); nothing left this machine`;
  }
  return error?.message || String(error);
}

async function planWithWarden(tokenizedTask, sanitizedDom, elements, baseHistory, rejectionReasons, attempt) {
  const history = rejectionReasons && rejectionReasons.length
    ? [...baseHistory, { stepNumber: null, action: 'VALIDATION_REJECTED', target: null, status: 'reject', reasons: rejectionReasons }]
    : baseHistory;
  const body = { tokenizedTask, sanitizedDom, elements, history };
  recordOutbound('/plan', body);
  // The exact object utils/warden.js serializes, and the byte length of that serialization.
  pipeline.set('outbound', { path: '/plan', bytes: jsonByteLength(body), body });
  pipeline.set('inbound', null);
  traceStage('plan', 'active', attempt > 1 ? `re-planning with ${rejectionReasons.length} reason${rejectionReasons.length === 1 ? '' : 's'} attached, attempt ${attempt}` : null);
  const t0 = performance.now();
  try {
    return await wardenClient.plan(body);
  } catch (error) {
    // Rethrown with a detail that is safe for the transcript and the trace.
    const wrapped = new Error(planErrorDetail(error));
    wrapped.cause = error;
    throw wrapped;
  } finally {
    g11Trace.add('plan', performance.now() - t0);
  }
}

function timeOpTierLocal(plan, localScene) {
  const t0 = performance.now();
  try {
    return { tier: tierForPlan(plan, localScene), error: null };
  } catch (error) {
    return { tier: null, error };
  } finally {
    g11Trace.add('f17_local_tier', performance.now() - t0);
  }
}

const GATE_TRACE_PATH = { reject: 'reject', ask: 'ask', confirm: 'local_confirm_required', unattended: 'unattended_ok' };

function gatePathFor({ gatePath, choice, tierError }) {
  if (tierError || gatePath === 'reject' || choice === 'stop') return 'reject';
  if (gatePath === 'ask' || choice === 'skip') return 'ask';
  if (choice === 'proceed') return 'local_confirm_required';
  return GATE_TRACE_PATH[gatePath] || 'reject';
}

// v5: there is no Warden tier any more, so wardenTier is recorded as null and tiersAgree as false,
// rather than copying the local tier into the Warden's slot and claiming an agreement that no
// second party made.
function recordF17({ localTier, gatePath, choice, tierError }) {
  g11Trace.recordF17({
    opTierLocalComputed: tierError ? true : localTier != null,
    localTier: localTier ?? null,
    wardenTier: null,
    tiersAgree: false,
    trustedServerRequiresConfirmationAlone: false,
    unattendedExecuteAllowed: false,
    gatePath: gatePathFor({ gatePath, choice, tierError }),
    bypassedLocalTier: false,
    tierError: Boolean(tierError),
  });
}

// A plan that failed the local checks is never run, so the exhausted-retry question does not offer
// "Proceed": skipping re-scans and re-plans on the next step; stopping ends the run.
const REJECTED_PLAN_OPTIONS = [
  { id: 'skip', label: 'Skip this step' },
  { id: 'stop', label: 'Stop the run' },
];

async function requestValidationQuestion(text, options, attempt, reasons, stepNumber) {
  const offered = options && options.length ? options : STANDARD_VALIDATION_OPTIONS;
  const answers = await requestPrompt(
    { kind: 'validation-question', text, options: offered, attempt, reasons: reasons || [] },
    {
      kind: 'question',
      step: stepNumber ?? null,
      text,
      options: offered,
      attempt,
      reasons: reasons || [],
    },
  );
  // Only an option that was actually offered counts; anything else is a stop.
  return offered.some((o) => o.id === answers.choice) && ['proceed', 'skip', 'stop'].includes(answers.choice) ? answers.choice : 'stop';
}

function describeTarget(plan) {
  return `${plan?.action ?? 'unknown action'}${plan?.target_selector ? ` on ${plan.target_selector}` : ''}`;
}

// PLAN + CHECK, with the bounded reject/re-plan loop and the F17 local gate. Returns
// { planResp, plan, tier, verdict, checks, choice }: `plan` is the plan actually approved to
// execute (may be the local intent-coherence override), `tier` the local tier, `verdict` the local
// gate's 'accept' | 'ask' | 'reject', and `choice` null unless a prompt fired ('proceed' | 'skip' |
// 'stop').
//
// `wireElements` are what the planner sees. `localScene` is the extension's own scan with handles
// and locally computed tiers; it alone decides the checks and the tier.
async function planAndCheck(runId, task, tokenizedTask, sanitizedDom, wireElements, localScene, baseHistory, stepNumber) {
  let reasons = [];
  for (let attempt = 1; attempt <= WARDEN_VALIDATE_MAX_ATTEMPTS; attempt += 1) {
    if (aborted(runId)) throw new Error('Stopped');
    const planResp = await planWithWarden(tokenizedTask, sanitizedDom, wireElements, baseHistory, reasons, attempt);
    if (aborted(runId)) throw new Error('Stopped');
    const rawPlan = planResp && typeof planResp.plan === 'object' && planResp.plan && !Array.isArray(planResp.plan) ? planResp.plan : null;
    if (!rawPlan) throw new Error('warden: /plan returned no plan object');

    // Planner identity as /plan itself reports it. Never a hardcoded name.
    const planner = pipeline.current()?.planner || {};
    pipeline.set('planner', {
      destination: planResp.destination === 'cloud' || planResp.destination === 'local' ? planResp.destination : planner.destination ?? null,
      provider: planner.provider ?? null,
      model: typeof planResp.model === 'string' ? planResp.model : planner.model ?? null,
    });
    pipeline.set('inbound', inboundFromPlan(rawPlan, planResp));
    const where = planResp.destination === 'cloud' ? ' (cloud)' : planResp.destination === 'local' ? ' (local)' : '';
    traceStage('plan', 'done', `${planResp.model || 'the planner'}${where} proposed ${describeTarget(rawPlan)}`);
    noteStage('PLAN', planResp.model ? `${planResp.model}${where} proposed ${describeTarget(rawPlan)}` : `proposed ${describeTarget(rawPlan)}`, stepNumber);
    if (Array.isArray(planResp.switched) && planResp.switched.length) {
      // A fallback is surfaced rather than silent, per the frozen spec's "cloud model switch" row.
      noteActivity(`Model fallback: ${planResp.switched.join(', ')} failed before ${planResp.model || 'the next model'} answered.`, stepNumber);
    }

    // CHECK, entirely local. The intent-coherence rewrite runs first, so the checks and the tier
    // see the plan that would actually run.
    traceStage('check', 'active', null);
    const coherence = applyIntentCoherenceLocal(task, rawPlan, localScene);
    const plan = coherence.plan;
    if (coherence.overridden) {
      noteActivity('The task implies a destructive action but the page holds no destructive control, so the plan was rewritten locally to finish.', stepNumber);
    }
    const timed = timeOpTierLocal(plan, localScene);
    const checkT0 = performance.now();
    const result = runPlanChecks(plan, localScene, {
      tier: timed.tier,
      tierError: timed.error ? timed.error.message : null,
      intentOverridden: coherence.overridden,
      destructiveIntent: expressesDestructiveIntent(task),
      hasDestructiveControl: hasDestructiveControl(localScene),
    });
    let gate = decideLocalGate({ checksPassed: result.ok, localTier: result.tier });
    // Laya release (plan-check.js layaRelease): only a local 'confirm' can become unattended, and
    // the tier stays what the scan computed, so the execute-time live re-tier still applies.
    let release = null;
    if (gate.path === 'confirm') {
      let sceneElement = null;
      try { sceneElement = findSceneElement(plan.target_selector, localScene); } catch { sceneElement = null; }
      release = layaRelease({ plan, sceneElement, review: planResp.review, destructiveIntent: expressesDestructiveIntent(task) });
      if (release.released) gate = { path: 'unattended', finalTier: gate.finalTier, reasons: [], released: true };
    }
    // Recorded under the harness's existing 'validate' key: this is the work /validate used to do.
    g11Trace.add('validate', performance.now() - checkT0);

    const passed = result.checks.filter((c) => c.pass).length;
    const summary = `${passed} of ${result.checks.length} checks passed`;
    pipeline.set('check', { checks: result.checks, tier: result.tier, gate: gate.path, choice: null, release });

    if (gate.path === 'reject') {
      reasons = result.reasons.length ? result.reasons : gate.reasons;
      traceStage('check', 'error', `rejected on attempt ${attempt}: ${reasons.join('; ')}`);
      noteStage('CHECK', `rejected locally, ${summary}`, stepNumber);
      if (timed.error) noteError(timed.error.message, stepNumber);
      noteActivity(`Plan rejected on attempt ${attempt}: ${reasons.join('; ')}.${attempt < WARDEN_VALIDATE_MAX_ATTEMPTS ? ' Re-planning with the reasons attached.' : ''}`, stepNumber);
      if (attempt === WARDEN_VALIDATE_MAX_ATTEMPTS) {
        const choice = await requestValidationQuestion(
          `The plan failed the local checks ${attempt} times in a row and the retry budget is exhausted. A plan that failed its checks is never run.`,
          REJECTED_PLAN_OPTIONS, attempt, reasons, stepNumber,
        );
        if (aborted(runId)) throw new Error('Stopped');
        pipeline.patch('check', { choice });
        emitTrace();
        recordF17({ localTier: result.tier, gatePath: 'reject', choice, tierError: timed.error });
        return { planResp, plan, tier: result.tier, verdict: 'reject', checks: result.checks, choice };
      }
      recordF17({ localTier: result.tier, gatePath: 'reject', choice: null, tierError: timed.error });
      continue; // informed re-plan: planWithWarden's next call carries `reasons`
    }

    traceStage('check', 'done', `${gate.path === 'unattended' ? 'accepted' : gate.path === 'ask' ? 'accepted, asks a human' : 'accepted, needs your confirmation'} (tier: ${gate.finalTier}), ${summary}`);
    noteStage('CHECK', `${coherence.overridden ? 'accept, rewritten locally' : 'accept'}, ${summary} (tier: ${gate.finalTier})`, stepNumber);

    if (gate.path === 'ask' || gate.path === 'confirm') {
      // Destructive always asks a human (the rule the Warden's ALWAYS_ASK_TIERS carried); any
      // other tier that is not unattended-safe stops for the extension's own confirmation.
      const text = gate.path === 'ask'
        ? questionForTier(gate.finalTier, plan)
        : `This action is tier '${gate.finalTier}' and requires local confirmation before it runs.`;
      const choice = await requestValidationQuestion(text, STANDARD_VALIDATION_OPTIONS, attempt, gate.reasons, stepNumber);
      if (aborted(runId)) throw new Error('Stopped');
      pipeline.patch('check', { choice });
      emitTrace();
      recordF17({ localTier: result.tier, gatePath: gate.path, choice, tierError: null });
      return { planResp, plan, tier: gate.finalTier, verdict: gate.path === 'ask' ? 'ask' : 'accept', checks: result.checks, choice };
    }
    if (gate.released) noteActivity(`${release.reason}. The step runs without a prompt.`, stepNumber);
    recordF17({ localTier: result.tier, gatePath: 'unattended', choice: null, tierError: null });
    return { planResp, plan, tier: gate.finalTier, verdict: 'accept', checks: result.checks, choice: null, released: gate.released === true };
  }
  // Unreachable: every branch inside the loop returns by attempt === WARDEN_VALIDATE_MAX_ATTEMPTS at the latest.
  throw new Error('check: retry loop exited without a decision');
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

// The trace's act node for an outcome that never reached the page (skip or stop).
function traceActNotRun(plan, outcome, detail) {
  pipeline.set('act', { action: plan?.action ?? null, target: plan?.target_selector ?? null, outcome, error: null });
  traceStage('act', 'skipped', detail);
}

async function runLoop(runId, secrets) {
  g11Trace.beginRun();
  let lastError = null;
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
      if (aborted(runId)) return;

      pipeline.begin(runId, stepNumber);
      pipeline.set('planner', plannerFromHealth(state.wardenHealth));

      // 1. PERCEIVE: wait for the content script, then scan the page.
      g11Trace.markWallStart();
      traceStage('perceive', 'active', null);
      const perceiveT0 = performance.now();
      // Declared outside the timed block: STRIP, PLAN and the step records below read them.
      let scan;
      let localScene;
      let wireElements;
      let redacted;
      let omni = { available: false, status: 'disabled', elements: [] };
      try {
      await pingContentScript(runId);
      if (aborted(runId)) return;

      // PAGE_SCAN also removes the previous step's redaction overlay (content.js), so neither the
      // scan nor the capture below sees it.
      scan = await sendToTab('PAGE_SCAN');
      if (aborted(runId)) return;
      if (!scan || !Array.isArray(scan.elements)) throw new Error('Invalid scan result');
      // The extension's own scene: handles and locally computed tiers. Stays in this worker.
      localScene = scan.elements;
      // What the Warden sees: the same elements without the handle or the local tier.
      wireElements = scan.elements.map(({ handle, tier, tierBasis, ...rest }) => rest);
      pipeline.set('scene', { controls: scan.elements.length });
      noteStage('PERCEIVE', `${scan.elements.length} control${scan.elements.length === 1 ? '' : 's'} found on the page`, stepNumber);

      // PRIVACY: refuse to capture unless the task tab is the browser's visible active tab.
      // Capturing a different foreground tab would send a screenshot of a page the user
      // never asked the agent to see.
      const [activeTab] = await chrome.tabs.query({ active: true, windowId: state.windowId });
      if (!activeTab || activeTab.id !== state.tabId) {
        throw new Error('Task tab is not the visible tab; bring it to the front.');
      }

      // One capture per step. It feeds the local mask below, the optional local detector, and
      // the panel's view of what the agent saw; it never goes to the Warden.
      const screenshot = await chrome.tabs.captureVisibleTab(state.windowId, { format: 'png' });
      if (aborted(runId)) return;

      // PRIVACY: redact PII from the screenshot before it goes anywhere, including the local
      // OmniParser detector below and the panel. Fails CLOSED: a masking failure returns
      // dataUrl: null, never the original unmasked capture.
      redacted = await redactScreenshot(screenshot, scan.piiFields || [], scan.viewport);
      if (aborted(runId)) return;
      pipeline.set('screenshot', { dataUrl: redacted.dataUrl || null, ...pngSize(redacted.dataUrl) });
      pipeline.patch('redaction', { screenMasked: redacted.maskedCount });
      noteActivity(redacted.dataUrl
        ? `Screen masked before anything else saw it: ${redacted.maskedCount} region${redacted.maskedCount === 1 ? '' : 's'}.`
        : 'The screen capture could not be masked, so it was discarded.', stepNumber);

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
      traceStage('perceive', 'done', `${scan.elements.length} control${scan.elements.length === 1 ? '' : 's'}, ${redacted.maskedCount} screen region${redacted.maskedCount === 1 ? '' : 's'} masked`);

      // 2. STRIP: the Warden is the sole stripping authority for the wire from here on. Raw
      //    `state.task`, raw `scan.dom` and the wire elements go to this ONE loopback call and
      //    no further; everything sent downstream uses only what /strip returns. The F17 gate
      //    and EXECUTE use `localScene`, which never leaves this worker.
      traceStage('redact', 'active', null);
      const stripT0 = performance.now();
      let stripResp;
      let uncertainAsked = 0;
      try {
        ({ resp: stripResp, asked: uncertainAsked } = await resolveUncertainLoop(runId, state.task, scan.dom, wireElements, stepNumber));
      } finally {
        g11Trace.add('strip', performance.now() - stripT0);
      }
      if (aborted(runId)) return;
      if (!Array.isArray(stripResp.elements)) throw new Error('warden: /strip returned no elements');

      const tokenCount = Object.keys(stripResp.tokens || {}).length;
      // Tokens and types only; replacedFromStrip() never reads a value.
      pipeline.patch('redaction', { replaced: replacedFromStrip(stripResp, resolvedAnswers), uncertainAsked });
      traceStage('redact', 'done', `${tokenCount} value${tokenCount === 1 ? '' : 's'} replaced${uncertainAsked ? `, ${uncertainAsked} asked` : ''}${uncertainAsked ? ' (time includes your answers)' : ''}`);
      noteStage('STRIP', tokenCount === 0
        ? 'no personal data found, nothing was replaced'
        : `${tokenCount} value${tokenCount === 1 ? '' : 's'} replaced with tokens`, stepNumber);
      if (tokenCount > 0) {
        noteActivity(`Stripped ${tokenCount} value${tokenCount === 1 ? '' : 's'} before anything left this browser.`, stepNumber);
      }
      const regexHits = (stripResp.decisions || []).filter((d) => d && d.layer === 'regex').length;
      if (regexHits > 0) {
        noteActivity(`${regexHits} deterministic pattern match${regexHits === 1 ? '' : 'es'} in the strip layer.`, stepNumber);
      }
      if (stripResp.warden) {
        noteActivity(`Stripped by Warden ${stripResp.warden}${state.wardenHealth?.model ? ` running ${state.wardenHealth.model}` : ''}.`, stepNumber);
      }

      // Defense in depth beyond the wire contract: see planElementsFrom().
      const planElements = planElementsFrom(stripResp.elements, stripResp.tokens);

      await refreshVault(stripResp.tokens);
      if (aborted(runId)) return;
      if (tokenCount > 0) {
        // Local page overlay: labelled boxes over the visible text that was replaced. Best effort
        // and not awaited: a page that cannot draw it must not stop the run. The map goes only to
        // this tab's content script, which already holds it (SET_VAULT above).
        chrome.tabs.sendMessage(state.tabId, { type: 'HIGHLIGHT_REDACTIONS', tokens: { ...currentVault } }).catch(() => {});
      }

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

      // 3. PLAN + 4. CHECK, with the bounded reject/re-plan loop and the local F17 gate.
      const outcome = await planAndCheck(runId, state.task, stripResp.tokenizedTask, stripResp.sanitizedDom, planElements, localScene, buildHistory(state.steps), stepNumber);
      if (aborted(runId)) return;

      if (outcome.choice === 'proceed') {
        appendEntry({
          kind: 'validated',
          step: stepNumber,
          text: `Approved by you: ${describeTarget(outcome.plan)} (tier: ${outcome.tier ?? 'unknown'}, verdict: ${outcome.verdict}).`,
        });
      }

      if (outcome.choice === 'stop') {
        state.status = 'stopped';
        state.finishedAt = Date.now();
        state.steps.push({
          stepNumber, action: outcome.plan?.action || 'ERROR', status: 'error',
          reasoningToken: 'Run stopped by user at a validation prompt.',
          piiMaskedCount: redacted.maskedCount, latencyMs: outcome.planResp?.latencyMs ?? 0,
          elements: planElements, elementCount: planElements.length,
          omniElements: omni.elements, omniStatus: omni.status,
          domPreview: (stripResp.sanitizedDom || '').slice(0, 2000), valueToken: null,
          result: { error: 'stopped' },
          wardenModel: outcome.planResp?.model || null, switched: outcome.planResp?.switched || [],
          tier: outcome.tier, verdict: outcome.verdict, checks: outcome.checks,
        });
        traceActNotRun(outcome.plan, 'stopped', 'you stopped the run at a validation question');
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
        traceActNotRun(outcome.plan, 'skipped', 'you skipped this step');
        noteActivity(`You skipped this step: ${describeTarget(outcome.plan)}.`, stepNumber);
        state.status = 'waiting';
        await sleep(SETTLE_MS);
        continue;
      }

      const action = outcome.plan;

      // 5. EXECUTE: dispatch the approved action to the content script. A click that triggers
      //    a navigation tears the message port down mid-flight; that is an expected outcome,
      //    not a failure, so it is recorded as an ok step with navigated: true and the next
      //    iteration's pingContentScript() waits for the new document.
      if (outcome.choice == null && outcome.verdict === 'accept' && (tierPermitsUnattended(outcome.tier) || outcome.released === true)) {
        g11Trace.patchLatestF17({ unattendedExecuteAllowed: true, gatePath: 'unattended_ok' });
      }
      pipeline.set('act', { action: action.action, target: action.target_selector ?? null, outcome: null, error: null });
      traceStage('act', 'active', describeTarget(action));
      let result;
      let navigated = false;
      let executeChoice = null;
      const executeT0 = performance.now();
      try {
        const executed = await executeWithLiveTierCheck(runId, action, outcome, localScene, stepNumber);
        result = executed.result;
        navigated = executed.navigated;
        executeChoice = executed.choice;
      } finally {
        g11Trace.add('execute', performance.now() - executeT0);
      }
      if (aborted(runId)) return;
      if (executeChoice === 'stop') {
        state.status = 'stopped';
        state.finishedAt = Date.now();
        pipeline.patch('act', { outcome: 'stopped', error: null });
        traceStage('act', 'skipped', 'you stopped the run when the page changed the target after planning');
        noteActivity('You stopped the run when the page changed the target after planning.', stepNumber);
        g11Trace.setTerminal('blocked');
        return;
      }

      const skippedLive = executeChoice === 'skip';
      const failed = !navigated && !skippedLive && Boolean(result?.error);
      const actOutcome = navigated ? 'navigated' : skippedLive ? 'skipped' : failed ? 'failed' : 'done';
      pipeline.patch('act', { outcome: actOutcome, error: failed ? String(result.error) : null });
      traceStage('act', failed ? 'error' : skippedLive ? 'skipped' : 'done', actOutcome);
      noteStage('EXECUTE', `${describeTarget(action)}, ${navigated ? 'the page navigated' : skippedLive ? 'skipped by you' : failed ? 'failed' : 'done'}`, stepNumber);
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

      if (action.action === 'finish' && !skippedLive) {
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
    lastError = error;
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
      // A stage still active when the run ended is closed with what actually happened to it.
      const active = pipeline.current()?.runId === runId ? pipeline.activeStage() : null;
      if (active) {
        if (state.status === 'error') traceStage(active, 'error', lastError?.message || 'the run ended with an error');
        else traceStage(active, 'skipped', 'the run was stopped');
      }
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
      // CLEAR_HIGHLIGHTS removes the redaction overlay (per the v5 contract); END_TASK clears the
      // content script's vault and handles, and the overlay too in case the first was dropped.
      chrome.tabs.sendMessage(state.tabId, { type: 'CLEAR_HIGHLIGHTS' }).catch(() => {});
      chrome.tabs.sendMessage(state.tabId, { type: 'END_TASK' }).catch(() => {});
      currentVault = null; // hygiene: the vault must not outlive its run.
    }
  }
}

// EXECUTE for one approved plan. The content script receives the target's per-scan handle and
// the tier that was approved, never a selector to look up. If the live element now tiers stricter
// than that (the page changed after the scan), nothing is clicked and the user is asked; on
// "proceed" the action is re-sent with the stricter tier, and the content script re-checks again.
async function executeWithLiveTierCheck(runId, action, outcome, localScene, stepNumber) {
  const needsTarget = action.action === 'click' || action.action === 'type';
  const contentAction = { action: action.action, value: action.value ?? null, plannedTier: outcome.tier };
  // A Laya-released click must still read as 'unproven' on the live element (content.js).
  if (outcome.released === true) contentAction.requireUnprovenBasis = true;
  if (needsTarget) contentAction.handle = tierTargetHandle(action, localScene);
  for (let round = 0; round < 2; round += 1) {
    let result;
    try {
      result = await sendToTab('EXECUTE_ACTION', { action: contentAction });
    } catch (error) {
      if (action.action === 'click' && isPortClosedError(error)) {
        return { result: { ok: true, navigated: true }, navigated: true, choice: null };
      }
      throw error;
    }
    if (!result || result.tierEscalated !== true) return { result, navigated: false, choice: null };
    if (aborted(runId)) return { result, navigated: false, choice: 'stop' };
    const choice = await requestValidationQuestion(
      result.releaseRevoked === true
        ? `The page changed the target after Laya released it: it now matches a rule for tier '${result.liveTier}', so the release no longer holds. Nothing was clicked.`
        : `The page changed the target after it was planned: it now reads as tier '${result.liveTier}', not '${result.plannedTier}'. Nothing was clicked.`,
      STANDARD_VALIDATION_OPTIONS, null, [], stepNumber,
    );
    if (choice !== 'proceed') {
      return { result: { skipped: choice === 'skip', error: choice === 'skip' ? null : 'stopped after a live tier change' }, navigated: false, choice };
    }
    contentAction.plannedTier = result.liveTier;
    contentAction.requireUnprovenBasis = false; // a person has now approved it
  }
  return { result: { error: 'the target kept changing tier; nothing was clicked' }, navigated: false, choice: null };
}

function tierTargetHandle(action, localScene) {
  const matches = (localScene || []).filter((el) => el.selector === action.target_selector);
  if (matches.length !== 1 || typeof matches[0].handle !== 'string') {
    throw new Error(`execute: no single scanned handle for ${action.target_selector}`);
  }
  return matches[0].handle;
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

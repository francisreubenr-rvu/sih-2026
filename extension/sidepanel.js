// DHRISTI side panel: render logic only.
//
// The panel is a conversation. The user types a task and sends it; everything the agent then
// does arrives as transcript entries and is rendered here. There is no Capture button, no Send
// protected layout button and no Confirm this action button anywhere in this file, because
// capture, strip, plan, validate and execute are work the agent performs, not steps a person
// approves. Exactly two entries carry controls: an uncertain-PII decision and a validation
// question, because the architecture requires a human in the loop for those two.
//
// The message contract is frozen (Docs/specs/2026-09-13-sidepanel-chat-ui.md): the background
// sends SESSION_UPDATE with the WHOLE transcript, so this file re-renders from one source and
// never has to replay a stream of events it may have missed while the panel was closed.

import { WARDEN_DEFAULT_ORIGIN } from './config.js';
import { loopbackHttpUrl } from './utils/loopback.js';

const els = {
  healthChip: document.getElementById('health-chip'),
  healthText: document.getElementById('health-text'),
  emptyState: document.getElementById('empty-state'),
  transcript: document.getElementById('transcript'),
  composer: document.getElementById('composer'),
  taskInput: document.getElementById('task-input'),
  send: document.getElementById('send'),
  stop: document.getElementById('stop'),
  outboundMeta: document.getElementById('outbound-meta'),
  outboundBody: document.getElementById('outbound-body'),
  outboundEmpty: document.getElementById('outbound-empty'),
  outboundReadable: document.getElementById('outbound-readable'),
  outboundRawToggle: document.getElementById('outbound-raw-toggle'),
  outboundRaw: document.getElementById('outbound-raw'),
  lanes: document.getElementById('lanes'),
  boundaryMeta: document.getElementById('boundary-meta'),
  cloudLaneText: document.getElementById('cloud-lane-text'),
  cloudModel: document.getElementById('cloud-model'),
  crossDown: document.getElementById('cross-down'),
  crossUp: document.getElementById('cross-up'),
  planWhere: document.getElementById('plan-where'),
  inspector: document.getElementById('inspector'),
  inspectorSummary: document.getElementById('inspector-summary'),
  keptCounts: document.getElementById('kept-counts'),
  keptEmpty: document.getElementById('kept-empty'),
  keptList: document.getElementById('kept-list'),
  screenFigure: document.getElementById('screen-figure'),
  screenImg: document.getElementById('screen-img'),
  screenCaption: document.getElementById('screen-caption'),
  screenEmpty: document.getElementById('screen-empty'),
  decisionBody: document.getElementById('decision-body'),
  decisionEmpty: document.getElementById('decision-empty'),
  wardenOrigin: document.getElementById('warden-origin'),
  wardenOriginSave: document.getElementById('warden-origin-save'),
  wardenOriginStatus: document.getElementById('warden-origin-status'),
  detailReachable: document.getElementById('detail-reachable'),
  detailLoaded: document.getElementById('detail-loaded'),
  detailModel: document.getElementById('detail-model'),
  detailPlanner: document.getElementById('detail-planner'),
  detailGroq: document.getElementById('detail-groq'),
  detailDestination: document.getElementById('detail-destination'),
  detailPlannerModel: document.getElementById('detail-planner-model'),
  groqNote: document.getElementById('groq-note'),
};

const DEFAULT_WARDEN_ORIGIN = WARDEN_DEFAULT_ORIGIN;

// The panel is the only context that knows it is open, so the panel drives the re-check
// interval: on open, every few seconds while open, and the background re-checks on every task
// submission as well. Starting the Warden after the panel is already open therefore recovers
// without a reload. A few seconds is short enough to feel immediate and long enough that a
// health probe against a wedged loopback process cannot pile up.
const HEALTH_POLL_MS = 3000;

// ---- State -----------------------------------------------------------------
// The transcript as last delivered, and the DOM node rendered for each entry id. Keeping the
// nodes is what makes aria-live behave: only genuinely new entries are announced, instead of
// the whole transcript being re-announced on every update.
let entries = [];
const rendered = new Map(); // entry id -> { el, signature }
let health = null;
let lastOutbound = null;
let healthTimer = null;

function init() {
  initBoundary();
  els.send.disabled = true;
  els.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    submitTask();
  });
  els.taskInput.addEventListener('input', syncComposer);
  els.taskInput.addEventListener('keydown', (event) => {
    // Enter sends; Shift and Enter is a newline in the task text.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitTask();
    }
  });
  els.stop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' }).catch(() => {});
  });
  els.wardenOriginSave.addEventListener('click', saveOrigin);
  document.addEventListener('keydown', trapFocusInPendingCard, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_UPDATE') applySession(message.entries);
    else if (message.type === 'PROMPT_REQUEST') handlePromptRequest(message.prompt);
    else if (message.type === 'PROMPT_RESOLVED') refreshPromptState();
    else if (message.type === 'HEALTH_UPDATE') applyHealth(message);
    else if (message.type === 'OUTBOUND_UPDATE') {
      lastOutbound = { path: lastOutbound?.path || null, body: message.body };
      renderOutbound();
    } else if (message.type === 'TRACE_UPDATE') applyTrace(message.trace);
  });

  restore();
}

async function restore() {
  const settings = await chrome.storage.local.get(['wardenOrigin']).catch(() => ({}));
  const storedOrigin = settings.wardenOrigin && String(settings.wardenOrigin).trim();
  if (storedOrigin && !loopbackHttpUrl(storedOrigin)) {
    els.wardenOrigin.value = DEFAULT_WARDEN_ORIGIN;
    els.wardenOriginStatus.textContent = 'Stored origin was not loopback and is not used. Save 127.0.0.1 or localhost.';
  } else {
    els.wardenOrigin.value = storedOrigin || DEFAULT_WARDEN_ORIGIN;
    els.wardenOriginStatus.textContent = `Default: ${DEFAULT_WARDEN_ORIGIN}. Loopback only.`;
  }

  // One transcript, one source. GET_SESSION is the same array SESSION_UPDATE carries.
  const session = await send({ type: 'GET_SESSION' });
  if (session && Array.isArray(session.entries)) applySession(session.entries);

  // A blocked run must not become invisible because the panel was closed and reopened: ask what
  // is pending and render it if the transcript does not already carry it.
  const pending = await send({ type: 'GET_PROMPT' });
  if (pending) handlePromptRequest(pending);

  const outbound = await send({ type: 'GET_OUTBOUND' });
  if (outbound) {
    lastOutbound = outbound;
    renderOutbound();
  }

  // The current step's trace, if a run is live or just ended. Memory only on both sides.
  const trace = await send({ type: 'GET_TRACE' });
  if (trace && typeof trace === 'object') applyTrace(trace);

  await refreshHealth();
  healthTimer = setInterval(refreshHealth, HEALTH_POLL_MS);
  // A side panel page is torn down when it is closed, which clears the interval; clearing it
  // here as well keeps the intent explicit.
  window.addEventListener('pagehide', () => {
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = null;
  });
}

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

async function refreshHealth() {
  await send({ type: 'RETRY_HEALTH' });
}

// ---- Composer --------------------------------------------------------------
async function submitTask() {
  const task = els.taskInput.value.trim();
  if (!task) return;
  // A run is already in flight: the composer keeps the text so it can be sent once the run ends.
  if (runIsActive(entries)) return;
  // First await from the click so Chrome still treats this as the user gesture.
  // Optional <all_urls> is requested here and is not an install-time host permission.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
  } catch {
    els.healthText.textContent = 'Site access could not be requested, so the task was not sent.';
    return;
  }
  if (!granted) {
    els.healthText.textContent = 'Site access was not granted, so the page was not scanned and nothing was sent.';
    return;
  }
  // The text is cleared only once the background has confirmed a run started or refused it for
  // a stated reason. A service worker that is asleep, or a refusal, must not swallow the task.
  const response = await send({ type: 'START_TASK', task });
  if (!response || response.ok !== true) return;
  els.taskInput.value = '';
  syncComposer();
}

function syncComposer() {
  const active = runIsActive(entries);
  els.stop.hidden = !active;
  // While a run is live Send cannot act, so Stop takes its place instead of stacking under it.
  els.send.hidden = active;
  els.send.disabled = active || !els.taskInput.value.trim();
}

// A run is in flight when a task was accepted and no terminal marker has followed it. The
// background writes exactly one terminal entry per accepted task, including for a refusal, so
// this cannot latch on.
function runIsActive(list) {
  let active = false;
  for (const entry of list) {
    if (entry.kind === 'user') active = true;
    if (entry.terminal) active = false;
  }
  return active;
}

// ---- Transcript ------------------------------------------------------------
function applySession(next) {
  if (!Array.isArray(next)) return;
  // A card rendered locally from GET_PROMPT is dropped as soon as the transcript itself carries
  // the same prompt, so one pending decision is never shown as two.
  const realPromptIds = new Set(
    next.filter((entry) => !String(entry.id).startsWith('local-')).map((entry) => entry.promptId).filter(Boolean),
  );
  entries = next.filter((entry) => !(String(entry.id).startsWith('local-') && realPromptIds.has(entry.promptId)));
  renderTranscript();
  syncComposer();
}

function renderTranscript() {
  const nearBottom = els.transcript.scrollHeight - els.transcript.scrollTop - els.transcript.clientHeight < 80;
  const seen = new Set();

  for (const entry of entries) {
    seen.add(entry.id);
    const signature = JSON.stringify(entry);
    const existing = rendered.get(entry.id);
    if (existing && existing.signature === signature) continue;
    const focusWasInside = existing ? existing.el.contains(document.activeElement) : false;
    const el = buildEntry(entry);
    if (existing) existing.el.replaceWith(el);
    else els.transcript.append(el);
    rendered.set(entry.id, { el, signature });
    if (focusWasInside) els.taskInput.focus();
  }

  // An entry the background removed (a blocked card whose state no longer holds) goes with it.
  for (const [id, record] of rendered) {
    if (seen.has(id)) continue;
    record.el.remove();
    rendered.delete(id);
  }

  els.emptyState.hidden = entries.length > 0;
  const pendingCard = pendingCardEl();
  if (pendingCard) {
    pendingCard.scrollIntoView({ block: 'nearest' });
  } else if (nearBottom) {
    els.transcript.scrollTop = els.transcript.scrollHeight;
  }
}

function buildEntry(entry) {
  switch (entry.kind) {
    case 'user': return buildUser(entry);
    case 'stage': return buildStage(entry);
    case 'activity': return buildActivity(entry);
    case 'uncertain-pii': return buildUncertain(entry);
    case 'question': return buildQuestion(entry);
    case 'blocked': return buildBlocked(entry);
    case 'error': return buildError(entry);
    case 'validated': return buildValidated(entry);
    default: return buildActivity(entry);
  }
}

function baseEntry(entry, kindClass) {
  const li = document.createElement('li');
  li.className = `entry ${kindClass} pixel-reveal`;
  li.dataset.entryId = entry.id;
  if (entry.pending) li.dataset.pending = 'true';
  return li;
}

// A card that blocks the run is a labelled group, so a screen reader announces what the decision
// is about before reading the controls inside it.
function titleRow(text, chipText, chipState) {
  const row = document.createElement('p');
  row.className = 'entry-title';
  const span = document.createElement('span');
  span.textContent = text;
  row.append(span);
  if (chipText) {
    const chip = document.createElement('span');
    chip.className = 'pixel-chip';
    chip.dataset.state = chipState;
    chip.textContent = chipText;
    row.append(chip);
  }
  return row;
}

function buildUser(entry) {
  const li = baseEntry(entry, 'entry--user');
  const p = document.createElement('p');
  p.className = 'entry-text';
  p.textContent = entry.text || '';
  li.append(p);
  return li;
}

function buildStage(entry) {
  const li = baseEntry(entry, 'entry--stage');
  const cell = document.createElement('span');
  cell.className = 'entry-cell';
  cell.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'stage-name';
  name.textContent = entry.stage || 'STAGE';
  li.append(cell, name);
  // A real measured value when one exists, and nothing at all when none was measured. Never a
  // placeholder: a made-up number is worse than a missing one.
  if (entry.value) {
    const value = document.createElement('span');
    value.className = 'stage-value';
    value.textContent = entry.value;
    li.append(value);
  }
  return li;
}

function buildActivity(entry) {
  const li = baseEntry(entry, 'entry--activity');
  const cell = document.createElement('span');
  cell.className = 'entry-cell';
  cell.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = entry.text || '';
  li.append(cell, text);
  return li;
}

function buildError(entry) {
  const li = baseEntry(entry, 'entry--error');
  li.append(titleRow('Failed', null, null));
  const p = document.createElement('p');
  p.textContent = entry.text || '';
  li.append(p);
  return li;
}

function buildValidated(entry) {
  const li = baseEntry(entry, 'entry--validated');
  li.append(titleRow('Validated', null, null));
  const p = document.createElement('p');
  p.textContent = entry.text || '';
  li.append(p);
  return li;
}

function buildBlocked(entry) {
  const li = baseEntry(entry, 'entry--blocked');
  li.dataset.resolved = entry.resolved ? 'true' : 'false';
  const row = titleRow(entry.text || 'The Warden is not running.', null, null);
  const titleId = `blocked-title-${entry.id}`;
  row.id = titleId;
  li.append(row);

  if (entry.refused && !entry.resolved) {
    const refused = document.createElement('p');
    refused.className = 'entry-reason';
    refused.textContent = 'That task was refused and was not sent. Nothing was queued.';
    li.append(refused);
  }
  if (entry.reason) {
    const reason = document.createElement('p');
    reason.className = 'entry-reason';
    reason.textContent = entry.reason;
    li.append(reason);
  }
  if (entry.command) {
    // Verbatim from warden/README.md, never paraphrased: a start command that does not work is
    // worse than no start command.
    const pre = document.createElement('pre');
    pre.className = 'command';
    pre.textContent = entry.command;
    li.append(pre);
  }
  if (!entry.resolved) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.dataset.action = 'retry-health';
    retry.addEventListener('click', () => refreshHealth());
    li.append(retry);
  }
  return asGroup(li, titleId);
}

// ---- The two blocking cards -------------------------------------------------
function buildUncertain(entry) {
  const li = baseEntry(entry, 'entry--uncertain-pii');
  const row = titleRow('Uncertain personal data', entry.pending ? 'AWAITING YOUR DECISION' : 'ANSWERED', entry.pending ? 'uncertain' : 'neutral');
  const titleId = `uncertain-title-${entry.id}`;
  row.id = titleId;

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = entry.pending
    ? (entry.text || 'The Warden was not confident enough to strip these spans automatically. Choose strip or keep for each one.')
    : 'These spans were decided when the run reached them. The preview shown is real personal data and is not stored.';
  li.append(row, note);

  const list = document.createElement('ul');
  list.className = 'uncertain-list';
  for (const item of entry.items || []) {
    list.append(buildUncertainItem(entry, item));
  }
  li.append(list);

  const error = document.createElement('p');
  error.className = 'card-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  li.append(error);

  if (entry.pending) {
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = 'Apply decisions';
    apply.addEventListener('click', () => submitUncertain(li, entry, error));
    li.append(apply);
  }
  return asGroup(li, titleId);
}

function buildUncertainItem(entry, item) {
  const li = document.createElement('li');
  li.className = 'uncertain-item';
  if (!entry.pending && item.decision) li.dataset.decided = 'true';

  const head = document.createElement('div');
  head.className = 'item-head';
  const label = document.createElement('span');
  label.className = 'item-label';
  label.textContent = item.label || item.token || 'unknown span';
  const score = document.createElement('span');
  score.className = 'item-score';
  // A real score from the Warden, or an explicit statement that there is none. Never invented.
  score.textContent = typeof item.score === 'number' ? `score ${Math.round(item.score * 100)}%` : 'no score returned';
  head.append(label, score);
  li.append(head);

  // The detection-box primitive from pixel.css: a 1px rect with a micro mono label, carrying the
  // span itself. It is the preview of real personal data, which is why it is shown and never stored.
  const box = document.createElement('div');
  box.className = 'detection-box';
  box.dataset.label = item.source || 'detected span';
  const boxValue = document.createElement('span');
  boxValue.className = 'detection-box__value';
  boxValue.textContent = item.preview != null ? String(item.preview) : '(no preview returned)';
  box.append(boxValue);
  li.append(box);

  if (entry.pending) {
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', `Decision for ${item.label || item.token || 'this span'}`);
    for (const choice of ['strip', 'keep']) {
      const wrap = document.createElement('label');
      wrap.dataset.choice = choice;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `pii-${entry.id}-${item.id}`;
      input.value = choice;
      input.dataset.itemId = item.id;
      const text = document.createElement('span');
      text.textContent = choice === 'strip' ? 'Strip' : 'Keep';
      wrap.append(input, text);
      row.append(wrap);
    }
    li.append(row);
  } else if (item.decision) {
    const decided = document.createElement('p');
    decided.className = 'decision-line';
    decided.textContent = `You chose ${item.decision}.`;
    li.append(decided);
  }
  return li;
}

// The answer is read from the entry the background sent, keyed by the Warden's own span id, not
// from DOM position: a re-render must never be able to shift which answer belongs to which span.
async function submitUncertain(card, entry, errorEl) {
  const chosen = new Map();
  for (const input of card.querySelectorAll('input[type="radio"]:checked')) {
    chosen.set(input.dataset.itemId, input.value);
  }
  const answers = {};
  for (const item of entry.items || []) {
    if (!chosen.has(item.id)) {
      errorEl.textContent = 'Choose strip or keep for every item before continuing.';
      errorEl.hidden = false;
      card.querySelector(`input[data-item-id="${cssEscape(item.id)}"]`)?.focus();
      return;
    }
    answers[item.id] = chosen.get(item.id);
  }
  errorEl.hidden = true;
  lockCard(card);
  await send({ type: 'PROMPT_RESPONSE', id: entry.promptId, answers });
}

function buildQuestion(entry) {
  const li = baseEntry(entry, 'entry--question');
  const row = titleRow('Validation question', entry.pending ? 'AWAITING YOUR DECISION' : 'ANSWERED', entry.pending ? 'uncertain' : 'neutral');
  const titleId = `question-title-${entry.id}`;
  row.id = titleId;

  if (entry.attempt != null) {
    const attempt = document.createElement('p');
    attempt.className = 'diag-meta';
    attempt.textContent = `Attempt ${entry.attempt} of 3`;
    li.append(attempt);
  }
  li.append(row);

  const text = document.createElement('p');
  text.textContent = entry.text || '';
  li.append(text);

  const reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
  if (reasons.length) {
    const wrap = document.createElement('ul');
    wrap.className = 'question-reasons';
    for (const reason of reasons) {
      const item = document.createElement('li');
      item.textContent = String(reason);
      wrap.append(item);
    }
    li.append(wrap);
  }

  if (entry.pending) {
    const stack = document.createElement('div');
    stack.className = 'option-stack';
    for (const option of entry.options || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label || option.id;
      button.dataset.choice = option.id;
      button.addEventListener('click', async () => {
        lockCard(li);
        await send({ type: 'PROMPT_RESPONSE', id: entry.promptId, answers: { choice: option.id } });
      });
      stack.append(button);
    }
    li.append(stack);
  } else if (entry.choiceLabel || entry.choice) {
    const decided = document.createElement('p');
    decided.className = 'decision-line';
    decided.textContent = `You chose ${entry.choiceLabel || entry.choice}.`;
    li.append(decided);
  }
  return asGroup(li, titleId);
}

// A card that blocks the run is a labelled group. The group sits inside the list item rather than
// replacing its role, so the transcript stays a valid list for assistive technology.
function asGroup(li, titleId) {
  const group = document.createElement('div');
  group.className = 'entry-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', titleId);
  group.append(...li.childNodes);
  li.append(group);
  return li;
}

// A control that has been answered must not be answerable twice: the first click disables the
// card's controls immediately, before the background's re-render arrives.
function lockCard(card) {
  for (const control of card.querySelectorAll('button, input')) control.disabled = true;
}

// ---- Prompt survival (panel closed and reopened mid-decision) ---------------
// The transcript normally already carries the card. This covers the case where the panel opened
// after the prompt was raised and, for any reason, the entry is not in the transcript: the
// pending prompt itself is enough to render a working card, and GET_PROMPT is what supplies it.
function handlePromptRequest(prompt) {
  if (!prompt || !prompt.kind) return;
  const known = entries.some((entry) => entry.promptId === prompt.id);
  if (known) {
    refreshPromptState();
    return;
  }
  const entry = prompt.kind === 'uncertain-pii'
    ? { id: `local-${prompt.id}`, kind: 'uncertain-pii', promptId: prompt.id, pending: true, text: null, items: prompt.items || [] }
    : {
        id: `local-${prompt.id}`, kind: 'question', promptId: prompt.id, pending: true,
        text: prompt.text, options: prompt.options || [], attempt: prompt.attempt ?? null, reasons: prompt.reasons || [],
      };
  applySession([...entries, entry]);
}

function refreshPromptState() {
  renderTranscript();
}

// While a decision blocks the run, Tab must not be able to leave the card. The card is not a
// dialog, so Escape does not dismiss it: the only way out is to answer, or to press Stop, which
// stays reachable by pointer on purpose.
function pendingCardEl() {
  return els.transcript.querySelector('.entry[data-pending="true"]');
}

function trapFocusInPendingCard(event) {
  if (event.key !== 'Tab') return;
  const card = pendingCardEl();
  if (!card) return;
  const focusables = Array.from(card.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !card.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !card.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

// ---- Health ----------------------------------------------------------------
// Where planning runs, from what /health reported: `destination` when the Warden sends it, else
// derived from `planner` (groq is the cloud path, ollama the on-device one). Null when unknown, so
// nothing is claimed that the Warden did not say.
function plannerDestination(next) {
  if (!next || next.reachable !== true) return null;
  if (next.destination === 'cloud' || next.destination === 'local') return next.destination;
  if (next.planner === 'groq') return 'cloud';
  if (next.planner === 'ollama') return 'local';
  return null;
}

function plannerModelOf(next) {
  return next && typeof next.plannerModel === 'string' && next.plannerModel ? next.plannerModel : null;
}

function applyHealth(next) {
  health = next && typeof next === 'object' ? next : {};
  const destination = plannerDestination(health);
  const plannerModel = plannerModelOf(health);
  // The four states the spec names, in precedence order. Each is a real combination of the
  // fields /health returned; none is a guess.
  let chipState = 'neutral';
  let chipText = 'CHECKING';
  let text = 'Checking the Warden.';

  if (health.reachable !== true) {
    chipState = 'destructive';
    chipText = 'OFFLINE';
    // "Not answering" rather than "not running": a probe can fail because the server is absent
    // or because it is busy. The measured error is on the card and in Settings.
    text = 'The Warden is not answering. No task can start until it is.';
  } else if (health.loaded !== true) {
    // Not an error: the model is loading. The elapsed wait is measured from when this panel
    // first saw the loading state, so it is real time, not a progress bar.
    chipState = 'neutral';
    chipText = 'LOADING';
    const seconds = typeof health.elapsedMs === 'number' ? Math.round(health.elapsedMs / 1000) : null;
    text = seconds === null ? 'The on-device redaction model is loading.' : `The on-device redaction model is loading, ${seconds}s so far.`;
  } else if (health.planner === 'groq' && health.groqConfigured !== true) {
    chipState = 'uncertain';
    chipText = 'NO CLOUD KEY';
    text = 'Cloud planner key missing. Add GROQ_API_KEY to warden/.env, or set WARDEN_PLANNER=ollama to plan offline.';
  } else {
    chipState = 'structure';
    chipText = 'READY';
    // The short model name keeps the line readable at 320px; Settings carries the full id.
    const shortModel = health.model ? String(health.model).split('/').pop() : null;
    const redaction = shortModel ? `redaction on device (${shortModel})` : 'redaction on device';
    let planning = '';
    if (destination === 'cloud') planning = ` · planning in cloud (${plannerModel || providerName(health.planner) || 'cloud planner'})`;
    else if (destination === 'local') planning = ` · planning on device (Ollama${plannerModel ? ` ${plannerModel}` : ''})`;
    text = `Ready · ${redaction}${planning}`;
  }

  els.healthChip.dataset.state = chipState;
  els.healthChip.textContent = chipText;
  els.healthText.textContent = text;

  const reachable = health.reachable === true;
  els.detailReachable.textContent = reachable ? 'yes' : 'no';
  els.detailLoaded.textContent = reachable ? (health.loaded === true ? 'yes' : 'no') : '-';
  els.detailModel.textContent = reachable && health.model ? health.model : '-';
  els.detailPlanner.textContent = reachable && health.planner ? health.planner : '-';
  els.detailDestination.textContent = destination === 'cloud' ? 'in the cloud' : destination === 'local' ? 'on this device' : '-';
  els.detailPlannerModel.textContent = reachable && plannerModel ? plannerModel : '-';
  els.detailGroq.textContent = reachable ? (health.groqConfigured === true ? 'yes' : 'no') : '-';
  els.groqNote.hidden = !(reachable && health.planner === 'groq' && health.groqConfigured !== true);

  // With no trace carrying its own route, the pipeline draws the route this Warden will use.
  renderRoute(trace);
  renderSent(trace);
}

async function saveOrigin() {
  const value = els.wardenOrigin.value.trim() || DEFAULT_WARDEN_ORIGIN;
  els.wardenOrigin.value = value;
  if (!loopbackHttpUrl(value)) {
    els.wardenOriginStatus.textContent = 'Refused. The Warden origin must be http or https on 127.0.0.1, localhost, or ::1.';
    return;
  }
  const response = await send({ type: 'SET_WARDEN_ORIGIN', origin: value });
  if (response?.ok) els.wardenOriginStatus.textContent = `Saved: ${value}`;
  else els.wardenOriginStatus.textContent = response?.error || `Could not save ${value}.`;
  await refreshHealth();
}

// ---- Trace: the Boundary pipeline and the step inspector -----------------------
// TRACE_UPDATE carries the WHOLE trace for the current step on every stage transition
// (Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md). Each node and each
// inspector tab keeps the signature it last rendered and is rebuilt only when its own slice of the
// trace changed. A missing field renders nothing: never a placeholder number.
const STAGE_KEYS = ['perceive', 'redact', 'plan', 'check', 'act'];
const STATUS_LABEL = { idle: 'Idle', active: 'Active', done: 'Done', error: 'Error', skipped: 'Skipped' };
const TAB_NAMES = ['sent', 'kept', 'screen', 'decision'];
// TYPE#n, the only shape a token takes on the wire (EMAIL#1, PHONE_NUMBER#2).
const TOKEN_RE = /\b[A-Z][A-Z0-9_]*#\d+\b/g;

let trace = null;
const nodeSig = new Map();
const sectionSig = { route: null, sent: null, kept: null, screen: null, decision: null, summary: null };
// Bumped whenever the kept list is rebuilt, so a REVEAL_TOKEN answer that lands after the step
// moved on is dropped instead of being written into a row that no longer exists.
let keptGeneration = 0;

function initBoundary() {
  for (const button of document.querySelectorAll('.node')) {
    button.addEventListener('click', () => openInspector(button.dataset.tab));
  }
  for (const tab of tabButtons()) {
    tab.addEventListener('click', () => selectTab(tab.id.slice(4), false));
    tab.addEventListener('keydown', onTabKey);
  }
  els.outboundRawToggle.addEventListener('click', () => {
    const open = els.outboundRawToggle.getAttribute('aria-expanded') !== 'true';
    els.outboundRawToggle.setAttribute('aria-expanded', String(open));
    els.outboundRawToggle.textContent = open ? 'Hide raw JSON' : 'Raw JSON';
    els.outboundRaw.hidden = !open;
  });
  // Example tasks only fill the composer. Sending stays the user's own act.
  for (const example of document.querySelectorAll('.example')) {
    example.addEventListener('click', () => {
      els.taskInput.value = example.dataset.example || example.textContent;
      syncComposer();
      els.taskInput.focus();
    });
  }
  renderTrace();
}

function applyTrace(next) {
  trace = next && typeof next === 'object' ? next : null;
  renderTrace();
}

function renderTrace() {
  const t = trace;
  renderRoute(t);
  for (const key of STAGE_KEYS) renderNode(key, t && t.stages ? t.stages[key] : null);
  renderSummary(t);
  renderSent(t);
  renderKept(t);
  renderScreen(t);
  renderDecision(t);
}

// ---- The route: which lane Plan sits in, and what crossed -----------------------
function traceDestination(t) {
  const d = t && t.planner ? t.planner.destination : null;
  if (d === 'cloud' || d === 'local') return d;
  return plannerDestination(health);
}

function traceProvider(t) {
  return (t && t.planner && t.planner.provider) || (health && health.reachable === true ? health.planner : null) || null;
}

function traceModel(t) {
  return (t && t.planner && typeof t.planner.model === 'string' && t.planner.model) || plannerModelOf(health);
}

function renderRoute(t) {
  const destination = traceDestination(t);
  const provider = traceProvider(t);
  const model = traceModel(t);
  const bytes = t && t.outbound && isCount(t.outbound.bytes) ? t.outbound.bytes : null;
  const latency = t && t.inbound ? t.inbound.latencyMs : null;
  const step = t && isCount(t.step) ? t.step : null;
  const keyMissing = Boolean(health && health.reachable === true && health.planner === 'groq' && health.groqConfigured !== true);
  const sig = JSON.stringify([destination, provider, model, bytes, latency, step, keyMissing]);
  if (sig === sectionSig.route) return;
  sectionSig.route = sig;

  els.lanes.dataset.destination = destination || 'unknown';
  els.planWhere.textContent = destination === 'cloud' ? ', in the cloud,' : destination === 'local' ? ', on this device,' : ',';
  els.cloudModel.textContent = destination === 'cloud' && model ? model : '';
  els.cloudLaneText.dataset.warn = String(destination === 'cloud' && keyMissing);
  if (destination === 'cloud') {
    els.cloudLaneText.textContent = keyMissing
      ? `${providerName(provider) || 'Planner'} · key missing, nothing can be planned`
      : `${providerName(provider) || 'Planner'} · sees tokens only`;
  } else if (destination === 'local') {
    els.cloudLaneText.textContent = 'Not used. Planning runs on this device.';
  } else {
    els.cloudLaneText.textContent = 'Planner route not reported yet.';
  }
  els.crossDown.textContent = destination === 'cloud' ? (bytes !== null ? `↓ ${fmtBytes(bytes)}` : '↓ tokens') : '';
  const latencyText = fmtMs(latency);
  els.crossUp.textContent = destination === 'cloud' ? (latencyText ? `↑ ${latencyText}` : '↑ plan') : '';
  els.boundaryMeta.textContent = step !== null ? `Step ${step}` : '';
}

function renderNode(key, stage) {
  const status = stage && STATUS_LABEL[stage.status] ? stage.status : 'idle';
  const ms = stage ? fmtMs(stage.ms) : '';
  const detail = stage && typeof stage.detail === 'string' ? stage.detail : '';
  const sig = `${status}|${ms}|${detail}`;
  if (nodeSig.get(key) === sig) return;
  nodeSig.set(key, sig);
  const button = document.querySelector(`.node-slot[data-stage="${key}"] .node`);
  if (!button) return;
  button.dataset.status = status;
  if (status === 'active') button.setAttribute('aria-current', 'step');
  else button.removeAttribute('aria-current');
  button.querySelector('.node-status-text').textContent = STATUS_LABEL[status];
  button.querySelector('.node-ms').textContent = ms;
  button.querySelector('.node-detail').textContent = detail;
}

function renderSummary(t) {
  const parts = [];
  if (t && isCount(t.step)) parts.push(`step ${t.step}`);
  const replaced = t && t.redaction && Array.isArray(t.redaction.replaced) ? t.redaction.replaced.length : null;
  if (replaced !== null) parts.push(`${replaced} kept here`);
  if (t && t.outbound && isCount(t.outbound.bytes)) parts.push(`${fmtBytes(t.outbound.bytes)} sent`);
  const text = parts.length ? parts.join(' · ') : 'no step yet';
  if (text === sectionSig.summary) return;
  sectionSig.summary = text;
  els.inspectorSummary.textContent = text;
}

// ---- Tabs (WAI-ARIA tabs, automatic activation) ------------------------------------
function tabButtons() {
  return TAB_NAMES.map((name) => document.getElementById(`tab-${name}`));
}

function selectTab(name, focus) {
  if (!TAB_NAMES.includes(name)) return;
  for (const tabName of TAB_NAMES) {
    const selected = tabName === name;
    const tab = document.getElementById(`tab-${tabName}`);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(`panel-${tabName}`).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}

function onTabKey(event) {
  const index = TAB_NAMES.indexOf(event.currentTarget.id.slice(4));
  let next = null;
  if (event.key === 'ArrowRight') next = (index + 1) % TAB_NAMES.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_NAMES.length) % TAB_NAMES.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = TAB_NAMES.length - 1;
  if (next === null) return;
  event.preventDefault();
  selectTab(TAB_NAMES[next], true);
}

function openInspector(tabName) {
  els.inspector.open = true;
  selectTab(tabName, false);
  els.inspector.scrollIntoView({ block: 'nearest' });
}

// ---- What the cloud saw ---------------------------------------------------------
// The exact body that left this browser for planning, and nothing else. The trace's copy wins;
// OUTBOUND_UPDATE keeps working for a background that does not send traces yet.
function renderOutbound() {
  renderSent(trace);
}

function renderSent(t) {
  const source = t && t.outbound && t.outbound.body ? t.outbound : (lastOutbound && lastOutbound.body ? lastOutbound : null);
  const body = source ? source.body : null;
  const raw = body ? JSON.stringify(body, null, 2) : '';
  const destination = traceDestination(t);
  const provider = traceProvider(t);
  const model = traceModel(t);
  const sig = JSON.stringify([raw, source && source.bytes, source && source.path, destination, provider, model]);
  if (sig === sectionSig.sent) return;
  sectionSig.sent = sig;

  els.outboundReadable.replaceChildren();
  els.outboundBody.textContent = raw;
  if (!body) {
    els.outboundMeta.textContent = '';
    els.outboundEmpty.hidden = false;
    els.outboundRawToggle.hidden = true;
    els.outboundRaw.hidden = true;
    els.outboundRawToggle.setAttribute('aria-expanded', 'false');
    els.outboundRawToggle.textContent = 'Raw JSON';
    return;
  }
  els.outboundEmpty.hidden = true;
  els.outboundRawToggle.hidden = false;

  // Byte count: the trace's measured figure, else the size of this exact JSON body.
  const bytes = isCount(source.bytes) ? source.bytes : new TextEncoder().encode(JSON.stringify(body)).length;
  const meta = [`POST ${source.path || '/plan'}`, `${bytes.toLocaleString('en')} bytes`];
  if (destination === 'cloud') meta.push(`to cloud · ${providerName(provider) || 'planner'}${model ? ` · ${model}` : ''}`);
  else if (destination === 'local') meta.push(`to the planner on this device${model ? ` · ${model}` : ''}`);
  els.outboundMeta.textContent = meta.join(' · ');

  const frag = document.createDocumentFragment();
  const task = typeof body.tokenizedTask === 'string' ? body.tokenizedTask : null;
  if (task !== null) {
    frag.append(miniHeading('Task as sent'));
    const p = document.createElement('p');
    p.className = 'sent-task';
    appendTokenized(p, task);
    frag.append(p);
  }

  const elements = Array.isArray(body.elements) ? body.elements : null;
  if (elements) {
    frag.append(miniHeading(`Page controls · ${elements.length}`));
    const list = document.createElement('ul');
    list.className = 'el-list';
    const cap = 60;
    for (const element of elements.slice(0, cap)) {
      if (!element || typeof element !== 'object') continue;
      const li = document.createElement('li');
      li.className = 'el-row';
      const head = document.createElement('div');
      head.className = 'el-head';
      const tag = document.createElement('span');
      tag.className = 'el-tag';
      tag.textContent = String(element.tag || element.type || 'el');
      const sel = document.createElement('code');
      sel.className = 'el-sel';
      sel.textContent = String(element.selector || '');
      head.append(tag, sel);
      li.append(head);
      if (typeof element.label === 'string' && element.label.trim()) {
        const label = document.createElement('p');
        label.className = 'el-label';
        appendTokenized(label, element.label);
        li.append(label);
      }
      list.append(li);
    }
    frag.append(list);
    if (elements.length > cap) {
      const more = document.createElement('p');
      more.className = 'note';
      more.textContent = `${elements.length - cap} more in the raw JSON.`;
      frag.append(more);
    }
  }

  if (Array.isArray(body.history)) {
    const history = document.createElement('p');
    history.className = 'note';
    history.textContent = body.history.length
      ? `Plus a value-free history of ${body.history.length} earlier step${body.history.length === 1 ? '' : 's'}.`
      : 'No earlier steps in this request.';
    frag.append(history);
  }
  const assurance = document.createElement('p');
  assurance.className = 'assurance';
  assurance.textContent = 'The token map is not in this request. It stayed on this device.';
  frag.append(assurance);
  els.outboundReadable.append(frag);
}

// ---- Kept on this device ---------------------------------------------------------
const WHERE = { task: 'in task', dom: 'on page', label: 'in a label' };
const BY = { regex: 'by pattern', gliner: 'by local model', user: 'by you' };

function renderKept(t) {
  const stepKey = t ? `${t.runId ?? ''}:${t.step ?? ''}` : '';
  const redaction = t && t.redaction && typeof t.redaction === 'object' ? t.redaction : null;
  const sig = `${stepKey}|${JSON.stringify(redaction)}`;
  if (sig === sectionSig.kept) return;
  sectionSig.kept = sig;
  // Rebuilding drops every revealed value with the old rows: a value lives only in the DOM of the
  // step it was revealed in.
  keptGeneration += 1;
  els.keptList.replaceChildren();
  els.keptCounts.replaceChildren();

  const replaced = redaction && Array.isArray(redaction.replaced) ? redaction.replaced.filter((r) => r && typeof r.token === 'string') : [];
  if (redaction) {
    addCount(els.keptCounts, replaced.length, 'value replaced', 'values replaced');
    if (isCount(redaction.screenMasked)) addCount(els.keptCounts, redaction.screenMasked, 'region masked on screen', 'regions masked on screen');
    if (isCount(redaction.uncertainAsked)) addCount(els.keptCounts, redaction.uncertainAsked, 'asked', 'asked');
  }
  els.keptCounts.hidden = !redaction;
  els.keptEmpty.hidden = replaced.length > 0;
  els.keptEmpty.textContent = redaction ? 'No values were replaced in this step.' : 'Redaction has not run for a step yet.';

  replaced.forEach((item, index) => els.keptList.append(buildKeptRow(item, index)));
}

function buildKeptRow(item, index) {
  const li = document.createElement('li');
  li.className = 'kept-row';
  const main = document.createElement('div');
  main.className = 'kept-main';
  const chip = tokenChip(item.token);
  const meta = document.createElement('span');
  meta.className = 'kept-meta';
  const type = typeof item.type === 'string' && item.type ? item.type : item.token.split('#')[0];
  const parts = [type.toLowerCase().replace(/_/g, ' ')];
  if (WHERE[item.source]) parts.push(WHERE[item.source]);
  if (BY[item.layer]) parts.push(BY[item.layer]);
  if (typeof item.score === 'number' && Number.isFinite(item.score)) parts.push(`${Math.round(item.score * 100)}%`);
  meta.textContent = parts.join(' · ');

  const valueId = `kept-value-${keptGeneration}-${index}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet-btn reveal-btn';
  button.textContent = 'Reveal';
  button.setAttribute('aria-label', `Reveal ${item.token}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', valueId);
  main.append(chip, meta, button);

  const value = document.createElement('div');
  value.className = 'kept-value';
  value.id = valueId;
  value.setAttribute('aria-live', 'polite');
  value.hidden = true;
  li.append(main, value);

  const generation = keptGeneration;
  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-expanded') === 'true') {
      hideValue(button, value, item.token);
      return;
    }
    button.disabled = true;
    const response = await send({ type: 'REVEAL_TOKEN', token: item.token });
    if (generation !== keptGeneration || !li.isConnected) return;
    button.disabled = false;
    value.replaceChildren();
    value.hidden = false;
    if (response && response.value != null && !response.error) {
      const box = document.createElement('div');
      box.className = 'detection-box reveal-box';
      box.dataset.label = 'real value · this panel only';
      const text = document.createElement('span');
      text.className = 'detection-box__value';
      text.textContent = String(response.value);
      box.append(text);
      value.append(box);
      button.textContent = 'Hide';
      button.setAttribute('aria-label', `Hide ${item.token}`);
      button.setAttribute('aria-expanded', 'true');
    } else {
      const err = document.createElement('p');
      err.className = 'card-error';
      err.textContent = `Could not reveal: ${(response && response.error) || 'no answer from the extension'}.`;
      value.append(err);
    }
  });
  return li;
}

function hideValue(button, value, token) {
  value.replaceChildren();
  value.hidden = true;
  button.textContent = 'Reveal';
  button.setAttribute('aria-label', `Reveal ${token}`);
  button.setAttribute('aria-expanded', 'false');
}

function addCount(parent, n, one, many) {
  const span = document.createElement('span');
  span.className = 'count';
  const num = document.createElement('strong');
  num.textContent = String(n);
  span.append(num, ` ${n === 1 ? one : many}`);
  parent.append(span);
}

// ---- Screen -----------------------------------------------------------------------
// Only the MASKED capture is ever put here. With none, the panel says so; it never falls back
// to any other image.
function renderScreen(t) {
  const shot = t && t.screenshot && typeof t.screenshot === 'object' ? t.screenshot : null;
  const dataUrl = shot && typeof shot.dataUrl === 'string' && /^data:image\//.test(shot.dataUrl) ? shot.dataUrl : null;
  const masked = t && t.redaction && isCount(t.redaction.screenMasked) ? t.redaction.screenMasked : null;
  const sig = `${dataUrl ? dataUrl.length : 0}|${dataUrl ? dataUrl.slice(-64) : ''}|${masked}|${t ? t.step : ''}`;
  if (sig === sectionSig.screen) return;
  sectionSig.screen = sig;
  if (!dataUrl) {
    els.screenFigure.hidden = true;
    els.screenImg.removeAttribute('src');
    els.screenEmpty.hidden = false;
    return;
  }
  els.screenEmpty.hidden = true;
  els.screenFigure.hidden = false;
  if (isCount(shot.width) && isCount(shot.height)) {
    els.screenImg.width = shot.width;
    els.screenImg.height = shot.height;
  }
  els.screenImg.src = dataUrl;
  const maskedText = masked !== null ? ` ${masked} region${masked === 1 ? '' : 's'} masked.` : '';
  els.screenImg.alt = `Masked capture of the page${t && isCount(t.step) ? `, step ${t.step}` : ''}.${maskedText}`;
  els.screenCaption.textContent = `The masked capture taken on this device.${maskedText} It was not sent anywhere.`;
}

// ---- Decision ---------------------------------------------------------------------
const GATE_TEXT = {
  unattended: 'Ran without asking',
  confirm: 'Waited for your confirmation',
  ask: 'Asked you first',
  reject: 'Rejected before acting',
};
const OUTCOME = {
  done: ['Done', 'done'],
  navigated: ['Done, page changed', 'done'],
  failed: ['Failed', 'fail'],
  skipped: ['Skipped', 'muted'],
  stopped: ['Stopped', 'wait'],
};

function renderDecision(t) {
  const inbound = t && t.inbound && typeof t.inbound === 'object' ? t.inbound : null;
  const check = t && t.check && typeof t.check === 'object' ? t.check : null;
  const act = t && t.act && typeof t.act === 'object' ? t.act : null;
  const destination = traceDestination(t);
  const sig = JSON.stringify([inbound, check, act, destination, t && t.planner]);
  if (sig === sectionSig.decision) return;
  sectionSig.decision = sig;
  els.decisionBody.replaceChildren();
  els.decisionEmpty.hidden = Boolean(inbound || check || act);

  if (inbound) {
    const block = decisionBlock('Plan', destination === 'cloud' ? 'from cloud' : destination === 'local' ? 'from this device' : null, destination === 'cloud' ? 'cloud' : 'local');
    const dl = document.createElement('dl');
    dl.className = 'kv';
    addKv(dl, 'Action', inbound.action);
    addKv(dl, 'Target', inbound.target, 'mono');
    addKv(dl, 'Value', inbound.value, 'tok');
    addKv(dl, 'Why', inbound.reasoning, 'tok');
    addKv(dl, 'Model', inbound.model || (t.planner && t.planner.model));
    addKv(dl, 'Latency', fmtMs(inbound.latencyMs));
    if (Array.isArray(inbound.switched) && inbound.switched.length) {
      addKv(dl, 'Fallbacks', inbound.switched.map((s) => (typeof s === 'string' ? s : (s && (s.model || s.from || JSON.stringify(s))))).join(' → '));
    }
    block.append(dl);
    els.decisionBody.append(block);
  }

  if (check) {
    const checks = Array.isArray(check.checks) ? check.checks.filter((c) => c && c.name) : [];
    const passed = checks.filter((c) => c.pass === true).length;
    const block = decisionBlock('Checked here', checks.length ? `${passed} of ${checks.length} passed` : null, 'local');
    if (checks.length) {
      const list = document.createElement('ul');
      list.className = 'check-list';
      for (const c of checks) {
        const li = document.createElement('li');
        li.className = 'check-row';
        li.dataset.pass = c.pass === true ? 'true' : 'false';
        const glyph = document.createElement('span');
        glyph.className = 'check-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = c.pass === true ? '✓' : '✗';
        const text = document.createElement('span');
        text.className = 'check-text';
        const name = document.createElement('span');
        name.className = 'check-name';
        name.textContent = `${String(c.name)}`;
        const verdict = document.createElement('span');
        verdict.className = 'visually-hidden';
        verdict.textContent = c.pass === true ? ' passed' : ' failed';
        name.append(verdict);
        text.append(name);
        if (c.detail) {
          const detail = document.createElement('span');
          detail.className = 'check-detail';
          appendTokenized(detail, String(c.detail));
          text.append(detail);
        }
        li.append(glyph, text);
        list.append(li);
      }
      block.append(list);
    }
    const dl = document.createElement('dl');
    dl.className = 'kv';
    addKv(dl, 'Tier', check.tier);
    addKv(dl, 'Gate', GATE_TEXT[check.gate] || check.gate);
    addKv(dl, 'You chose', check.choice);
    if (dl.childElementCount) block.append(dl);
    els.decisionBody.append(block);
  }

  if (act) {
    const [label, tone] = OUTCOME[act.outcome] || [act.outcome ? String(act.outcome) : null, 'muted'];
    const block = decisionBlock('Acted here', label, tone);
    const dl = document.createElement('dl');
    dl.className = 'kv';
    addKv(dl, 'Action', act.action);
    addKv(dl, 'Target', act.target, 'mono');
    addKv(dl, 'Error', act.error);
    if (dl.childElementCount) block.append(dl);
    els.decisionBody.append(block);
  }
}

function decisionBlock(title, chipText, tone) {
  const block = document.createElement('section');
  block.className = 'decision-block';
  const head = document.createElement('h4');
  head.className = 'decision-head';
  head.append(title);
  if (chipText) {
    const chip = document.createElement('span');
    chip.className = 'tone-chip';
    chip.dataset.tone = tone;
    chip.textContent = chipText;
    head.append(chip);
  }
  block.append(head);
  return block;
}

function addKv(dl, term, value, kind) {
  if (value === null || value === undefined || value === '') return;
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  if (kind === 'mono') dd.className = 'mono';
  if (kind === 'tok') appendTokenized(dd, String(value));
  else dd.textContent = String(value);
  row.append(dt, dd);
  dl.append(row);
}

// ---- Token rendering --------------------------------------------------------------
function tokenChip(token) {
  const chip = document.createElement('span');
  chip.className = 'tok';
  chip.textContent = token;
  return chip;
}

// Text with every TYPE#n token as a cyan chip. textContent throughout: nothing is parsed as HTML.
function appendTokenized(parent, text) {
  const value = String(text);
  let last = 0;
  for (const match of value.matchAll(TOKEN_RE)) {
    if (match.index > last) parent.append(value.slice(last, match.index));
    parent.append(tokenChip(match[0]));
    last = match.index + match[0].length;
  }
  if (last < value.length) parent.append(value.slice(last));
}

function miniHeading(text) {
  const h = document.createElement('h4');
  h.className = 'mini-head';
  h.textContent = text;
  return h;
}

// ---- Formatting: measured values only ------------------------------------------------
function isCount(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function fmtMs(ms) {
  if (!isCount(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function fmtBytes(n) {
  if (!isCount(n)) return '';
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function providerName(provider) {
  if (provider === 'groq') return 'Groq';
  if (provider === 'ollama') return 'Ollama';
  return provider ? String(provider) : null;
}

// ---- Helpers ----------------------------------------------------------------
function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
}

// ---- Startup ----------------------------------------------------------------
// Called last, deliberately: init() reads module-level constants declared further down this
// file, and a `const` read before its declaration throws.
init();

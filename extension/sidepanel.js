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
  emptyGrid: document.getElementById('empty-grid'),
  transcript: document.getElementById('transcript'),
  composer: document.getElementById('composer'),
  taskInput: document.getElementById('task-input'),
  send: document.getElementById('send'),
  stop: document.getElementById('stop'),
  outboundMeta: document.getElementById('outbound-meta'),
  outboundBody: document.getElementById('outbound-body'),
  outboundEmpty: document.getElementById('outbound-empty'),
  wardenOrigin: document.getElementById('warden-origin'),
  wardenOriginSave: document.getElementById('warden-origin-save'),
  wardenOriginStatus: document.getElementById('warden-origin-status'),
  detailReachable: document.getElementById('detail-reachable'),
  detailLoaded: document.getElementById('detail-loaded'),
  detailModel: document.getElementById('detail-model'),
  detailPlanner: document.getElementById('detail-planner'),
  detailGroq: document.getElementById('detail-groq'),
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
  buildEmptyGrid();
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
    }
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
  li.setAttribute('role', 'group');
  li.setAttribute('aria-labelledby', titleId);
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
  return li;
}

// ---- The two blocking cards -------------------------------------------------
function buildUncertain(entry) {
  const li = baseEntry(entry, 'entry--uncertain-pii');
  const row = titleRow('Uncertain personal data', entry.pending ? 'AWAITING YOUR DECISION' : 'ANSWERED', entry.pending ? 'uncertain' : 'neutral');
  const titleId = `uncertain-title-${entry.id}`;
  row.id = titleId;
  li.setAttribute('role', 'group');
  li.setAttribute('aria-labelledby', titleId);

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
  return li;
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
  li.setAttribute('role', 'group');
  li.setAttribute('aria-labelledby', titleId);

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
function applyHealth(next) {
  health = next;
  // The four states the spec names, in precedence order. Each is a real combination of the
  // fields /health returned; none is a guess.
  let chipState = 'neutral';
  let chipText = 'CHECKING';
  let text = 'Checking the Warden.';

  if (next.reachable !== true) {
    chipState = 'destructive';
    chipText = 'OFFLINE';
    // "Not answering" rather than "not running": a probe can fail because the server is absent
    // or because it is busy. The measured error is on the card and in Server setup.
    text = 'The Warden is not answering. No task can start until it is.';
  } else if (next.loaded !== true) {
    // Not an error: the model is loading. The elapsed wait is measured from when this panel
    // first saw the loading state, so it is real time, not a progress bar.
    chipState = 'neutral';
    chipText = 'LOADING';
    const seconds = typeof next.elapsedMs === 'number' ? Math.round(next.elapsedMs / 1000) : null;
    text = seconds === null ? 'The local model is loading.' : `The local model is loading, ${seconds}s so far.`;
  } else if (next.planner === 'groq' && next.groqConfigured !== true) {
    chipState = 'neutral';
    chipText = 'NO GROQ KEY';
    text = 'This Warden is set to the optional Groq planner, and no key is configured. The default planner is local Ollama.';
  } else {
    chipState = 'structure';
    chipText = 'READY';
    text = next.planner === 'groq'
      ? 'Ready. Planning is using the optional Groq path.'
      : (next.model ? `Ready. ${next.model} is loaded. Planning uses local Ollama.` : 'Ready. Planning uses local Ollama.');
  }

  els.healthChip.dataset.state = chipState;
  els.healthChip.textContent = chipText;
  els.healthText.textContent = text;

  const reachable = next.reachable === true;
  els.detailReachable.textContent = reachable ? 'yes' : 'no';
  els.detailLoaded.textContent = reachable ? (next.loaded === true ? 'yes' : 'no') : '-';
  els.detailModel.textContent = reachable && next.model ? next.model : '-';
  if (els.detailPlanner) {
    els.detailPlanner.textContent = reachable ? (next.planner || 'ollama') : '-';
  }
  els.detailGroq.textContent = reachable ? (next.groqConfigured === true ? 'yes' : 'no') : '-';
  els.groqNote.hidden = !(reachable && next.loaded === true && next.planner === 'groq' && next.groqConfigured !== true);
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

// ---- Outbound ---------------------------------------------------------------
function renderOutbound() {
  const body = lastOutbound?.body;
  if (!body) {
    els.outboundMeta.textContent = '';
    els.outboundBody.textContent = '';
    els.outboundEmpty.hidden = false;
    return;
  }
  els.outboundEmpty.hidden = true;
  els.outboundMeta.textContent = lastOutbound.path ? `POST ${lastOutbound.path}` : 'Last planning request';
  // Rendered exactly as it was sent. This body is the sanitised one: tokens, sanitized DOM,
  // element metadata and history. The token-to-value map is never part of it.
  els.outboundBody.textContent = JSON.stringify(body, null, 2);
}

// ---- The empty state's cell motif -------------------------------------------
// A 6x6 field on the 8px cell module: a filled core inside an outline ring with the corners
// empty, so the form thins at the edge rather than ending on a hard boundary (DESIGN.md, "The
// cell module"). The transcript is text-heavy, so the motif appears here and nowhere else.
const EMPTY_GRID_PATTERN = [
  '.oooo.',
  'o####o',
  'o####o',
  'o####o',
  'o####o',
  '.oooo.',
];

function buildEmptyGrid() {
  els.emptyGrid.style.setProperty('--cols', String(EMPTY_GRID_PATTERN[0].length));
  els.emptyGrid.style.setProperty('--rows', String(EMPTY_GRID_PATTERN.length));
  for (const row of EMPTY_GRID_PATTERN) {
    for (const glyph of row) {
      const cell = document.createElement('span');
      cell.className = glyph === '#' ? 'cell cell--fill' : glyph === 'o' ? 'cell cell--outline' : 'cell cell--empty';
      els.emptyGrid.append(cell);
    }
  }
}

// ---- Helpers ----------------------------------------------------------------
function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
}

// ---- Startup ----------------------------------------------------------------
// Called last, deliberately: init() reads module-level constants declared further down this
// file, and a `const` read before its declaration throws.
init();

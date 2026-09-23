// warden.js: HTTP client for the local Warden service (GET /health, POST /strip,
// POST /plan, POST /validate), exactly as Docs/specs/2026-09-13-dhristi-v4-warden.md
// defines them, including its "Amendment, 13 September 2026" section.
//
// Every call has its own timeout (AbortController-driven fetch): a wedged local process
// must not hang the agent loop forever. A distinct error type, WardenUnreachableError, is
// thrown when the request never got a response at all (connection refused, DNS failure,
// timeout) so the caller can tell "Warden is not running" apart from "Warden answered with
// an error" (WardenHTTPError, carrying the real status and parsed body when there is one).
// This distinction is what lets background.js implement the frozen spec's degraded-mode
// table: "Warden unreachable" and "GLiNER not loaded" (503 from /strip) are different
// messages to the user, not the same catch-all failure.
//
// Origin is configurable via chrome.storage.local key 'wardenOrigin' (read fresh on every
// call, same convention background.js already uses for other settings), defaulting to
// config.js's WARDEN_DEFAULT_ORIGIN.

import { WARDEN_DEFAULT_ORIGIN } from '../config.js';

const TIMEOUT_MS = {
  health: 3000,
  strip: 15000, // GLiNER inference; slower on a cold or busy machine than the regex layer alone
  plan: 25000, // a Groq call, possibly retried across the whole fallback chain server-side
  validate: 15000, // includes an optional Ollama local-reasoning pass
};

export class WardenUnreachableError extends Error {
  constructor(origin, path, cause) {
    super(`Warden unreachable at ${origin}${path}: ${cause}`);
    this.name = 'WardenUnreachableError';
    this.origin = origin;
    this.path = path;
  }
}

export class WardenHTTPError extends Error {
  constructor(path, status, body) {
    const message = (body && typeof body === 'object' && body.error) || `Warden HTTP ${status} from ${path}`;
    super(message);
    this.name = 'WardenHTTPError';
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

async function getOrigin() {
  try {
    const stored = await chrome.storage.local.get(['wardenOrigin']);
    const origin = stored.wardenOrigin && String(stored.wardenOrigin).trim();
    return (origin || WARDEN_DEFAULT_ORIGIN).replace(/\/+$/, '');
  } catch {
    return WARDEN_DEFAULT_ORIGIN;
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, timeoutMs } = {}) {
  const origin = await getOrigin();
  let res;
  try {
    res = await fetch(`${origin}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Any fetch-level failure (connection refused, DNS, abort/timeout) means the request
    // never got a response at all -- this is "not running", not "returned an error".
    throw new WardenUnreachableError(origin, path, error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timed out' : error.message);
  }

  const data = await readJson(res);
  if (!res.ok) {
    throw new WardenHTTPError(path, res.status, data);
  }
  return data;
}

export async function health() {
  return request('/health', { timeoutMs: TIMEOUT_MS.health });
}

// resolved: { [tokenId]: 'strip' | 'keep' }, decisions already made this session for
// previously uncertain spans, keyed by the exact token id the Warden minted (e.g.
// "PERSONNAME#1"), so the same question is never asked twice.
export async function strip({ task, dom, elements, resolved }) {
  return request('/strip', {
    method: 'POST',
    body: { task, dom, elements, resolved: resolved || {} },
    timeoutMs: TIMEOUT_MS.strip,
  });
}

// Caller contract, enforced by app.py itself as well: this payload must never carry a
// `tokens` key, a raw value, or a screenshot. Only the four sanitised fields below.
export async function plan({ tokenizedTask, sanitizedDom, elements, history }) {
  return request('/plan', {
    method: 'POST',
    body: { tokenizedTask, sanitizedDom, elements, history: history || [] },
    timeoutMs: TIMEOUT_MS.plan,
  });
}

export async function validate({ plan: planBody, elements, tokenizedTask, attempt }) {
  return request('/validate', {
    method: 'POST',
    body: { plan: planBody, elements, tokenizedTask, attempt },
    timeoutMs: TIMEOUT_MS.validate,
  });
}

// warden.js: HTTP client for the local Warden service (GET /health, POST /strip, POST /plan),
// as Docs/specs/2026-09-13-dhristi-v4-warden.md defines them, with the additive v5 changes in
// Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md. There is no client for
// POST /validate any more: v5 moved every plan check into the extension (utils/plan-check.js),
// and nothing in extension/, scripts/ or Prototype/ called it but the old run loop. The endpoint
// stays in the Warden for older harnesses only.
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
//
// Pairing (30 September 2026, warden/pairing.py; required since 2 October). Without a code in
// chrome.storage.local 'wardenPairing', no POST leaves the browser: request() refuses locally. With
// one, every request carries a fresh nonce and an HMAC-SHA256 request proof, and
// every response must carry X-Dhristi-Proof over the same nonce, the path, the status and the
// exact response bytes, or it is refused with WardenPairingError. The secret never crosses the
// wire. Anything else on the Warden's port cannot produce a proof, so it cannot pass as the
// Warden; a response that verified is recorded in VERIFIED (never a field the server could set),
// and only such a response may release a local confirmation (plan-check.js layaRelease).

import { WARDEN_DEFAULT_ORIGIN } from '../config.js';
import { loopbackHttpUrl } from './loopback.js';

const TIMEOUT_MS = {
  health: 3000,
  strip: 15000, // GLiNER inference; slower on a cold or busy machine than the regex layer alone
  plan: 75000, // cloud relay by default; local Ollama in offline mode, including a cold model load
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

export class WardenPairingError extends Error {
  constructor(path, reason, { local = false } = {}) {
    super(local
      ? `Pairing is required and no pairing code is saved in Settings, so nothing was sent to ${path}.`
      : `The service on the Warden's port did not prove the pairing code at ${path}: ${reason}. Nothing from it was used.`);
    this.name = 'WardenPairingError';
    this.path = path;
    this.local = local;
  }
}

const VERIFIED = new WeakSet();

// True only for a response object this module parsed from a Warden response whose pairing proof
// verified. Server-supplied fields cannot make it true.
export function isPairingVerified(value) {
  return value !== null && typeof value === 'object' && VERIFIED.has(value);
}

// A pairing code is the Warden's WARDEN_PAIRING_SECRET: base64url, at least 32 characters.
export const PAIRING_CODE_RE = /^[A-Za-z0-9_-]{32,256}$/;

export async function getPairingCode() {
  try {
    const stored = await chrome.storage.local.get(['wardenPairing']);
    const code = stored.wardenPairing && String(stored.wardenPairing).trim();
    return code && PAIRING_CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(code) {
  return crypto.subtle.importKey('raw', encoder.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function getOrigin() {
  try {
    const stored = await chrome.storage.local.get(['wardenOrigin']);
    const origin = stored.wardenOrigin && String(stored.wardenOrigin).trim();
    if (!origin) return WARDEN_DEFAULT_ORIGIN;
    if (!loopbackHttpUrl(origin)) {
      throw new WardenUnreachableError(
        origin,
        '',
        'refusing non-loopback wardenOrigin; only 127.0.0.1, localhost, and ::1 are allowed',
      );
    }
    return origin.replace(/\/+$/, '');
  } catch (error) {
    if (error instanceof WardenUnreachableError) throw error;
    return WARDEN_DEFAULT_ORIGIN;
  }
}

function parseJson(bytes) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, timeoutMs } = {}) {
  const origin = await getOrigin();
  const code = await getPairingCode();
  // Required: an unpaired extension sends no body anywhere. GET /health still goes out unsigned so
  // the panel can say what is missing.
  if (!code && method !== 'GET') throw new WardenPairingError(path, 'no pairing code', { local: true });
  const text = body !== undefined ? JSON.stringify(body) : undefined;
  const headers = {};
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  let key = null;
  let nonce = null;
  if (code) {
    key = await hmacKey(code);
    nonce = b64url(crypto.getRandomValues(new Uint8Array(18)));
    const bodyHash = await sha256Hex(encoder.encode(text ?? ''));
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`dhristi-req\n${method}\n${path}\n${nonce}\n${bodyHash}`)));
    headers['X-Dhristi-Nonce'] = nonce;
    headers['X-Dhristi-Auth'] = b64url(mac);
  }
  let res;
  let bytes;
  try {
    res = await fetch(`${origin}${path}`, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: text,
      signal: AbortSignal.timeout(timeoutMs),
    });
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    // Any fetch-level failure (connection refused, DNS, abort/timeout) means the request
    // never got a response at all -- this is "not running", not "returned an error".
    throw new WardenUnreachableError(origin, path, error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timed out' : error.message);
  }

  if (key) {
    const proof = fromB64url(res.headers?.get?.('X-Dhristi-Proof') ?? null);
    if (!proof) throw new WardenPairingError(path, 'no pairing proof in the response');
    const bodyHash = await sha256Hex(bytes);
    const ok = await crypto.subtle.verify('HMAC', key, proof, encoder.encode(`dhristi-res\n${path}\n${nonce}\n${res.status}\n${bodyHash}`));
    if (!ok) throw new WardenPairingError(path, 'the pairing proof does not match');
  }

  const data = parseJson(bytes);
  if (!res.ok) {
    throw new WardenHTTPError(path, res.status, data);
  }
  if (key && data !== null && typeof data === 'object') VERIFIED.add(data);
  return data;
}

export async function health() {
  return request('/health', { timeoutMs: TIMEOUT_MS.health });
}

// resolved: { [tokenId]: { decision: 'strip' | 'keep', value } }, decisions already made in this
// run for previously uncertain spans, keyed by the token id the Warden minted (e.g.
// "PERSONNAME#1") and bound to the value the person was shown, because ids are minted per call and
// can name a different value on another page (security review, 3 October 2026). A Warden that
// predates the object shape ignores it and asks again, which is the safe direction.
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

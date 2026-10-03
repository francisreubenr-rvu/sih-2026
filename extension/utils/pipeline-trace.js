// pipeline-trace.js: the per-step pipeline trace the side panel draws (Dhristi v5).
//
// Shape and rules: Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md, "Extension
// <-> side panel contract". The background worker owns one trace for the current step, sends the
// WHOLE trace on every stage transition (TRACE_UPDATE) and answers GET_TRACE with it.
//
// Privacy rules, enforced by construction here rather than trusted to callers:
//   - Memory only. Nothing in a trace is ever written to chrome.storage.
//   - No vault value. `redaction.replaced` carries tokens and types, never the value behind them;
//     `inbound.value` passes through toValueToken(), so a literal typed value is masked.
//   - `ms` is measured wall time (performance.now() between the stage going active and leaving
//     active) or null. Never a placeholder.
//
// Pure apart from performance.now(); no chrome.*, no DOM, so it runs under node --test.

export const STAGE_NAMES = Object.freeze(['perceive', 'redact', 'plan', 'check', 'act']);
const STAGE_STATUSES = new Set(['idle', 'active', 'done', 'error', 'skipped']);
const TOKEN_RE = /^[A-Z][A-Z0-9]*#\d+$/;
const REASONING_MAX = 500;

// PRIVACY: never echo a literal typed value. Numeric amounts (scroll/wait) are safe. A vault
// token (EMAIL#1, PERSONNAME#1, ...) is safe verbatim: it names a PII type and position, not content.
export function toValueToken(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (TOKEN_RE.test(text)) return text;
  if (/^\d+$/.test(text)) return text;
  return '*'.repeat(Math.min(text.length, 18));
}

export function isVaultToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

function emptyStage() {
  return { status: 'idle', ms: null, detail: null };
}

export function emptyTrace(runId, step) {
  const stages = {};
  for (const name of STAGE_NAMES) stages[name] = emptyStage();
  return {
    runId: Number(runId) || 0,
    step: Number(step) || 0,
    stages,
    planner: { destination: null, provider: null, model: null },
    scene: { controls: 0 },
    redaction: { replaced: [], uncertainAsked: 0, screenMasked: 0 },
    // The on-device face check on this step's capture (utils/vision-client.js), or null before it
    // ran: { status: 'done' | 'error', faces, ms, inferenceMs, waitInitMs, reason, model }. Boxes
    // and pixels are never put here; `faces` is a count.
    vision: null,
    screenshot: null,
    outbound: null,
    inbound: null,
    check: null,
    act: null,
  };
}

export function createPipelineTrace() {
  let trace = null;
  const startedAt = {};

  return {
    begin(runId, step) {
      trace = emptyTrace(runId, step);
      for (const key of Object.keys(startedAt)) delete startedAt[key];
      return trace;
    },
    // status 'active' starts the stage clock; any other status stops it and records the measured
    // span. A stage that never went active in this step keeps ms null.
    stage(name, status, detail = null) {
      if (!trace || !STAGE_NAMES.includes(name) || !STAGE_STATUSES.has(status)) return;
      const s = trace.stages[name];
      if (status === 'active') {
        startedAt[name] = performance.now();
        s.ms = null;
      } else if (startedAt[name] != null) {
        const ms = performance.now() - startedAt[name];
        s.ms = Number.isFinite(ms) && ms >= 0 ? Math.round(ms * 10) / 10 : null;
        delete startedAt[name];
      }
      s.status = status;
      s.detail = detail == null ? null : String(detail);
    },
    // The stage currently active, if any: the one a thrown error belongs to.
    activeStage() {
      if (!trace) return null;
      return STAGE_NAMES.find((name) => trace.stages[name].status === 'active') || null;
    },
    set(field, value) {
      if (!trace) return;
      trace[field] = value;
    },
    patch(field, partial) {
      if (!trace) return;
      trace[field] = { ...(trace[field] || {}), ...partial };
    },
    current() {
      return trace;
    },
    // A fresh copy for the wire, so a later mutation can never alias a message already sent.
    snapshot() {
      if (!trace) return null;
      return structuredClone(trace);
    },
    clear() {
      trace = null;
    },
  };
}

// redaction.replaced from a /strip response. v5 decisions carry { token, source, layer, score }
// (never a value); the type is the token's prefix. A span the user chose to strip at an
// uncertain-PII prompt is reported with layer 'user'. One row per token and source.
//
// Fallback for a Warden that does not send tokens in decisions yet: one row per token in the
// tokens map with source/layer/score null (unknown), never a guessed value.
export function replacedFromStrip(stripResp, resolvedAnswers = {}) {
  const decisions = Array.isArray(stripResp?.decisions) ? stripResp.decisions : [];
  const rows = [];
  const seen = new Set();
  for (const d of decisions) {
    if (!d || !isVaultToken(d.token)) continue;
    const source = d.source === 'task' || d.source === 'dom' || d.source === 'label' ? d.source : null;
    const key = `${d.token}|${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let layer = d.layer === 'regex' || d.layer === 'gliner' || d.layer === 'user' ? d.layer : null;
    if (resolvedAnswers[d.token] === 'strip' && layer !== 'regex') layer = 'user';
    rows.push({
      token: d.token,
      type: d.token.split('#')[0],
      source,
      layer,
      score: typeof d.score === 'number' && Number.isFinite(d.score) ? d.score : null,
    });
  }
  if (rows.length === 0) {
    for (const token of Object.keys(stripResp?.tokens || {})) {
      if (!isVaultToken(token)) continue;
      rows.push({ token, type: token.split('#')[0], source: null, layer: null, score: null });
    }
  }
  return rows;
}

// trace.inbound from a /plan response. Only plan fields and planner metadata; `value` masked.
export function inboundFromPlan(plan, planResp) {
  const reasoning = typeof plan?.reasoning_token === 'string' ? plan.reasoning_token.slice(0, REASONING_MAX) : null;
  return {
    action: typeof plan?.action === 'string' ? plan.action : null,
    target: typeof plan?.target_selector === 'string' ? plan.target_selector : null,
    value: toValueToken(plan?.value),
    reasoning,
    model: typeof planResp?.model === 'string' ? planResp.model : null,
    latencyMs: typeof planResp?.latencyMs === 'number' && Number.isFinite(planResp.latencyMs) ? planResp.latencyMs : null,
    switched: Array.isArray(planResp?.switched) ? planResp.switched.filter((s) => typeof s === 'string') : [],
  };
}

// Width and height read from a PNG data URL's IHDR chunk (bytes 16..23), without decoding the
// image. Returns nulls for anything that is not a PNG, rather than a guessed size.
export function pngSize(dataUrl) {
  const none = { width: null, height: null };
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return none;
  try {
    const head = atob(dataUrl.slice('data:image/png;base64,'.length, 'data:image/png;base64,'.length + 32));
    if (head.length < 24 || head.slice(12, 16) !== 'IHDR') return none;
    const u32 = (i) => ((head.charCodeAt(i) << 24) >>> 0) + (head.charCodeAt(i + 1) << 16) + (head.charCodeAt(i + 2) << 8) + head.charCodeAt(i + 3);
    return { width: u32(16), height: u32(20) };
  } catch {
    return none;
  }
}

// Byte length of the exact JSON string utils/warden.js sends for this body.
export function jsonByteLength(body) {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

// Replaces every occurrence of a vault value in `text` with its token, longest value first so a
// value that contains another is replaced whole. Used on element labels before /plan: the Warden
// tokenizes sanitizedDom, and a label that repeats DOM text must not carry the raw value past it
// (an older Warden returned labels untouched). Values shorter than 2 characters are skipped: they
// match too much ordinary text to mean anything.
export function tokenizeWithVault(text, tokens) {
  if (typeof text !== 'string' || !text) return text;
  const entries = Object.entries(tokens || {})
    .filter(([token, value]) => isVaultToken(token) && typeof value === 'string' && value.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [token, value] of entries) {
    if (out.includes(value)) out = out.split(value).join(token);
  }
  return out;
}

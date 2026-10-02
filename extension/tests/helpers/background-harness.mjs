// Loads the real extension/background.js in Node against a fake `chrome` API and a fake Warden
// (a stubbed global fetch), then drives one START_TASK run to its terminal transcript entry.
//
// Each call imports a fresh module instance (query-string cache bust), so run state never leaks
// between tests. Prompts are answered automatically with the scripted choices, in order.

import { createHash, createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { EXTENSION_DIR } from './content-harness.mjs';

let instance = 0;

// scan:      the PAGE_SCAN reply (elements carry selector, handle, tier, label, ...)
// warden:    { health, strip(body), plan(body, n), validate(body, n) } -> JSON or throw.
//            A thrown object with `status` becomes an HTTP error reply with that status and body.
//            v5 never calls /validate; a validate() here only exists to prove that.
// choices:   answers for successive prompts ('proceed' | 'skip' | 'stop'); default 'stop'
// execute:   optional (action, n) -> reply for EXECUTE_ACTION
// onPrompt:  optional async (prompt, { send }) called before a prompt is answered, while the run
//            is parked on it (the vault is live then). `send(message, sender)` reaches the worker.
export const PANEL_SENDER = { id: 'dhristi-test', url: 'chrome-extension://dhristi-test/sidepanel.html' };

// `pairingCode` is what the extension holds (chrome.storage.local 'wardenPairing'); `wardenSecret`
// is what the fake Warden signs responses with (warden/pairing.py's scheme), so a test can pair
// them, mismatch them, or leave the Warden unsigned.
// Pairing is required (2 October 2026), so runs are paired by default; pass pairingCode: null to
// test an unpaired extension.
export const HARNESS_PAIRING_CODE = 'h'.repeat(43);
export async function runTask({ task = 'go to the next page', scan, warden, choices = [], execute, onPrompt, capture, starts = 1, pairingCode = HARNESS_PAIRING_CODE, wardenSecret = HARNESS_PAIRING_CODE } = {}) {
  const fetchBodies = [];
  const tabMessages = [];
  const runtimeMessages = [];
  const prompts = [];
  const hookResults = [];
  let listener = null;
  let planCalls = 0;
  let validateCalls = 0;
  let executeCalls = 0;
  const send = (message, sender = PANEL_SENDER) => new Promise((resolve) => {
    const keepOpen = listener(message, sender, resolve);
    if (keepOpen === false) resolve(undefined);
  });

  const noop = { addListener() {} };
  globalThis.chrome = {
    runtime: {
      id: 'dhristi-test',
      getURL: (p) => `chrome-extension://dhristi-test/${p}`,
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: noop,
      onStartup: noop,
      sendMessage: async (message) => {
        runtimeMessages.push(message);
        if (message.type === 'PROMPT_REQUEST') {
          prompts.push(message.prompt);
          const choice = choices[prompts.length - 1] || 'stop';
          const answer = () => listener({ type: 'PROMPT_RESPONSE', id: message.prompt.id, answers: { choice } }, PANEL_SENDER, () => {});
          if (onPrompt) {
            Promise.resolve(onPrompt(message.prompt, { send })).then((r) => { hookResults.push(r); answer(); });
          } else {
            queueMicrotask(answer);
          }
        }
        return undefined;
      },
    },
    permissions: { contains: async () => true, onAdded: noop },
    scripting: {
      getRegisteredContentScripts: async () => [{ id: 'dhristi-scan' }],
      registerContentScripts: async () => {},
      executeScript: async () => [],
    },
    storage: {
      local: { get: async () => (pairingCode ? { wardenPairing: pairingCode } : {}), set: async () => {}, remove: async () => {} },
      session: { get: async () => ({}), set: async () => {} },
    },
    tabs: {
      query: async () => [{ id: 7, windowId: 3 }],
      captureVisibleTab: async () => capture || 'data:image/png;base64,iVBORw0KGgo=',
      sendMessage: async (tabId, message) => {
        tabMessages.push(message);
        switch (message.type) {
          case 'PING': return { ok: true };
          case 'PAGE_SCAN': return structuredClone(scan);
          case 'EXECUTE_ACTION':
            executeCalls += 1;
            return execute ? execute(message.action, executeCalls) : { digest: 'd', elementCount: 1, changed: true };
          default: return { ok: true };
        }
      },
    },
    sidePanel: { setPanelBehavior: async () => {} },
  };

  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = init.headers || {};
    fetchBodies.push({ path, raw: init.body || '', body, headers });
    // Shaped like a fetch Response as utils/warden.js reads it: raw bytes and a header lookup.
    const respond = (status, value) => {
      const bytes = Buffer.from(JSON.stringify(value ?? null));
      const nonce = headers['X-Dhristi-Nonce'];
      const proof = wardenSecret && nonce
        ? createHmac('sha256', wardenSecret)
          .update(`dhristi-res\n${path}\n${nonce}\n${status}\n${createHash('sha256').update(bytes).digest('hex')}`)
          .digest('base64url')
        : null;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => (name.toLowerCase() === 'x-dhristi-proof' ? proof : null) },
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    };
    const answer = (fn) => {
      try {
        return respond(200, fn());
      } catch (error) {
        if (error && typeof error.status === 'number') return respond(error.status, error.body ?? null);
        throw error;
      }
    };
    if (path === '/health') return answer(() => (warden.health ? warden.health() : DEFAULT_HEALTH));
    if (path === '/strip') return answer(() => (warden.strip ? warden.strip(body) : defaultStrip(body)));
    if (path === '/plan') { planCalls += 1; return answer(() => warden.plan(body, planCalls)); }
    if (path === '/validate') { validateCalls += 1; return answer(() => (warden.validate ? warden.validate(body, validateCalls) : null)); }
    throw new TypeError(`unexpected fetch ${path}`);
  };

  instance += 1;
  await import(`${pathToFileURL(join(EXTENSION_DIR, 'background.js')).href}?instance=${instance}`);

  // `starts` > 1 sends START_TASK that many times without waiting, as a double-click would.
  const [start, ...extraStarts] = await Promise.all(Array.from({ length: starts }, () => send({ type: 'START_TASK', task })));
  let entries = start?.entries || [];
  const deadline = Date.now() + 15000;
  while (start?.ok && !entries.some((e) => e.terminal === true)) {
    if (Date.now() > deadline) throw new Error('run did not reach a terminal entry');
    await new Promise((resolve) => setTimeout(resolve, 20));
    entries = (await send({ type: 'GET_SESSION' })).entries;
  }
  const trace = await send({ type: 'GET_G11_TRACE' });
  const pipelineTrace = await send({ type: 'GET_TRACE' });

  return {
    start,
    extraStarts,
    entries,
    prompts,
    trace,
    pipelineTrace,
    traceUpdates: runtimeMessages.filter((m) => m.type === 'TRACE_UPDATE').map((m) => m.trace),
    healthUpdates: runtimeMessages.filter((m) => m.type === 'HEALTH_UPDATE'),
    runtimeMessages,
    tabMessages,
    hookResults,
    validateCalls,
    send,
    fetchBodies,
    executed: tabMessages.filter((m) => m.type === 'EXECUTE_ACTION').map((m) => m.action),
    scans: tabMessages.filter((m) => m.type === 'PAGE_SCAN').length,
    terminal: entries.find((e) => e.terminal === true),
  };
}

export const DEFAULT_HEALTH = {
  ok: true, loaded: true, model: 'fake-gliner', planner: 'groq', groqConfigured: true, destination: 'cloud', plannerModel: 'fake-cloud-planner',
};

export function defaultStrip(body) {
  return {
    tokenizedTask: body.task,
    sanitizedDom: body.dom,
    elements: body.elements.map((el) => ({ ...el, pii: false })),
    tokens: {},
    uncertain: [],
    decisions: [],
    warden: 'fake',
  };
}

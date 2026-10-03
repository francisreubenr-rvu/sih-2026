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
// `again`:   further tasks started one after another in the SAME worker once the previous run
//            ended, as a person sending a second task would; each waits for its own terminal entry.
// `signs`:   optional (path, n) -> false to send the n-th response on `path` with no pairing proof,
//            as a process that took over the Warden's port would.
// `tab`:     optional tab object chrome.tabs.query/get return a copy of; a test may change its url
//            mid-run (from a strip/plan/execute hook) to simulate a navigation.
// vision:    optional (request) -> result for the offscreen face detector's Port protocol
//            (utils/vision-client.js). `request` is { id, type: 'init' | 'detect' | 'stats', ... }.
//            Throw to send an error reply; return VISION_HANG to never answer; return
//            VISION_DROP to close the port without answering. Default: ready, no faces.
// offscreen: false removes chrome.offscreen (a browser without the API).
// storage:   extra chrome.storage.local items (e.g. { useOmniparser: true }).
// siteAccess: false makes chrome.permissions.contains answer no (the optional grant not given).
export const VISION_HANG = Symbol('vision-hang');
export const VISION_DROP = Symbol('vision-drop');
export function defaultVision(request) {
  if (request.type === 'init') return { ready: true, initMs: 1 };
  if (request.type === 'detect') return { detections: [], width: 1, height: 1, inferenceMs: 1, decodeMs: 0, model: 'fake-face', backend: 'fake' };
  return {};
}

export async function runTask({ task = 'go to the next page', scan, warden, choices = [], execute, onPrompt, capture, starts = 1, again = [], tab, signs, pairingCode = HARNESS_PAIRING_CODE, wardenSecret = HARNESS_PAIRING_CODE, vision = defaultVision, offscreen = true, storage = {}, siteAccess = true } = {}) {
  const fetchBodies = [];
  const tabMessages = [];
  const runtimeMessages = [];
  const visionRequests = [];
  const offscreenCreates = [];
  let offscreenOpen = false;
  // A runtime Port as the worker sees it, answered by the `vision` script on behalf of the
  // offscreen document.
  const connect = ({ name } = {}) => {
    const onMessage = [];
    const onDisconnect = [];
    let open = true;
    const close = () => {
      if (!open) return;
      open = false;
      for (const fn of onDisconnect) fn();
    };
    return {
      name,
      onMessage: { addListener(fn) { onMessage.push(fn); } },
      onDisconnect: { addListener(fn) { onDisconnect.push(fn); } },
      disconnect() { open = false; },
      postMessage(message) {
        const copy = structuredClone(message);
        visionRequests.push(copy);
        queueMicrotask(() => {
          if (!offscreenOpen || name !== 'dhristi-vision') { close(); return; }
          let reply;
          try {
            const result = vision(copy);
            if (result === VISION_HANG) return;
            if (result === VISION_DROP) { close(); return; }
            reply = { id: copy.id, ok: true, result };
          } catch (error) {
            reply = { id: copy.id, ok: false, error: error?.message || String(error) };
          }
          if (open) for (const fn of onMessage) fn(reply);
        });
      },
    };
  };
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

  const tabFor = () => ({ ...(tab || { id: 7, windowId: 3, url: 'https://bank.example/home' }) });
  const noop = { addListener() {} };
  globalThis.chrome = {
    runtime: {
      id: 'dhristi-test',
      getURL: (p) => `chrome-extension://dhristi-test/${p}`,
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: noop,
      onStartup: noop,
      lastError: undefined,
      connect,
      getContexts: async ({ contextTypes } = {}) => (offscreenOpen && contextTypes?.includes('OFFSCREEN_DOCUMENT')
        ? [{ contextType: 'OFFSCREEN_DOCUMENT', documentUrl: 'chrome-extension://dhristi-test/offscreen.html' }]
        : []),
      sendMessage: async (message) => {
        runtimeMessages.push(message);
        if (message.type === 'PROMPT_REQUEST') {
          prompts.push(message.prompt);
          const choice = choices[prompts.length - 1] || 'stop';
          // A string is a question's choice; an object is sent as the answers themselves (an
          // uncertain-PII prompt's { [itemId]: 'strip' | 'keep' }).
          const answers = choice && typeof choice === 'object' ? choice : { choice };
          const answer = () => listener({ type: 'PROMPT_RESPONSE', id: message.prompt.id, answers }, PANEL_SENDER, () => {});
          if (onPrompt) {
            Promise.resolve(onPrompt(message.prompt, { send })).then((r) => { hookResults.push(r); answer(); });
          } else {
            queueMicrotask(answer);
          }
        }
        return undefined;
      },
    },
    permissions: { contains: async () => siteAccess, onAdded: noop },
    scripting: {
      getRegisteredContentScripts: async () => [{ id: 'dhristi-scan' }],
      registerContentScripts: async () => {},
      executeScript: async () => [],
    },
    storage: {
      local: { get: async () => ({ ...(pairingCode ? { wardenPairing: pairingCode } : {}), ...storage }), set: async () => {}, remove: async () => {} },
      session: { get: async () => ({}), set: async () => {} },
    },
    tabs: {
      query: async () => [tabFor()],
      get: async () => tabFor(),
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
  if (offscreen) {
    globalThis.chrome.offscreen = {
      createDocument: async (options) => {
        offscreenCreates.push(structuredClone(options));
        if (offscreenOpen) throw new Error('Only a single offscreen document may be created.');
        offscreenOpen = true;
      },
    };
  }

  const pathCalls = {};
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = init.headers || {};
    fetchBodies.push({ path, raw: init.body || '', body, headers });
    // Shaped like a fetch Response as utils/warden.js reads it: raw bytes and a header lookup.
    const respond = (status, value) => {
      const bytes = Buffer.from(JSON.stringify(value ?? null));
      const nonce = headers['X-Dhristi-Nonce'];
      pathCalls[path] = (pathCalls[path] || 0) + 1;
      const signed = !signs || signs(path, pathCalls[path]) !== false;
      const proof = wardenSecret && nonce && signed
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
    if (path === '/health') return answer(() => (warden.health ? warden.health({ send, runtimeMessages }) : DEFAULT_HEALTH));
    if (path === '/strip') return answer(() => (warden.strip ? warden.strip(body) : defaultStrip(body)));
    if (path === '/plan') { planCalls += 1; return answer(() => warden.plan(body, planCalls)); }
    if (path === '/validate') { validateCalls += 1; return answer(() => (warden.validate ? warden.validate(body, validateCalls) : null)); }
    // The optional local OmniParser detector (utils/omniparser.js), on with storage { useOmniparser: true }.
    if (path === '/parse/') return { ok: true, status: 200, json: async () => ({ parsed_content_list: [] }) };
    throw new TypeError(`unexpected fetch ${path}`);
  };

  instance += 1;
  await import(`${pathToFileURL(join(EXTENSION_DIR, 'background.js')).href}?instance=${instance}`);

  // `starts` > 1 sends START_TASK that many times without waiting, as a double-click would.
  const [start, ...extraStarts] = await Promise.all(Array.from({ length: starts }, () => send({ type: 'START_TASK', task })));
  let entries = start?.entries || [];
  const waitTerminals = async (count, ok) => {
    const deadline = Date.now() + 15000;
    while (ok && entries.filter((e) => e.terminal === true).length < count) {
      if (Date.now() > deadline) throw new Error('run did not reach a terminal entry');
      await new Promise((resolve) => setTimeout(resolve, 20));
      entries = (await send({ type: 'GET_SESSION' })).entries;
    }
  };
  await waitTerminals(1, start?.ok);
  const laterStarts = [];
  for (const [i, next] of again.entries()) {
    const reply = await send({ type: 'START_TASK', task: next });
    laterStarts.push(reply);
    entries = reply?.entries || entries;
    await waitTerminals(i + 2, reply?.ok);
  }
  const trace = await send({ type: 'GET_G11_TRACE' });
  const pipelineTrace = await send({ type: 'GET_TRACE' });

  return {
    start,
    extraStarts,
    laterStarts,
    entries,
    prompts,
    trace,
    pipelineTrace,
    traceUpdates: runtimeMessages.filter((m) => m.type === 'TRACE_UPDATE').map((m) => m.trace),
    healthUpdates: runtimeMessages.filter((m) => m.type === 'HEALTH_UPDATE'),
    runtimeMessages,
    visionRequests,
    offscreenCreates,
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

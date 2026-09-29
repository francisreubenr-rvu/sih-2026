const visualizer = window.__dhristiVisualizer;
const MAX_DOM_BYTES = 30 * 1024;

// Token-to-value vault for this run. Populated once via SET_VAULT, keyed by
// TYPE#n placeholder tokens (e.g. EMAIL#1, PHONE#1, CARD#1). Never
// serialised into a message, a step, or storage: only rehydrate() below
// reads it, and only to set a live DOM value locally. See rehydrate() for
// the refusal path on an unknown token (ROAST.md R4-E8).
const tokenMap = new Map();

// Closed-set placeholder token shape from the wire contract: an uppercase
// type name, then "#", then a 1-based index within that type.
const VAULT_TOKEN_PATTERN = /[A-Z][A-Z0-9]*#[0-9]+/g;

// README-compatibility alias for the numbered token format (see the
// "Gemini Response Schema" section of README.md). Usable only when the
// vault holds exactly one value; with zero or multiple values, which entry
// it refers to is ambiguous and must be refused rather than guessed.
const MASK_ALIAS = '<mask-pii/>';

// Value-bearing input types excluded from PII field scanning: these never
// carry free-text personal data (or, for file/hidden, aren't visible text).
const PII_EXCLUDED_INPUT_TYPES = new Set([
  'button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file', 'hidden'
]);

// Lazily import the single redactor implementation. content.js is a classic
// (non-module) content script, so this uses the dynamic import() form against
// the web-accessible resource declared in manifest.json.
let redactTextPromise = null;
function getRedactText() {
  if (!redactTextPromise) {
    redactTextPromise = import(chrome.runtime.getURL('utils/redactor.js')).then((mod) => mod.redactText);
  }
  return redactTextPromise;
}

// The extension's own tier rules (ROAST.md F17), loaded the same way as the redactor.
let opTierPromise = null;
function getOpTier() {
  if (!opTierPromise) opTierPromise = import(chrome.runtime.getURL('utils/op-tier.js'));
  return opTierPromise;
}

// Per-scan element handles (F17 target identity). Each PAGE_SCAN replaces this map, so a handle
// from an earlier scan never resolves. A handle is a random nonce that exists only here and in the
// background worker's copy of the scan: it is never written to the DOM, so the page cannot read,
// forge or re-point it. EXECUTE_ACTION resolves ONLY a handle; selectors are display keys for the
// planner and are never looked up with querySelector on the execute path.
let scanHandles = new Map();

function newHandle() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes); // randomUUID() is undefined outside secure contexts
  return `h${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === 'PING') {
    respond({ ok: true });
    return false;
  }
  if (message.type === 'SET_VAULT') {
    // One-shot per run: the background agent derives tokens from the task
    // text and sends the whole map once. Clearing first means a stale entry
    // from an earlier run can never answer a lookup for this one.
    tokenMap.clear();
    const tokens = message.tokens && typeof message.tokens === 'object' ? message.tokens : {};
    for (const [token, value] of Object.entries(tokens)) {
      tokenMap.set(token, value);
    }
    respond({ ok: true });
    return false;
  }
  if (message.type === 'PAGE_SCAN') {
    scanPage().then(respond).catch((error) => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'MOVE_MOUSE') {
    const target = message.selector ? document.querySelector(message.selector) : null;
    if (target) {
      const rect = rectOf(target);
      visualizer?.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    } else if (message.coordinates) {
      visualizer?.move(message.coordinates.x, message.coordinates.y);
    }
    respond({ ok: true });
    return false;
  }
  if (message.type === 'EXECUTE_ACTION') {
    executeAction(message.action).then((result) => respond(result)).catch((error) => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'END_TASK') {
    tokenMap.clear();
    respond({ ok: true });
    return false;
  }
  return false;
});

async function scanPage() {
  const redactText = await getRedactText();
  const { classifyClickTarget } = await getOpTier();
  const handles = new Map();
  const elements = [];
  const candidates = document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [onclick], [jsaction], [data-action]');
  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    if (!isRenderedVisible(element) || rect.width < 1 || rect.height < 1) continue;
    const label = labelFor(element);
    const handle = newHandle();
    handles.set(handle, new WeakRef(element));
    elements.push({
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || element.tagName.toLowerCase(),
      selector: uniqueSelector(element),
      handle,
      // Click tier computed here, from the live element, by the extension's own rules. The
      // background gate reads this, never a tier or element list the Warden returns.
      tier: classifyClickTarget(tierDescriptor(element)),
      label,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      filled: isFilled(element),
      fieldType: fieldTypeFor(element),
      pii: isElementPii(element, label, redactText)
    });
    if (elements.length >= 180) break;
  }
  scanHandles = handles;
  const dom = serializeDom(elements);
  const piiFields = collectPiiFields(redactText);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  return { elements, dom, digest: digest(dom), piiMaskedCount: piiFields.length, piiFields, viewport };
}

// Single PII-classification authority for a scanned element, shared by the
// PAGE_SCAN element list (the panel's Status column) and collectPiiFields()
// (screenshot pixel masking), so the two can never disagree (see the
// dedicated Status-column finding this replaces). True when either:
//  - the element is a value-bearing control that fieldPiiInfo() flags (a
//    password control, always, or any other in-scope control that currently
//    holds a non-empty value: the exact predicate collectPiiFields() uses
//    to decide what to mask in the screenshot), or
//  - the redactor matches the element's own label text (the same regex/
//    heuristic pass collectPiiFields() runs over every visible text node,
//    which also covers a button/link whose visible text itself is PII).
function isElementPii(element, label, redactText) {
  const info = fieldPiiInfo(element);
  if (info && info.isPii) return true;
  return Boolean(label) && redactText(label).count > 0;
}

// Value-bearing PII predicate for a single control: input types in
// PII_EXCLUDED_INPUT_TYPES (buttons, checkboxes, files, ...) and non-form
// elements are never value-bearing (returns null). A password control is
// always PII, even empty; any other in-scope control (input/textarea/
// select/contenteditable) is PII only once it holds a non-empty value,
// matching the over-mask-what-exists policy documented on
// collectPiiFields(). This is the ONLY place that decision is made; both
// collectPiiFields() and isElementPii() call it rather than each keeping
// their own copy.
function fieldPiiInfo(element) {
  const tag = element.tagName.toLowerCase();
  let type = null;
  let value = '';
  if (tag === 'input') {
    type = (element.getAttribute('type') || 'text').toLowerCase();
    if (PII_EXCLUDED_INPUT_TYPES.has(type)) return null;
    value = element.value || '';
  } else if (tag === 'textarea' || tag === 'select') {
    value = element.value || '';
  } else if (element.isContentEditable || element.hasAttribute('contenteditable')) {
    value = element.innerText || element.textContent || '';
  } else {
    return null;
  }
  const isPassword = type === 'password';
  return { type, isPassword, isPii: isPassword || value.trim().length > 0 };
}

// Effective input semantic for a PAGE_SCAN element: the `type` attribute for
// an <input>, unless autocomplete narrows an otherwise generic type (e.g.
// type="text" autocomplete="cc-number" or autocomplete="street-address",
// per the README's PII heuristics), in which case the more specific
// autocomplete value wins. Non-input elements report their tag.
const GENERIC_INPUT_TYPES = new Set(['text', 'search']);
function fieldTypeFor(element) {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'input') return tag;
  const type = (element.getAttribute('type') || 'text').toLowerCase();
  const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
  const specificAutocomplete = autocomplete && autocomplete !== 'on' && autocomplete !== 'off';
  return specificAutocomplete && GENERIC_INPUT_TYPES.has(type) ? autocomplete : type;
}

// True when a value-bearing control currently holds a non-empty value. This
// carries only the FACT that a value exists, never the value itself, so the
// planner can tell an empty field from a completed one without the value
// ever crossing the boundary.
function isFilled(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return element.checked === true;
    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image' || type === 'file') return false;
    return (element.value || '').trim().length > 0;
  }
  if (tag === 'textarea' || tag === 'select') return (element.value || '').trim().length > 0;
  if (element.isContentEditable || element.hasAttribute('contenteditable')) {
    return (element.innerText || element.textContent || '').trim().length > 0;
  }
  return false;
}

// PII field collection for screenshot masking. Over-masks rather than
// under-masks: any value-bearing control with a non-empty value, plus every
// visible text node redactText finds a match in. Rects are viewport-clipped
// CSS px; the caller (background.js) scales them into capture-pixel space.
//
// Known limitation (ROAST.md R4-L2): this walks the light DOM only, via
// querySelectorAll and a TreeWalker rooted at document.body. Text inside an
// open or closed shadow root, or inside an iframe's own document, is never
// visited, so it is not masked in this local screenshot capture (that text
// is still redacted before the cloud prompt, since the DOM serialization in
// scanPage/serializeDom is a separate path). Not fixed in this run;
// recorded as an accepted limitation.
function collectPiiFields(redactText) {
  const fields = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const controls = document.querySelectorAll('textarea, select, [contenteditable], input');
  for (const element of controls) {
    if (!isVisible(element)) continue;
    const info = fieldPiiInfo(element);
    if (!info || !info.isPii) continue;
    const rect = clipRect(element.getBoundingClientRect(), vw, vh);
    if (!rect) continue;
    fields.push({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      kind: `field:${info.type || element.tagName.toLowerCase()}`,
      confidence: info.isPassword ? 'field-always' : 'field-value'
    });
  }

  // Known limitation (ROAST.md R4-L3): redactText only matches the closed
  // regex pattern set (email, PAN, passport, card, Aadhaar, phone). Free-text
  // NAME and ADDRESS values have no reliable regex signature, so a visible
  // name or postal address on the page is not detected or masked here. Not
  // fixed in this run; recorded as an accepted limitation.
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    const result = redactText(node.nodeValue);
    if (result.count === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (!rects.length) continue;
    const rect = clipRect(unionRects(rects), vw, vh);
    if (!rect) continue;
    const heuristic = result.decisions.some((d) => d.confidence === 'heuristic-label');
    fields.push({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      kind: `text:${result.decisions[0]?.pattern || 'pii'}`,
      confidence: heuristic ? 'heuristic-label' : 'regex-exact'
    });
  }

  return fields;
}

function clipRect(rect, vw, vh) {
  const x1 = Math.max(0, rect.left);
  const y1 = Math.max(0, rect.top);
  const x2 = Math.min(vw, rect.right);
  const y2 = Math.min(vh, rect.bottom);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;
  return { x: x1, y: y1, width, height };
}

function unionRects(rectList) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rectList) {
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(left)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function isVisible(element) {
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
}

// Stricter than isVisible(): display, visibility and zero opacity on the element OR any ancestor
// (an opacity:0 wrapper hides a control just as well as its own opacity). Used for the scan's
// candidate filter and for the execute-time target check. isVisible() stays as it was for the
// PII masking pass, which over-masks by design.
function isRenderedVisible(element) {
  if (typeof element.checkVisibility === 'function'
    && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })) {
    return false;
  }
  if (getComputedStyle(element).visibility !== 'visible') return false;
  for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || Number(style.opacity) === 0) return false;
  }
  return true;
}

// The strings classifyClickTarget() tiers on, read from the live element. Form attributes are
// read through Element.prototype so a control named "action" or "getAttribute" inside the form
// cannot clobber them.
function tierDescriptor(element) {
  const tag = element.tagName.toLowerCase();
  const attr = (el, name) => Element.prototype.getAttribute.call(el, name);
  const resolve = (value) => {
    if (value == null) return '';
    try { return new URL(value, document.baseURI).href; } catch { return String(value); }
  };
  const form = (tag === 'button' || tag === 'input') ? element.form : null;
  const type = tag === 'button'
    ? (element.type || 'submit')
    : tag === 'input' ? (attr(element, 'type') || 'text').toLowerCase() : (attr(element, 'type') || '');
  const submitsForm = Boolean(form) && (
    (tag === 'button' && type === 'submit') || (tag === 'input' && (type === 'submit' || type === 'image')));
  const labelledBy = (attr(element, 'aria-labelledby') || '').split(/\s+/).filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent || '').join(' ');
  return {
    visibleText: (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    ariaLabel: [attr(element, 'aria-label') || '', labelledBy].join(' ').trim(),
    title: attr(element, 'title') || '',
    value: typeof element.value === 'string' ? element.value : (attr(element, 'value') || ''),
    placeholder: attr(element, 'placeholder') || '',
    formAction: form ? resolve(attr(form, 'action') ?? document.URL) : '',
    formaction: resolve(attr(element, 'formaction')),
    href: tag === 'a' ? resolve(attr(element, 'href')) : '',
    type,
    submitsForm,
  };
}

// Why a live target must not be clicked right now, or null when it may be. Checked at execute time,
// synchronously, immediately before the click, against the element the handle points at.
function liveTargetRefusal(element) {
  if (!element.isConnected) return 'the element is no longer in the page';
  if (!isRenderedVisible(element)) return 'the element is not visible';
  if (getComputedStyle(element).pointerEvents === 'none') return 'the element does not accept pointer input';
  if (element.closest('[inert]')) return 'the element is inert';
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return 'the element has no size';
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return 'the element is outside the viewport';
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || (hit !== element && !element.contains(hit))) return 'another element covers the target';
  return null;
}

function labelFor(element) {
  const explicit = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('title');
  if (explicit) return explicit;
  const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 120);
  const id = element.getAttribute('id');
  if (id) return id.replace(/[-_]/g, ' ');
  const wrap = element.closest('label');
  return wrap ? (wrap.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

// Display key for the planner: the short id/name selector when it matches exactly this one
// element in the document, else the structural path. Never used to find the element again.
function uniqueSelector(element) {
  const short = cssSelector(element);
  try {
    const matches = document.querySelectorAll(short);
    if (matches.length === 1 && matches[0] === element) return short;
  } catch { /* fall through to the structural path */ }
  return structuralPath(element);
}

function cssSelector(element) {
  const id = element.getAttribute('id');
  if (id && !/\s/.test(id)) return `#${CSS.escape(id)}`;
  const name = element.getAttribute('name');
  if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  return structuralPath(element);
}

function structuralPath(element) {
  const path = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    path.unshift(part);
    node = parent;
  }
  return path.join(' > ');
}

function serializeDom(elements) {
  const lines = elements.map((element, index) => `${index + 1}. ${element.tag.toUpperCase()} type=${element.type} selector=${element.selector} label="${element.label}" position=${element.x},${element.y}`);
  let text = lines.join('\n');
  if (text.length > MAX_DOM_BYTES) text = `${text.slice(0, MAX_DOM_BYTES)}\n[TRUNCATED]`;
  return text;
}

function digest(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return `${text.length}:${hash.toString(16)}`;
}

// Resolves a handle from the CURRENT scan to its live element, or throws. There is no selector
// fallback: an unknown, stale (earlier scan) or collected handle is refused.
function resolveHandle(handle) {
  const ref = typeof handle === 'string' ? scanHandles.get(handle) : undefined;
  if (!ref) throw new Error('Refused: the target handle is not from the current page scan');
  const element = ref.deref();
  if (!element) throw new Error('Refused: the target element no longer exists');
  return element;
}

async function executeAction(action) {
  const needsTarget = action.action === 'click' || action.action === 'type';
  let target = null;
  if (needsTarget) {
    target = resolveHandle(action.handle);
    const { classifyClickTarget, isKnownTier, stricterTier, tierRank } = await getOpTier();
    // Cursor animation first: it awaits, so everything that decides whether to act runs after it,
    // synchronously, with no await between the checks and the action.
    if (target.isConnected) {
      const rect = rectOf(target);
      await visualizer?.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    const refusal = liveTargetRefusal(target);
    if (refusal) throw new Error(`Refused: ${refusal}`);
    // Re-derive the tier from the live element. If the page changed it into something stricter
    // than what was planned (and approved), do nothing and report it so the worker can prompt.
    const clickTier = classifyClickTarget(tierDescriptor(target));
    const liveTier = action.action === 'type' ? stricterTier('state-changing', clickTier) : clickTier;
    if (!isKnownTier(action.plannedTier) || tierRank(liveTier) > tierRank(action.plannedTier)) {
      return { tierEscalated: true, liveTier, plannedTier: action.plannedTier ?? null };
    }
  }
  if (action.action === 'click') {
    // No synthetic pointerover/pointerdown/pointerup before the click: a page listener on those
    // events could rewire the target between the checks above and click(). click() runs directly
    // after the checks.
    target.click();
    visualizer?.pulse();
  } else if (action.action === 'type') {
    const rawValue = action.value || '';
    const value = rehydrate(rawValue); // throws on an unknown or ambiguous token
    target.focus();
    visualizer?.type(target, maskDisplay(rawValue, value), 40 + Math.round(Math.random() * 20));
    const setter = Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value')?.set;
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (action.action === 'scroll') {
    window.scrollBy({ top: Number(action.value) || 300, behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 600));
  } else if (action.action === 'wait') {
    await new Promise((resolve) => setTimeout(resolve, Math.min(Number(action.value) || 2000, 10000)));
  } else if (action.action === 'finish') {
    tokenMap.clear();
  } else {
    throw new Error(`Unsupported action: ${action.action}`);
  }
  await new Promise((resolve) => setTimeout(resolve, action.action === 'click' ? 250 : 120));
  return { digest: digest(document.body?.innerText || ''), elementCount: document.querySelectorAll('button,input,select,textarea,a[href],[role="button"]').length, changed: true };
}

function rectOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

// Replace every TYPE#n token (and, when unambiguous, the <mask-pii/> alias)
// in `value` with its vault entry. An unknown token is REFUSED outright: it
// is never typed as an empty string or as the literal token text, per
// finding R4-E8 in ROAST.md, which is exactly the silent-blank path this
// function must not reintroduce.
function rehydrate(value) {
  if (!value) return '';
  let working = value;

  if (working.includes(MASK_ALIAS)) {
    if (tokenMap.size !== 1) {
      throw new Error(`Ambiguous <mask-pii/> alias: vault holds ${tokenMap.size} value(s); the model must use a numbered token (e.g. EMAIL#1)`);
    }
    const aliasValue = tokenMap.values().next().value;
    working = working.split(MASK_ALIAS).join(aliasValue);
  }

  return working.replace(VAULT_TOKEN_PATTERN, (token) => {
    if (!tokenMap.has(token)) {
      throw new Error(`No local value for masked token "${token}"; refusing to type`);
    }
    return tokenMap.get(token);
  });
}

// Display text for the typing-indicator overlay: plain text when nothing was
// substituted (rawValue === value, so the typed text carried no vault
// token), bullets sized to the real value when it did. Never shows the real
// value or the literal token text for a substituted field.
function maskDisplay(rawValue, value) {
  if (rawValue === value) return rawValue || '';
  return '*'.repeat(Math.min(value.length, 18));
}

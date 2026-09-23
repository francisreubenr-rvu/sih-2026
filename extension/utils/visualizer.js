// DHRISTI execution visualizer (content script, IIFE).
// Renders a mouse-highlight and a typing indicator in an isolated, CSP-safe
// overlay. Exposes window.__dhristiVisualizer. Never moves the OS pointer.
(() => {
  'use strict';
  if (window.__dhristiVisualizer) return;

  const PURPLE = 'rgba(139, 92, 246, 0.38)';
  const PURPLE_RING = 'rgba(139, 92, 246, 0.65)';
  const RADIUS = 20;
  const Z_INDEX = '2147483647';
  const PII_TOKEN = '<mask-pii/>';

  const state = { mouse: true, typing: true };
  let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let moveRaf = 0;
  let typeToken = 0;
  let cursorAnim = null;

  // ---- isolated subtree: closed shadow root keeps host-page CSS out ----
  const host = document.createElement('div');
  host.setAttribute('data-dhristi-visualizer', '');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:' + Z_INDEX + ';';
  const shadow = host.attachShadow({ mode: 'closed' });

  const mouse = document.createElement('div');
  mouse.style.cssText = [
    'position:absolute', 'top:0', 'left:0',
    'width:' + (RADIUS * 2) + 'px', 'height:' + (RADIUS * 2) + 'px',
    'margin:' + (-RADIUS) + 'px 0 0 ' + (-RADIUS) + 'px',
    'border-radius:50%', 'background:' + PURPLE,
    'box-shadow:0 0 0 1px ' + PURPLE_RING,
    'opacity:0', 'pointer-events:none', 'will-change:transform,opacity'
  ].join(';');

  const typing = document.createElement('div');
  typing.style.cssText = [
    'position:absolute', 'display:none', 'max-width:280px',
    'padding:6px 8px', 'border-radius:8px',
    'background:#111820', 'color:#e6edf3', 'border:1px solid #223140',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
    'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'white-space:pre-wrap', 'word-break:break-word', 'pointer-events:none'
  ].join(';');

  shadow.append(mouse, typing);
  (document.documentElement || document.body).append(host);

  // ---- helpers ----
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function showMouse() { mouse.style.opacity = '1'; }
  function hideMouse() { mouse.style.opacity = '0'; }
  function setMousePos(x, y) {
    mouse.style.left = Math.round(x) + 'px';
    mouse.style.top = Math.round(y) + 'px';
  }

  // ---- mouse highlight ----
  function move(x, y, duration = 380) {
    if (!state.mouse) return Promise.resolve();
    cancelAnimationFrame(moveRaf);
    const from = { x: mousePos.x, y: mousePos.y };
    const to = {
      x: clamp(Number(x) || 0, 0, window.innerWidth),
      y: clamp(Number(y) || 0, 0, window.innerHeight)
    };
    const ms = clamp(Number(duration) || 380, 300, 500);
    const start = performance.now();
    showMouse();
    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min((now - start) / ms, 1);
        const eased = easeInOutQuad(t);
        setMousePos(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
        if (t < 1) {
          moveRaf = requestAnimationFrame(tick);
        } else {
          mousePos = { x: to.x, y: to.y };
          resolve();
        }
      };
      moveRaf = requestAnimationFrame(tick);
    });
  }

  function pulse() {
    if (!state.mouse || typeof mouse.animate !== 'function') return;
    mouse.animate(
      [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }],
      { duration: 200, easing: 'ease-out' }
    );
  }

  // ---- typing indicator ----
  function isPii(element, displayValue) {
    if (element) {
      const type = (element.getAttribute('type') || '').toLowerCase();
      const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
      if (type === 'password' || autocomplete.includes('password') || autocomplete.includes('cc-') || autocomplete.includes('card')) return true;
    }
    return typeof displayValue === 'string' && displayValue.includes(PII_TOKEN);
  }

  function maskValue(element, displayValue) {
    let len = 0;
    if (element && element.value != null) len = String(element.value).length;
    if (!len) len = String(displayValue).replace(/<mask-pii\/>/g, '').length;
    if (!len) len = 8;
    return '*'.repeat(Math.max(1, Math.min(len, 18)));
  }

  function positionTyping(element) {
    const rect = element.getBoundingClientRect();
    const gap = 8;
    let top = rect.top - 42;
    if (top < gap) top = rect.bottom + gap;
    const left = clamp(rect.left, gap, Math.max(gap, window.innerWidth - 288));
    typing.style.left = Math.round(left) + 'px';
    typing.style.top = Math.round(top) + 'px';
  }

  async function type(element, displayValue, delay = 45) {
    if (!state.typing || !element || displayValue == null) return;
    const token = ++typeToken;
    const pii = isPii(element, displayValue);
    const shown = pii ? maskValue(element, displayValue) : String(displayValue);
    const step = Math.max(1, Number(delay) || 45);

    positionTyping(element);
    typing.style.display = 'block';
    typing.textContent = '';

    const textNode = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.textContent = '▏';
    cursor.style.cssText = 'color:#8b5cf6;';
    typing.append(textNode, cursor);
    if (typeof cursor.animate === 'function') {
      cursorAnim = cursor.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 530, iterations: Infinity, direction: 'alternate' }
      );
    }

    for (let i = 0; i < shown.length; i += 1) {
      if (token !== typeToken) return;
      textNode.data = shown.slice(0, i + 1);
      await sleep(step);
    }
    if (token !== typeToken) return;
    await sleep(650);
    if (token === typeToken) hideTyping();
  }

  function hideTyping() {
    typeToken += 1;
    if (cursorAnim) { cursorAnim.cancel(); cursorAnim = null; }
    typing.textContent = '';
    typing.style.display = 'none';
  }

  // ---- toggles ----
  function setEnabled({ mouse: m, typing: t }) {
    if (typeof m === 'boolean') {
      state.mouse = m;
      if (!m) hideMouse();
    }
    if (typeof t === 'boolean') {
      state.typing = t;
      if (!t) hideTyping();
    }
  }

  function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['showMouse', 'showTypingIndicator'], (result) => {
          if (chrome.runtime.lastError) return;
          state.mouse = result.showMouse !== false;
          state.typing = result.showTypingIndicator !== false;
          if (!state.mouse) hideMouse();
          if (!state.typing) hideTyping();
        });
      }
    } catch (error) { /* storage unavailable */ }
  }

  function watchSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          if (changes.showMouse) {
            state.mouse = changes.showMouse.newValue !== false;
            if (!state.mouse) hideMouse();
          }
          if (changes.showTypingIndicator) {
            state.typing = changes.showTypingIndicator.newValue !== false;
            if (!state.typing) hideTyping();
          }
        });
      }
    } catch (error) { /* storage unavailable */ }
  }

  const api = { move, pulse, type, hideTyping, setEnabled };
  Object.defineProperty(api, 'enabled', {
    get() { return { mouse: state.mouse, typing: state.typing }; },
    enumerable: true
  });

  window.__dhristiVisualizer = api;
  loadSettings();
  watchSettings();
})();

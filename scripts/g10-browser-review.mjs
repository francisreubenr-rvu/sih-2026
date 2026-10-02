// G10 browser review: responsive layout, 200% zoom, reduced motion and keyboard focus on every
// current product surface. Writes Benchmarks/results/browser-review-v5.json and screenshots.
//
//   node scripts/g10-browser-review.mjs [--out Benchmarks/results/g10-browser-review]
//
// Surfaces: Website/index.html, the v5 side panel (extension/sidepanel.html, loaded as a real
// extension page), the Prototype MV3 popup, and the Prototype operator pages (served by
// `node Prototype/server/index.mjs`, started here on port 9041). Synthetic fixtures and test pages
// are not product surfaces and are left out.
//
// What each check means:
//   reflow      at 320x720, 390x844, 1440x900 and 844x390 (landscape): no page-level horizontal
//               scroll, no element whose text is cut off by overflow hidden/clip, every visible
//               interactive element inside the viewport width.
//   zoom 200%   a 1280x900 window at 200% browser zoom lays out as a 640x450 CSS px viewport at
//               device pixel ratio 2; that is emulated here and checked like reflow. (Playwright
//               cannot press the browser zoom control; the layout effect is the same.)
//   motion      with prefers-reduced-motion: reduce, no animation or transition longer than 0.1 s
//               keeps running, and no media autoplays with sound.
//   keyboard    Tab from the top until focus returns to the start (max 250 stops): every stop shows
//               a focus indicator (outline, box-shadow or border differs from the unfocused state),
//               no stop traps focus, and every visible enabled control was reached.
// Screen reader, cognitive and content review are out of scope (G09).

import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', join(ROOT, 'Benchmarks/results/g10-browser-review'));
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '320', width: 320, height: 720 },
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'zoom200-of-1280x900', width: 640, height: 450, deviceScaleFactor: 2 },
];

// Static server for Website/ (the page uses relative assets).
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt' };
function serve(dir, port) {
  return createServer((q, r) => {
    const path = join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!path.startsWith(dir) || !existsSync(path)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }); r.end(readFileSync(path));
  }).listen(port, '127.0.0.1');
}

// ---- in-page probes -------------------------------------------------------------------------
const reflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  const out = { innerWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, horizontalScroll: document.documentElement.scrollWidth > vw + 1,
    clipped: [], offscreenControls: [] };
  const visible = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[hidden],[aria-hidden="true"]'); };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const isVisuallyHidden = (el) => { const r = el.getBoundingClientRect(); return r.width <= 1 || r.height <= 1; };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || isVisuallyHidden(el)) continue;
    const s = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText && ['hidden', 'clip'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 2) {
      out.clipped.push({ el: label(el), text: el.textContent.trim().slice(0, 60), ellipsis: s.textOverflow === 'ellipsis', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  for (const el of document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')) {
    if (!visible(el) || el.disabled) continue;
    const r = el.getBoundingClientRect();
    let p = el.parentElement, inScroller = false;
    while (p && p !== document.body) { const ps = getComputedStyle(p); if (/(auto|scroll)/.test(ps.overflowX) && p.scrollWidth > p.clientWidth + 1) { inScroller = true; break; } p = p.parentElement; }
    if ((r.right > vw + 1 || r.left < -1) && !inScroller) out.offscreenControls.push({ el: label(el), text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
  }
  return out;
};

const motionProbe = () => {
  const running = document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
    const t = a.effect?.getTiming?.() || {};
    const target = a.effect?.target;
    return { name: a.animationName || a.transitionProperty || a.constructor.name, duration: t.duration, iterations: t.iterations,
      target: target ? `${target.tagName?.toLowerCase()}${target.id ? '#' + target.id : ''}` : null };
  });
  const long = running.filter((a) => (typeof a.duration === 'number' && a.duration > 100) || a.iterations === Infinity);
  const media = [...document.querySelectorAll('video,audio')].map((m) => ({ tag: m.tagName.toLowerCase(), autoplay: m.autoplay, muted: m.muted, paused: m.paused, controls: m.controls }));
  return { runningAnimations: running.length, longOrInfinite: long, autoplayWithSound: media.filter((m) => m.autoplay && !m.muted), media,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches };
};

const focusStyle = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  return { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow, border: `${s.borderTopColor} ${s.borderTopWidth}`, bg: s.backgroundColor };
};

async function keyboardWalk(page) {
  // Start from a fresh load with nothing focused: a click would move the focus starting point past
  // the first links (skip link).
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [];
  const seen = new Map();
  const repeats = {};
  let trap = null;
  for (let i = 0; i < 250; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const key = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:${[...document.querySelectorAll(el.tagName)].indexOf(el)}`;
      return { key, tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50) };
    });
    if (!info) { if (stops.length) break; continue; }
    const focused = await page.evaluate(focusStyle);
    // The same element without focus, for comparison: blur, read, then put focus back. Not for media
    // and iframes: re-focusing them restarts Tab at their first inner control.
    const unfocused = ['video', 'audio', 'iframe'].includes(info.tag) ? focused : await page.evaluate(() => { const el = document.activeElement; el.blur(); const s = getComputedStyle(el);
      const r = { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow, border: `${s.borderTopColor} ${s.borderTopWidth}`, bg: s.backgroundColor };
      el.focus({ focusVisible: true }); return r; });
    const delegated = ['video', 'audio', 'iframe'].includes(info.tag); // focus ring drawn inside; checked by hand
    const visibleIndicator = delegated || !!focused && (
      (!/^none/.test(focused.outline) && !/ 0px /.test(focused.outline) && focused.outline !== unfocused.outline)
      || (focused.shadow !== 'none' && focused.shadow !== unfocused.shadow)
      || focused.border !== unfocused.border || focused.bg !== unfocused.bg);
    if (seen.has(info.key)) {
      const last = stops[stops.length - 1];
      if (last && last.key === info.key) {
        // Native media controls and iframes take several Tab presses inside one element.
        if (['video', 'audio', 'iframe'].includes(info.tag) && (repeats[info.key] = (repeats[info.key] || 0) + 1) < 25) continue;
        trap = info.key; break;
      }
      break; // wrapped around to an element already visited
    }
    seen.set(info.key, true);
    stops.push({ ...info, visibleIndicator, delegated });
  }
  const reachable = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      const closedDetails = el.closest('details:not([open])'); const inClosed = closedDetails && !(el.tagName === 'SUMMARY' && el.parentElement === closedDetails);
      return !el.disabled && el.getAttribute('tabindex') !== '-1' && !inClosed && s.visibility !== 'hidden' && s.display !== 'none' && r.width > 1 && r.height > 1 && !el.closest('[hidden],[inert],[aria-hidden="true"]'); })
    .map((el) => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:${[...document.querySelectorAll(el.tagName)].indexOf(el)}`));
  const missed = reachable.filter((k) => !seen.has(k));
  return { stops: stops.length, withoutVisibleIndicator: stops.filter((s) => !s.visibleIndicator), trap, notReached: missed };
}

// ---- run ------------------------------------------------------------------------------------
const proto = spawn('node', ['server/index.mjs'], { cwd: join(ROOT, 'Prototype'), env: { ...process.env, PORT: '9041', OLLAMA_URL: 'http://127.0.0.1:9' }, stdio: 'ignore' });
const web = serve(join(ROOT, 'Website'), 8811);
const popupSrv = serve(join(ROOT, 'Prototype/extension'), 8812);
for (let i = 0; i < 40; i += 1) { try { await fetch('http://127.0.0.1:9041/'); break; } catch { await sleep(250); } }

const ext = join(OUT, '.ext');
rmSync(ext, { recursive: true, force: true });
cpSync(join(ROOT, 'extension'), ext, { recursive: true });
const ctx = await chromium.launchPersistentContext('', { executablePath: CHROME, headless: false,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const SURFACES = [
  { id: 'website', url: 'http://127.0.0.1:8811/index.html' },
  { id: 'sidepanel', url: `chrome-extension://${extId}/sidepanel.html`, note: 'Warden not running: the panel shows its unreachable state' },
  { id: 'prototype-popup', url: 'http://127.0.0.1:8812/popup.html', note: 'Served over HTTP, outside an extension context' },
  ...['index', 'operations', 'task-loop', 'validation', 'local-reference', 'benchmark', 'text-benchmark', 'text-preview']
    .map((p) => ({ id: `prototype-${p}`, url: `http://127.0.0.1:9041/app/${p}.html` })),
];

const results = [];
for (const s of SURFACES) {
  const entry = { surface: s.id, url: s.url.replace(extId, '<extension-id>'), note: s.note, viewports: {}, motion: null, keyboard: {} };
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    const client = await ctx.newCDPSession(page);
    await client.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor || 1, mobile: false });
    await page.goto(s.url, { waitUntil: 'load' });
    // Lazy images never load in a full-page screenshot that does not scroll; load them so the
    // screenshot shows the real layout.
    await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('img[loading="lazy"]')];
      imgs.forEach((i) => { i.loading = 'eager'; });
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
    });
    await sleep(900);
    const r = await page.evaluate(reflowProbe);
    await page.screenshot({ path: join(OUT, `${s.id}-${v.name}.png`), fullPage: true }).catch(() => {});
    entry.viewports[v.name] = { ...r, pass: !r.horizontalScroll && r.clipped.filter((c) => !c.ellipsis).length === 0 && r.offscreenControls.length === 0 };
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.detach();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(s.url, { waitUntil: 'load' });
  await sleep(1500);
  entry.motion = await page.evaluate(motionProbe);
  entry.motion.pass = entry.motion.longOrInfinite.length === 0 && entry.motion.autoplayWithSound.length === 0;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const v of [VIEWPORTS[1], VIEWPORTS[2]]) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto(s.url, { waitUntil: 'load' });
    await sleep(700);
    const k = await keyboardWalk(page);
    entry.keyboard[v.name] = { ...k, pass: k.stops > 0 && k.withoutVisibleIndicator.length === 0 && !k.trap && k.notReached.length === 0 };
  }
  entry.pageErrors = errors;
  entry.pass = Object.values(entry.viewports).every((x) => x.pass) && entry.motion.pass && Object.values(entry.keyboard).every((x) => x.pass);
  console.log(`${s.id}: ${entry.pass ? 'PASS' : 'FAIL'} | reflow ${Object.entries(entry.viewports).map(([n, x]) => `${n}:${x.pass ? 'ok' : 'X'}`).join(' ')} | motion ${entry.motion.pass ? 'ok' : 'X'} | keyboard ${Object.entries(entry.keyboard).map(([n, x]) => `${n}:${x.pass ? 'ok' : 'X'}(${x.stops})`).join(' ')}`);
  results.push(entry);
  await page.close();
}
await ctx.close();
proto.kill('SIGTERM'); web.close(); popupSrv.close();
rmSync(ext, { recursive: true, force: true });

const doc = {
  id: 'browser-review-v5', date: new Date().toISOString().slice(0, 10), harness: 'scripts/g10-browser-review.mjs',
  browser: 'Chromium (Playwright, headless=new) on Linux', viewports: VIEWPORTS,
  zoom_method: '200% browser zoom of a 1280x900 window emulated as a 640x450 CSS px viewport at device pixel ratio 2',
  surfaces: results, all_pass: results.every((r) => r.pass),
  not_covered: ['Screen reader and cognitive review (G09)', 'Real browser zoom control (emulated by viewport, see zoom_method)',
    'Firefox and Safari', 'Side panel with a live run in its transcript (reviewed in its idle and unreachable states)'],
};
writeFileSync(join(ROOT, 'Benchmarks/results/browser-review-v5.json'), JSON.stringify(doc, null, 1) + '\n');
console.log(`all_pass: ${doc.all_pass}`);

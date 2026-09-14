/**
 * Wave7: axe-core + keyboard Tab order + WCAG 1.4.12 text-spacing + lang EN/HI
 * + viewport reflow notes for Website and extension popup.
 * G09/G10 stay unknown without full criterion-level + AT review.
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { writeFile, mkdir, copyFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { readFile as rf, stat as st } from 'node:fs/promises';
import { extname as extn } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/accessibility.json');
const browserReviewPath = join(root, 'Benchmarks/results/browser-review.json');
const chrome = process.env.SIGHTLINE_CHROMIUM
  || (existsSync(join(process.env.HOME || '', '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'))
    ? join(process.env.HOME || '', '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')
    : '/usr/bin/google-chrome');

const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

async function ensureProto() {
  const origin = 'http://127.0.0.1:9041';
  try {
    const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1500) });
    if (r.ok) return { origin, child: null };
  } catch { /* */ }
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.mjs'], {
    cwd: join(root, 'Prototype'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '9041', HOST: '127.0.0.1' },
  });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const r = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1000) });
      if (r.ok) return { origin, child };
    } catch { /* */ }
  }
  child.kill('SIGTERM');
  return { origin, child: null, failed: true };
}

async function ensureAxeLocal() {
  const localAxe = join(root, 'Prototype/bench-assets/axe.min.js');
  if (existsSync(localAxe)) return localAxe;
  await mkdir(dirname(localAxe), { recursive: true });
  const r = await fetch(AXE_CDN, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`axe download failed: ${r.status}`);
  await writeFile(localAxe, Buffer.from(await r.arrayBuffer()));
  return localAxe;
}

async function runAxe(page, url, { scriptUrl = null, path = null } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.addStyleTag({ content: '.reveal-ready{opacity:1!important;transform:none!important}' }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.reveal-ready').forEach(el => el.classList.add('is-visible'));
  }).catch(() => {});
  try {
    if (scriptUrl) await page.addScriptTag({ url: scriptUrl });
    else if (path) await page.addScriptTag({ path });
  } catch (e) {
    return { url, error: `axe inject failed: ${e.message}`, violations: null };
  }
  const result = await page.evaluate(async () => {
    const r = await axe.run(document, { resultTypes: ['violations', 'passes', 'incomplete'] });
    return {
      violations: r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
        html: v.nodes.slice(0, 3).map(n => n.html?.slice(0, 120)),
      })),
      passes: r.passes.length,
      incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })),
      incomplete_count: r.incomplete.length,
    };
  });
  return { url, ...result };
}

async function keyboardProbe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const order = [];
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const tag = el.tagName.toLowerCase();
      const id = el.id || '';
      const role = el.getAttribute('role') || '';
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60);
      const outline = getComputedStyle(el).outlineStyle;
      return { tag, id, role, label, hasVisibleFocusHint: outline !== 'none' && outline !== '' };
    });
    if (info) order.push(info);
  }
  const unique = new Set(order.map(o => `${o.tag}#${o.id}:${o.label}`));
  return {
    url,
    tab_stops_sampled: order.length,
    unique_focusable_reached: unique.size,
    first_five: order.slice(0, 5),
    note: 'Automated Tab sampling; not a full keyboard traversal or AT proof.',
  };
}

async function textSpacingProbe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // WCAG 1.4.12 Text Spacing values
  const result = await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'wave7-text-spacing';
    style.textContent = `*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important}p,li,h1,h2,h3,h4,label,button,a,span{padding-inline:0.5ch!important}`;
    document.head.appendChild(style);
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(doc.scrollWidth, body?.scrollWidth || 0) > Math.ceil(window.innerWidth) + 2;
    // Check a few text nodes still have non-zero client rects
    const samples = [...document.querySelectorAll('h1,h2,p,button,label')].slice(0, 8).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 40),
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      clipped: el.scrollWidth > el.clientWidth + 2,
    }));
    return {
      method: 'wcag_1_4_12_text_spacing_override',
      horizontal_overflow: overflowX,
      samples,
      note: 'CSS override approximation of 1.4.12; not a full criterion-level pass.',
    };
  });
  return { url, ...result };
}

async function langProbe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  const base = await page.evaluate(() => ({
    htmlLang: document.documentElement.lang || '',
    hi_lang_nodes: [...document.querySelectorAll('[lang="hi"]')].map(el => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 40),
    })),
    site_lang_toggle: !!document.getElementById('site-lang-en'),
    has_popup_lang: !!document.getElementById('lang-hi'),
  }));
  let switched = null;
  if (await page.$('#site-lang-hi')) {
    await page.click('#site-lang-hi');
    await page.waitForTimeout(50);
    switched = await page.evaluate(() => ({
      kind: 'website',
      htmlLangAfterHi: document.documentElement.lang,
      hiPressed: document.getElementById('site-lang-hi')?.getAttribute('aria-pressed'),
      enPressed: document.getElementById('site-lang-en')?.getAttribute('aria-pressed'),
      hiAriaLabel: document.getElementById('site-lang-hi')?.getAttribute('aria-label'),
      enAriaLabel: document.getElementById('site-lang-en')?.getAttribute('aria-label'),
      trustEnHidden: document.getElementById('trust-en')?.hidden === true,
    }));
    await page.click('#site-lang-en').catch(() => {});
  } else if (await page.$('#lang-hi')) {
    await page.click('#lang-hi');
    await page.waitForTimeout(50);
    switched = await page.evaluate(() => ({
      kind: 'popup',
      htmlLangAfterHi: document.documentElement.lang,
      hiPressed: document.getElementById('lang-hi')?.getAttribute('aria-pressed'),
      enPressed: document.getElementById('lang-en')?.getAttribute('aria-pressed'),
      hiAriaLabel: document.getElementById('lang-hi')?.getAttribute('aria-label'),
      enAriaLabel: document.getElementById('lang-en')?.getAttribute('aria-label'),
    }));
    await page.click('#lang-en').catch(() => {});
  }
  return { url, ...base, lang_switch: switched };
}

async function zoomOverflowProbe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const result = await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(doc.scrollWidth, body?.scrollWidth || 0) > Math.ceil(window.innerWidth) + 1;
    const overflowY = Math.max(doc.scrollHeight, body?.scrollHeight || 0) > Math.ceil(window.innerHeight) + 1;
    return {
      method: 'css_zoom_200_percent_approximation',
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
      horizontal_overflow: overflowX,
      vertical_overflow_informational: overflowY,
      note: 'CSS zoom is an approximation of 200% browser zoom; not a full WCAG 1.4.4 proof.',
    };
  });
  return { url, ...result };
}

async function viewportReflow(page, url, widths = [320, 390, 1440]) {
  const rows = [];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        innerWidth: window.innerWidth,
        scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
        horizontal_overflow: Math.max(doc.scrollWidth, body?.scrollWidth || 0) > Math.ceil(window.innerWidth) + 1,
      };
    });
    rows.push({ width: w, ...r });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  return { url, viewports: rows };
}

const proto = await ensureProto();

// Serve extension-build over HTTP so type=module popup.js can run (file:// CORS blocks it).
const extRoot = existsSync(join(root, 'Prototype/extension-build/popup.html'))
  ? join(root, 'Prototype/extension-build')
  : join(root, 'Prototype/extension');
const extServer = createHttpServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = join(extRoot, rel === '/' ? '/popup.html' : rel);
    if (!file.startsWith(extRoot) || !(await st(file)).isFile()) { res.writeHead(404); return res.end('nf'); }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' }[extn(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(await rf(file));
  } catch { res.writeHead(500); res.end('err'); }
});
await new Promise(r => extServer.listen(0, '127.0.0.1', r));
const extOrigin = `http://127.0.0.1:${extServer.address().port}`;

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
await page.emulateMedia({ colorScheme: 'light' });
const localAxe = await ensureAxeLocal();

const targets = [];
const website = 'file://' + join(root, 'Website/index.html');
targets.push(await runAxe(page, website, { path: localAxe }));

const popupSrc = existsSync(join(root, 'Prototype/extension-build/popup.html'))
  ? join(root, 'Prototype/extension-build/popup.html')
  : join(root, 'Prototype/extension/popup.html');
targets.push(await runAxe(page, 'file://' + popupSrc, { path: localAxe }));
targets.push(await runAxe(page, extOrigin + '/popup.html', { path: localAxe }));

if (!proto.failed) {
  const benchDir = join(root, 'Prototype/app/bench-assets');
  await mkdir(benchDir, { recursive: true });
  if (!existsSync(join(benchDir, 'axe.min.js'))) {
    await copyFile(localAxe, join(benchDir, 'axe.min.js'));
  }
  const axeSameOrigin = proto.origin + '/app/bench-assets/axe.min.js';
  targets.push(await runAxe(page, proto.origin + '/', { scriptUrl: axeSameOrigin }));
  targets.push(await runAxe(page, proto.origin + '/app/fixture.html', { scriptUrl: axeSameOrigin }));
}

const zoomProbes = [];
zoomProbes.push(await zoomOverflowProbe(page, website));
zoomProbes.push(await zoomOverflowProbe(page, 'file://' + popupSrc));
zoomProbes.push(await zoomOverflowProbe(page, extOrigin + '/popup.html'));

const keyboard = [];
keyboard.push(await keyboardProbe(page, website));
keyboard.push(await keyboardProbe(page, extOrigin + '/popup.html'));

const textSpacing = [];
textSpacing.push(await textSpacingProbe(page, website));
textSpacing.push(await textSpacingProbe(page, extOrigin + '/popup.html'));

const langs = [];
langs.push(await langProbe(page, website));
langs.push(await langProbe(page, extOrigin + '/popup.html'));

const reflow = [];
reflow.push(await viewportReflow(page, website));
reflow.push(await viewportReflow(page, extOrigin + '/popup.html'));

await browser.close();
extServer.close();
if (proto.child) {
  proto.child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
}

const clearFailures = [];
for (const t of targets) {
  if (t.violations?.length) {
    for (const v of t.violations) {
      if (v.impact === 'critical' || v.impact === 'serious') {
        clearFailures.push({ url: t.url, ...v });
      }
    }
  }
}

const criterionPartial = [
  { id: '1.1.1', name: 'Non-text Content', status: 'partial', note: 'Decorative aperture aria-hidden; meaningful images have labels where present' },
  { id: '1.3.1', name: 'Info and Relationships', status: 'partial', note: 'Semantic landmarks/headings present; axe landmarked' },
  { id: '1.4.3', name: 'Contrast (Minimum)', status: 'partial', note: 'axe color-contrast; DigiLocker navy/paper tuned' },
  { id: '1.4.4', name: 'Resize text', status: 'partial', note: 'CSS zoom 200% approx only' },
  { id: '1.4.10', name: 'Reflow', status: 'partial', note: '320/390/1440 viewport overflow probes' },
  { id: '1.4.12', name: 'Text Spacing', status: 'partial', note: 'CSS override probe recorded' },
  { id: '2.1.1', name: 'Keyboard', status: 'partial', note: 'Tab sampling on Website + popup; not full traversal' },
  { id: '2.4.1', name: 'Bypass Blocks', status: 'partial', note: 'Skip link on Website' },
  { id: '2.4.7', name: 'Focus Visible', status: 'partial', note: 'focus-visible outlines present' },
  { id: '3.1.1', name: 'Language of Page', status: 'partial', note: 'html lang + EN/HI switch sets documentElement.lang on popup; Website toggle' },
  { id: '3.1.2', name: 'Language of Parts', status: 'partial', note: 'lang=hi on Hindi trust strings' },
  { id: '4.1.2', name: 'Name Role Value', status: 'partial', note: 'aria-pressed on lang/architecture controls; labels on inputs' },
];

const record = {
  name: 'wave7-axe-keyboard-spacing-lang',
  generatedAt: new Date().toISOString(),
  tool: 'axe-core 4.10.2 via local inject in Chromium + Playwright Tab/text-spacing/lang probes',
  scope: 'Automated axe subset + keyboard sampling + text-spacing override + lang EN/HI + CSS-zoom + viewport reflow. Not WCAG 2.1 AA criterion-level conformance. Not screen-reader evidence.',
  targets,
  zoom_200_approximation: zoomProbes,
  keyboard_tab_sampling: keyboard,
  text_spacing_1_4_12: textSpacing,
  lang_en_hi: langs,
  viewport_reflow: reflow,
  clear_serious_or_critical_failures: clearFailures,
  criterion_partial_checklist: criterionPartial,
  g09_acceptance: {
    required: 'All applicable WCAG 2.1 A/AA criteria documented and checked; no known blocker',
    status: 'unknown',
    reason: 'Wave7 enriched axe + keyboard + text-spacing + lang EN/HI + reflow. Full criterion-level manual + real AT review still required. Do not mark G09 pass from axe alone.',
  },
  g10_notes: {
    status: 'unknown',
    reason: 'Wave7: CSS zoom 200% + 320/390/1440 reflow + reduced-motion CSS present. Native browser 200% zoom / complete motion-safety / AT still incomplete.',
  },
  related: ['Docs/accessibility-review.md', 'Benchmarks/results/browser-review.json'],
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');

let review = {};
try { review = JSON.parse(await readFile(browserReviewPath, 'utf8')); } catch { /* */ }
review.wave = 7;
review.date = '2026-09-14';
review.zoom_200_percent = { status: 'approximate_css_zoom_only', probes: zoomProbes };
review.viewport_reflow = reflow;
review.text_spacing = textSpacing;
review.keyboard_tab_sampling = keyboard;
review.lang_en_hi = langs;
review.g10_status = 'unknown';
review.extension_popup_axe = targets.find(t => /popup\.html/.test(t.url || '')) || null;
await writeFile(browserReviewPath, JSON.stringify(review, null, 2) + '\n');

console.log(JSON.stringify({
  wrote: outPath,
  targets: targets.map(t => ({
    url: t.url,
    violations: t.violations?.length ?? t.error,
    passes: t.passes,
    incomplete: t.incomplete_count ?? t.incomplete?.length,
  })),
  clear_failures: clearFailures.length,
  g09: 'unknown',
  g10: 'unknown',
}, null, 2));

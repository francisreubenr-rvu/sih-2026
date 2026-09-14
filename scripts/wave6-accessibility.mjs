/**
 * Wave6: axe-core on Website + prototype pages + extension popup HTML.
 * Also records a bounded 200% zoom document-overflow probe for G10 notes.
 * G09/G10 stay unknown without full WCAG criterion-level + AT review.
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { writeFile, mkdir, copyFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/accessibility.json');
const browserReviewPath = join(root, 'Benchmarks/results/browser-review.json');
const chrome = process.env.DHRISTI_CHROMIUM
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
  // Reveal-on-scroll starts at opacity:0; force visible so contrast checks are meaningful.
  await page.addStyleTag({ content: '.reveal-ready{opacity:1!important;transform:none!important}' }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.reveal-ready').forEach(el => el.classList.add('is-visible'));
  }).catch(() => {});
  try {
    if (scriptUrl) await page.addScriptTag({ url: scriptUrl });
    else if (path) await page.addScriptTag({ path });
    else await page.addScriptTag({ path: await ensureAxeLocal() });
  } catch (e) {
    return { url, error: `axe inject failed: ${e.message}`, violations: null };
  }
  const result = await page.evaluate(async () => {
    const r = await axe.run(document, { resultTypes: ['violations', 'passes', 'incomplete'] });
    return {
      violations: r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
      })),
      passes: r.passes.length,
      incomplete: r.incomplete.length,
    };
  });
  return { url, ...result };
}

async function zoomOverflowProbe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Approximate 200% text zoom via CSS zoom (not identical to browser text-only zoom).
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

const proto = await ensureProto();
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

if (!proto.failed) {
  // Serve axe from same origin when possible
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

await browser.close();
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

const record = {
  name: 'wave6-axe-probe',
  generatedAt: new Date().toISOString(),
  tool: 'axe-core 4.10.2 via local inject in Chromium',
  scope: 'Automated axe subset + CSS-zoom approximation. Not WCAG 2.1 AA criterion-level conformance. Not screen-reader evidence.',
  targets,
  zoom_200_approximation: zoomProbes,
  clear_serious_or_critical_failures: clearFailures,
  g09_acceptance: {
    required: 'All applicable WCAG 2.1 A/AA criteria documented and checked; no known blocker',
    status: 'unknown',
    reason: 'axe + popup surface + zoom approximation recorded. Full criterion-level manual + AT review still required. Do not mark G09 pass from axe alone.',
  },
  g10_notes: {
    status: 'unknown',
    reason: 'CSS zoom 200% approximation recorded for Website + extension popup. Native browser 200% zoom / complete motion-safety still incomplete.',
  },
  related: ['Docs/accessibility-review.md', 'Benchmarks/results/browser-review.json'],
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');

// Enrich browser-review.json without inventing a G10 pass
let review = {};
try { review = JSON.parse(await readFile(browserReviewPath, 'utf8')); } catch { /* */ }
review.wave = 6;
review.date = '2026-09-14';
review.zoom_200_percent = {
  status: 'approximate_css_zoom_only',
  probes: zoomProbes,
};
review.g10_status = 'unknown';
review.extension_popup_axe = targets.find(t => /popup\.html/.test(t.url || '')) || null;
await writeFile(browserReviewPath, JSON.stringify(review, null, 2) + '\n');

console.log(JSON.stringify({
  wrote: outPath,
  targets: targets.map(t => ({
    url: t.url,
    violations: t.violations?.length ?? t.error,
    passes: t.passes,
  })),
  clear_failures: clearFailures.length,
  g09: 'unknown',
  g10: 'unknown',
}, null, 2));

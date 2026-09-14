/**
 * Wave5: axe-core automated accessibility probe on Website + prototype fixture.
 * Injects axe from CDN in Chromium. Writes Benchmarks/results/accessibility.json.
 * Does NOT claim WCAG 2.1 AA conformance (G09 stays unknown without criterion-level manual review).
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/accessibility.json');
const chrome = process.env.SIGHTLINE_CHROMIUM
  || (existsSync(join(process.env.HOME || '', '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'))
    ? join(process.env.HOME || '', '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome')
    : '/usr/bin/google-chrome');

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
  const { writeFile } = await import('node:fs/promises');
  await writeFile(localAxe, Buffer.from(await r.arrayBuffer()));
  return localAxe;
}

const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

async function runAxe(page, url, { scriptUrl = null } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    if (scriptUrl) await page.addScriptTag({ url: scriptUrl });
    else {
      const localAxe = await ensureAxeLocal();
      await page.addScriptTag({ path: localAxe });
    }
  } catch (e) {
    return { url, error: `axe inject failed: ${e.message}`, violations: null };
  }
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
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

const proto = await ensureProto();
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();

const targets = [];
// Static website via file URL
const website = 'file://' + join(root, 'Website/index.html');
targets.push(await runAxe(page, website));
if (!proto.failed) {
  const axeSameOrigin = proto.origin + '/app/bench-assets/axe.min.js';
  targets.push(await runAxe(page, proto.origin + '/', { scriptUrl: axeSameOrigin }));
  targets.push(await runAxe(page, proto.origin + '/app/fixture.html', { scriptUrl: axeSameOrigin }));
}

await browser.close();
if (proto.child) {
  proto.child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
}

const record = {
  name: 'wave5-axe-probe',
  generatedAt: new Date().toISOString(),
  tool: 'axe-core 4.10.2 via CDN inject in Chromium',
  scope: 'Automated axe subset only. Not WCAG 2.1 AA criterion-level conformance. Not screen-reader evidence.',
  targets,
  g09_acceptance: {
    required: 'All applicable WCAG 2.1 A/AA criteria documented and checked; no known blocker',
    status: 'unknown',
    reason: 'axe probe recorded. Full criterion-level manual + AT review still required. Do not mark G09 pass from axe alone.',
  },
  related: ['Docs/accessibility-review.md', 'Benchmarks/results/lighthouse-sightline-v02-summary.json'],
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  wrote: outPath,
  targets: targets.map(t => ({
    url: t.url,
    violations: t.violations?.length ?? t.error,
    passes: t.passes,
  })),
  g09: 'unknown',
}, null, 2));

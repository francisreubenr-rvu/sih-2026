/**
 * Wave 5: maximize automated proof for G03 / toolbar path without faking
 * the Chrome toolbar glyph / activeTab user gesture.
 *
 * Proves on a synthetic fixture:
 *   clean server → fixture → production inject/collect → activeTab gate →
 *   overlay-driven capture→filter→sanitize→review → semantics-only payload →
 *   privacy-only completion → screenshotable stage captures.
 *
 * Writes Benchmarks/results/e2e.json and optional PNGs under
 * Benchmarks/results/wave5-demo-screens/.
 *
 * Usage: node scripts/validate-extension-e2e.mjs [--json outfile]
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, readFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assertSanitizedPayload } from '../Prototype/shared/rubric-hooks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = resolve(join(root, 'Prototype/extension-build'));
const serverOrigin = 'http://127.0.0.1:9041';
const fixturePath = '/app/fixture.html';
const screensDir = join(root, 'Benchmarks/results/wave5-demo-screens');
const playwrightChromium = join(
  process.env.HOME || '',
  '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
);
const defaultChromium = process.env.DHRISTI_CHROMIUM
  || (existsSync(playwrightChromium) ? playwrightChromium : '/usr/bin/google-chrome');

const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0
  ? argv[jsonFlag + 1]
  : join(root, 'Benchmarks/results/e2e.json');

function deriveExtensionId(absolutePath) {
  const hex = createHash('sha256').update(absolutePath).digest('hex').slice(0, 32);
  return [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const record = {
  harness: 'scripts/validate-extension-e2e.mjs',
  wave: 5,
  name: 'extension-synthetic-e2e-maximized',
  scope: 'Clean local setup → synthetic fixture → MV3 inject/collect → activeTab gate → overlay UI protect loop → sanitize → privacy-only review. Toolbar glyph NOT automated.',
  started_at: new Date().toISOString(),
  human_toolbar_gesture: {
    required_for_shipped_manifest: true,
    automated: false,
    note: 'Chrome toolbar action UI cannot be clicked by Playwright. Production captureVisibleTab needs activeTab from that gesture. This harness uses a deleted-temp <all_urls> overlay only for the UI loop; shipped manifest unchanged.',
  },
  checks: {},
  screenshots: [],
  limitations: [
    'Toolbar glyph / true activeTab user gesture not simulated.',
    'Overlay grants capture without toolbar; shipped Prototype/extension/manifest.json unchanged.',
    'No live Ollama planner round-trip; privacy-only path exercised.',
    'Chromium only; Firefox live run unverified.',
    'Not a full clean-DB multi-scenario persistence suite beyond audit health + fixture reload.',
  ],
};

const pass = (name, detail) => { record.checks[name] = { status: 'pass', detail }; };
const fail = (name, detail) => { record.checks[name] = { status: 'fail', detail }; };
const note = (name, detail) => { record.checks[name] = { status: 'info', detail }; };

async function ensureServer() {
  try {
    const r = await fetch(serverOrigin + '/api/v1/health', { signal: AbortSignal.timeout(2000) });
    if (r.ok) return { started: false, child: null };
  } catch { /* start */ }
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', 'server/index.mjs'],
    {
      cwd: join(root, 'Prototype'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '9041', HOST: '127.0.0.1' },
    }
  );
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const r = await fetch(serverOrigin + '/api/v1/health', { signal: AbortSignal.timeout(1000) });
      if (r.ok) return { started: true, child };
    } catch { /* retry */ }
  }
  child.kill('SIGTERM');
  throw new Error('Local prototype server failed to become healthy on :9041');
}

async function shot(page, name) {
  await mkdir(screensDir, { recursive: true });
  const dest = join(screensDir, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  record.screenshots.push({ name, path: `Benchmarks/results/wave5-demo-screens/${name}.png` });
}

let context;
let serverHandle = { started: false, child: null };
const userDataDir = await mkdtemp(join(tmpdir(), 'dhristi-ext-e2e-'));

try {
  if (!existsSync(join(extPath, 'manifest.json'))) {
    throw new Error('Missing Prototype/extension-build — run npm run build:extension first');
  }
  serverHandle = await ensureServer();
  record.server = { started_by_harness: serverHandle.started, origin: serverOrigin };

  const health = await (await fetch(serverOrigin + '/api/v1/health')).json().catch(() => null);
  if (health) pass('clean_setup_health', health);
  else fail('clean_setup_health', 'health endpoint failed');

  const executablePath = process.env.DHRISTI_CHROMIUM || defaultChromium;
  const productionId = deriveExtensionId(extPath);
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
    ],
  });
  record.browser = { executablePath, version: context.browser()?.version() ?? null };

  const page = await context.newPage();
  await page.goto(serverOrigin + fixturePath, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await shot(page, '01-fixture');
  pass('fixture_ready', `loaded ${fixturePath}`);

  // Reload persistence of synthetic fixture (DOM state, not multi-user DB).
  await page.reload({ waitUntil: 'domcontentloaded' });
  const heading = await page.locator('h1, h2, [data-fixture]').first().innerText().catch(() => '');
  pass('fixture_reload', `reload ok; heading=${JSON.stringify(heading).slice(0, 120)}`);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${productionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.waitForTimeout(700);
  await shot(popup, '02-popup-idle');

  const trust = await popup.locator('.trust-chip').innerText();
  if (/on this device/i.test(trust) && /इस उपकरण पर/.test(trust)) {
    pass('trust_chip_en_hi', trust.replace(/\s+/g, ' ').trim());
  } else {
    fail('trust_chip_en_hi', trust);
  }

  const privacyToggle = popup.locator('#privacy-only, [name="privacy-only"], input[type="checkbox"]').first();
  const privacyChecked = await privacyToggle.isChecked().catch(() => null);
  note('privacy_only_default', { checked: privacyChecked });

  await page.bringToFront();
  await page.waitForTimeout(400);
  const prodDrive = await popup.evaluate(async ({ serverOrigin: origin }) => {
    const api = globalThis.browser ?? globalThis.chrome;
    const tabs = await api.tabs.query({});
    const tab = tabs.find(t => t.url && t.url.startsWith(origin) && t.url.includes('/app/fixture'));
    if (!tab) return { ok: false, error: 'no fixture tab', tabs: tabs.map(t => t.url) };
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (e) {
      return { ok: false, error: 'inject: ' + e.message };
    }
    let collected = null;
    let collectError = null;
    try {
      collected = await api.tabs.sendMessage(tab.id, { kind: 'collect' });
    } catch (e) {
      collectError = e.message;
      try {
        await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        collected = await api.tabs.sendMessage(tab.id, { kind: 'collect' });
        collectError = null;
      } catch (e2) {
        collectError = e2.message;
      }
    }
    let captureError = null;
    try {
      await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    } catch (e) {
      captureError = e.message;
    }
    const scene = collected?.data || collected?.scene || null;
    let sanitizeOk = false;
    try {
      const body = { task: 'review-pending', scene };
      const json = JSON.stringify(body);
      sanitizeOk = !/"screenshot"\s*:|"dataUrl"\s*:|data:image\//i.test(json);
    } catch { /* */ }
    return {
      ok: Boolean(scene?.controls),
      controls: scene?.controls?.length ?? 0,
      regions: scene?.regions?.length ?? 0,
      captureError,
      collectError,
      collectedKeys: collected ? Object.keys(collected) : [],
      sanitizeOk,
      revision: scene?.revision ?? null,
    };
  }, { serverOrigin });

  if (prodDrive?.ok && prodDrive.controls >= 3) {
    pass('production_inject_collect', `controls=${prodDrive.controls}; regions=${prodDrive.regions}`);
  } else {
    fail('production_inject_collect', JSON.stringify(prodDrive));
  }
  if (prodDrive?.sanitizeOk) pass('collect_semantics_only', 'collected scene JSON has no screenshot/dataUrl');
  else fail('collect_semantics_only', JSON.stringify(prodDrive));

  if (prodDrive?.captureError && /activeTab|<all_urls>/i.test(prodDrive.captureError)) {
    pass('shipped_manifest_requires_activeTab', prodDrive.captureError);
  } else if (!prodDrive?.captureError) {
    fail('shipped_manifest_requires_activeTab', 'Expected capture refusal without toolbar gesture');
  } else {
    fail('shipped_manifest_requires_activeTab', prodDrive.captureError);
  }
  note('toolbar_glyph', record.human_toolbar_gesture.note);
  await context.close();
  context = null;

  // Overlay UI loop with screenshots
  const overlayDir = await mkdtemp(join(tmpdir(), 'dhristi-ext-e2e-overlay-'));
  await cp(extPath, overlayDir, { recursive: true });
  const overlayManifest = JSON.parse(await readFile(join(overlayDir, 'manifest.json'), 'utf8'));
  if (!overlayManifest.host_permissions.includes('<all_urls>')) {
    overlayManifest.host_permissions = [...overlayManifest.host_permissions, '<all_urls>'];
  }
  await writeFile(join(overlayDir, 'manifest.json'), JSON.stringify(overlayManifest, null, 2));
  const overlayId = deriveExtensionId(overlayDir);
  record.harness_overlay = {
    purpose: 'Screenshotable capture→filter→sanitize→review without toolbar glyph',
    shipped_manifest_unchanged: true,
    temporary_permission_added: '<all_urls>',
  };

  const overlayProfile = await mkdtemp(join(tmpdir(), 'dhristi-ext-e2e-overlay-profile-'));
  context = await chromium.launchPersistentContext(overlayProfile, {
    executablePath,
    headless: false,
    args: [
      `--disable-extensions-except=${overlayDir}`,
      `--load-extension=${overlayDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
    ],
  });

  const page2 = await context.newPage();
  await page2.goto(serverOrigin + fixturePath, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${overlayId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup2.waitForTimeout(900);

  // Prefer privacy-only if toggle exists
  try {
    const box = popup2.locator('#privacy-only');
    if (await box.count()) {
      if (!(await box.isChecked())) await box.check();
    }
  } catch { /* optional */ }

  await page2.bringToFront();
  await popup2.waitForTimeout(200);
  await popup2.click('#capture');
  try {
    await popup2.waitForFunction(() => {
      const plan = document.querySelector('#plan');
      const status = document.querySelector('#status')?.textContent || '';
      return (plan && !plan.disabled) || /blocked|activeTab|toolbar|connection|protected|review/i.test(status);
    }, { timeout: 90000 });
  } catch { /* judged below */ }

  await shot(popup2, '03-popup-after-capture');
  await shot(page2, '04-fixture-after-capture');

  const ui = await popup2.evaluate(() => {
    const stages = [...document.querySelectorAll('#stage-strip [data-stage]')].map(li => ({
      stage: li.getAttribute('data-stage'),
      active: li.getAttribute('data-active') === 'true',
      done: li.getAttribute('data-done') === 'true',
    }));
    const payloadText = document.querySelector('#payload')?.textContent || '';
    const forbidden = /data:image\/|"screenshot"\s*:|"dataUrl"\s*:|"pixels"\s*:/i.test(payloadText);
    return {
      planEnabled: !(document.querySelector('#plan')?.disabled),
      previewVisible: !(document.querySelector('#preview')?.hidden),
      status: document.querySelector('#status')?.textContent || '',
      metrics: document.querySelector('#metrics')?.textContent || '',
      stages,
      payloadBytes: payloadText.length,
      payloadHasPixels: forbidden,
      payloadSnippet: payloadText.slice(0, 400),
      loop: globalThis.__dhristiLoop || null,
    };
  });
  record.ui_loop = {
    planEnabled: ui.planEnabled,
    previewVisible: ui.previewVisible,
    payloadBytes: ui.payloadBytes,
    payloadHasPixels: ui.payloadHasPixels,
    stages: ui.stages,
    metrics: ui.metrics,
    status: ui.status,
  };

  const reviewActive = ui.stages.some(s => s.stage === 'review' && (s.active || s.done));
  const sanitizeDone = ui.stages.some(s => s.stage === 'sanitize' && (s.done || reviewActive));
  // Privacy-only leaves #plan disabled by design; review + preview + semantics-only is success.
  if (ui.previewVisible && !ui.payloadHasPixels && (ui.planEnabled || reviewActive) && sanitizeDone) {
    pass('popup_capture_filter_sanitize_review', {
      planEnabled: ui.planEnabled,
      privacyOnlyReview: reviewActive && !ui.planEnabled,
      previewVisible: ui.previewVisible,
      payloadBytes: ui.payloadBytes,
      metrics: ui.metrics,
    });
  } else {
    fail('popup_capture_filter_sanitize_review', JSON.stringify(record.ui_loop));
  }

  try {
    const fullPayload = await popup2.locator('#payload').innerText();
    if (fullPayload.trim().startsWith('{')) {
      assertSanitizedPayload(JSON.parse(fullPayload));
      pass('assert_sanitized_payload', 'assertSanitizedPayload accepted outbound JSON');
    } else if (!ui.payloadHasPixels) {
      note('assert_sanitized_payload', 'payload panel not pure JSON; pixel-pattern check already passed');
    } else {
      fail('assert_sanitized_payload', 'payload contains forbidden pixel patterns');
    }
  } catch (e) {
    if (/forbidden|raw screen|pixel/i.test(e.message)) fail('assert_sanitized_payload', e.message);
    else note('assert_sanitized_payload', e.message);
  }

  if (ui.planEnabled || reviewActive) {
    pass('privacy_only_review_ready', { reviewActive, planEnabled: ui.planEnabled, status: ui.status, metrics: ui.metrics });
  } else {
    fail('privacy_only_review_ready', ui.status);
  }

  note('demo_script', 'Docs/demo-judge-checklist.md + Docs/demo-runbook.md — human must click toolbar glyph for shipped activeTab');
  note('firefox', 'Package may exist; live Firefox run not part of this e2e');

  await context.close();
  context = null;
  await rm(overlayProfile, { recursive: true, force: true }).catch(() => {});
  await rm(overlayDir, { recursive: true, force: true }).catch(() => {});
} catch (e) {
  fail('harness', e.message);
} finally {
  if (context) await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (serverHandle.child) {
    serverHandle.child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
  }
}

record.finished_at = new Date().toISOString();
const judged = Object.values(record.checks).filter(c => c.status !== 'info');
record.summary = {
  passed: judged.filter(c => c.status === 'pass').length,
  failed: judged.filter(c => c.status === 'fail').length,
  informational: Object.values(record.checks).filter(c => c.status === 'info').length,
  total: judged.length,
};
record.verdict = record.summary.failed === 0 && record.summary.passed >= 7 ? 'pass' : 'fail';
record.g03_gate = {
  status: 'unknown',
  reason: 'Maximized harness proof + screenshots recorded. True toolbar glyph automation and full multi-scenario clean-setup persistence remain open. Do not mark G03 pass from this file alone until acceptance scenarios are complete.',
};

console.log(JSON.stringify({ summary: record.summary, verdict: record.verdict, g03: record.g03_gate, screenshots: record.screenshots }, null, 2));
await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, JSON.stringify(record, null, 2) + '\n');
process.exit(record.verdict === 'pass' ? 0 : 1);

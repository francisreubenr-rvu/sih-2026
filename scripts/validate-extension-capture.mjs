/**
 * Wave 2: drive chrome.scripting.executeScript + tabs.sendMessage +
 * tabs.captureVisibleTab from the extension origin against a host-permission
 * matching tab (http://127.0.0.1:9041). Builds a sanitized semantic payload and
 * asserts no raw pixels leave in the JSON body.
 *
 * Scope honesty:
 * - Chromium only (Playwright persistent context + unpacked MV3).
 * - Popup is still opened as an extension document, not via the toolbar glyph.
 *   activeTab user-gesture is therefore not simulated; capture relies on
 *   host_permissions matching the fixture tab URL.
 * - Firefox is not exercised (see firefox_path in the record).
 * - Does not run a live Ollama planner round-trip.
 *
 * Usage: node scripts/validate-extension-capture.mjs [--json outfile]
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, readFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = resolve(join(root, 'Prototype/extension-build'));
const serverOrigin = 'http://127.0.0.1:9041';
const fixturePath = '/app/fixture.html';
const playwrightChromium = join(
  process.env.HOME || '',
  '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
);
const defaultChromium = process.env.SIGHTLINE_CHROMIUM
  || (existsSync(playwrightChromium) ? playwrightChromium : '/usr/bin/google-chrome');

const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0
  ? argv[jsonFlag + 1]
  : join(root, 'Benchmarks/results/extension-capture-v01.json');

function deriveExtensionId(absolutePath) {
  const hex = createHash('sha256').update(absolutePath).digest('hex').slice(0, 32);
  return [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const record = {
  harness: 'scripts/validate-extension-capture.mjs',
  wave: 2,
  scope: 'Chromium MV3: production injection path + captureVisibleTab on host-permission tab + sanitized payload',
  started_at: new Date().toISOString(),
  extension_path: 'Prototype/extension-build',
  server_origin: serverOrigin,
  fixture: serverOrigin + fixturePath,
  checks: {},
  console_errors: [],
  page_errors: [],
  firefox_path: {
    status: 'unverified',
    shipped: ['Prototype/extension-build/manifest.firefox.json', 'browser ?? chrome polyfill in popup/content'],
    browser_binary: null,
    note: 'Firefox binary not exercised in this harness. Do not claim cross-browser extension readiness.',
  },
  limitations: [
    'Popup opened as chrome-extension:// document, not via toolbar action UI — activeTab user gesture is not simulated.',
    'Production captureVisibleTab requires activeTab from the toolbar action; harness proves the refusal, then re-runs with a temporary <all_urls> overlay (shipped manifest unchanged).',
    'No pairing-token planner / Ollama round-trip in this harness.',
    'Not a PII-accuracy or full-flow <200ms measurement.',
    'Chromium only.',
  ],
};

const pass = (name, detail) => { record.checks[name] = { status: 'pass', detail }; };
const fail = (name, detail) => { record.checks[name] = { status: 'fail', detail }; };
const note = (name, detail) => { record.checks[name] = { status: 'info', detail }; };

function findChromium() {
  return process.env.SIGHTLINE_CHROMIUM || defaultChromium;
}

async function ensureServer() {
  try {
    const r = await fetch(serverOrigin + '/api/v1/health', { signal: AbortSignal.timeout(2000) });
    if (r.ok) return { started: false, child: null };
  } catch { /* start below */ }
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', 'server/index.mjs'],
    {
      cwd: join(root, 'Prototype'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '9041', HOST: '127.0.0.1' },
    }
  );
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const r = await fetch(serverOrigin + '/api/v1/health', { signal: AbortSignal.timeout(1000) });
      if (r.ok) { ready = true; break; }
    } catch { /* retry */ }
  }
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error('Local prototype server failed to become healthy on :9041');
  }
  return { started: true, child };
}

const userDataDir = await mkdtemp(join(tmpdir(), 'sightline-ext-cap-'));
let context;
let serverHandle = { started: false, child: null };

try {
  serverHandle = await ensureServer();
  record.server = { started_by_harness: serverHandle.started, origin: serverOrigin };

  const executablePath = findChromium();
  const manifestOnDisk = JSON.parse(await readFile(join(extPath, 'manifest.json'), 'utf8'));
  const derivedId = deriveExtensionId(extPath);
  record.extension_id = derivedId;

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

  // 1. Fixture tab on host_permissions origin
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') record.console_errors.push(m.text()); });
  page.on('pageerror', e => record.page_errors.push(e.message));
  const fixtureResp = await page.goto(serverOrigin + fixturePath, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (fixtureResp && fixtureResp.ok()) {
    const labels = await page.$$eval('button', bs => bs.map(b => b.textContent.trim()));
    pass('fixture_tab_ready', `GET ${fixturePath} -> ${fixtureResp.status()}; buttons=${JSON.stringify(labels)}`);
  } else {
    fail('fixture_tab_ready', `Fixture returned ${fixtureResp ? fixtureResp.status() : 'no response'}`);
  }

  // 2. Popup document (extension origin)
  const popup = await context.newPage();
  popup.on('console', m => { if (m.type() === 'error') record.console_errors.push('popup: ' + m.text()); });
  popup.on('pageerror', e => record.page_errors.push('popup: ' + e.message));
  const popupResp = await popup.goto(`chrome-extension://${derivedId}/popup.html`, { waitUntil: 'domcontentloaded' });
  if (popupResp && popupResp.ok()) {
    await popup.waitForTimeout(800);
    pass('popup_document_loaded', `popup.html -> ${popupResp.status()}; title=${JSON.stringify(await popup.title())}`);
  } else {
    fail('popup_document_loaded', `popup.html returned ${popupResp ? popupResp.status() : 'no response'}`);
  }

  // 3–6. From extension origin: production inject + collect; attempt captureVisibleTab;
  // always build a semantics-only payload (capture bytes never included).
  const drive = await popup.evaluate(async ({ serverOrigin: origin }) => {
    const api = globalThis.browser ?? globalThis.chrome;
    const out = { steps: {} };
    try {
      const tabs = await api.tabs.query({});
      const tab = tabs.find(t => t.url && t.url.startsWith(origin) && t.url.includes('/app/fixture'));
      out.steps.tab_query = { ok: Boolean(tab), tabCount: tabs.length, matchedUrl: tab?.url || null, tabId: tab?.id ?? null };
      if (!tab) return out;

      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      out.steps.execute_script = { ok: true };

      const collected = await api.tabs.sendMessage(tab.id, { kind: 'collect' });
      out.steps.send_message_collect = {
        ok: Boolean(collected?.data),
        error: collected?.error || null,
        controls: collected?.data?.controls?.length ?? null,
        revision: collected?.data?.revision ?? null,
        regions: collected?.data?.regions?.length ?? null,
        viewport: collected?.data?.viewport ?? null,
        labels: (collected?.data?.controls || []).map(c => c.label),
      };
      if (!collected?.data) return out;

      // Semantics-only outbound body — never attach capture bytes.
      const scene = {
        scheme: 'sightline-semantic-v1',
        revision: collected.data.revision,
        viewport: collected.data.viewport,
        controls: collected.data.controls,
        regions: collected.data.regions,
      };
      const body = { task: 'review-pending', scene };
      const json = JSON.stringify(body);
      const forbidden = /"screenshot"\s*:|"dataUrl"\s*:|data:image\/|"pixels"\s*:|"html"\s*:|"url"\s*:/i.test(json)
        || Boolean(body.screenshot || body.dataUrl || body.scene?.pixels);
      out.steps.sanitized_payload = {
        ok: !forbidden && !json.includes('data:image'),
        bytes: json.length,
        controlLabels: body.scene.controls.map(c => c.label),
        includesCaptureBytes: json.includes('data:image'),
      };

      await api.tabs.update(tab.id, { active: true });
      try {
        const t0 = performance.now();
        const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        const captureMs = performance.now() - t0;
        out.steps.capture_visible_tab = {
          ok: typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png'),
          prefix: typeof dataUrl === 'string' ? dataUrl.slice(0, 22) : null,
          byteLengthApprox: typeof dataUrl === 'string' ? dataUrl.length : 0,
          captureMs,
          includedInOutboundJson: false,
        };
      } catch (capErr) {
        out.steps.capture_visible_tab = {
          ok: false,
          error: capErr.message,
          note: 'Production manifest uses activeTab; without a toolbar user gesture Chrome refuses captureVisibleTab even with host_permissions.',
        };
      }

      out.ok = Boolean(out.steps.sanitized_payload?.ok);
      return out;
    } catch (e) {
      out.error = e.message;
      out.ok = false;
      return out;
    }
  }, { serverOrigin });

  record.drive = {
    ok: drive?.ok === true,
    error: drive?.error || null,
    steps: drive?.steps || {},
  };

  if (drive?.steps?.tab_query?.ok) pass('host_permission_tab_found', `tab ${drive.steps.tab_query.tabId} url=${drive.steps.tab_query.matchedUrl}`);
  else fail('host_permission_tab_found', JSON.stringify(drive?.steps?.tab_query || drive?.error));

  if (drive?.steps?.execute_script?.ok) pass('production_execute_script', 'chrome.scripting.executeScript injected content.js into the fixture tab');
  else fail('production_execute_script', drive?.error || 'executeScript did not report ok');

  const collect = drive?.steps?.send_message_collect;
  if (collect?.ok && collect.controls >= 3) {
    pass('tabs_send_message_collect', `revision=${collect.revision}, controls=${collect.controls}, labels=${JSON.stringify(collect.labels)}`);
  } else {
    fail('tabs_send_message_collect', JSON.stringify(collect || drive?.error));
  }

  const san = drive?.steps?.sanitized_payload;
  if (san?.ok && san.includesCaptureBytes === false) {
    pass('sanitized_payload_excludes_pixels', `semantics JSON ${san.bytes} bytes; capture bytes excluded`);
  } else {
    fail('sanitized_payload_excludes_pixels', JSON.stringify(san || drive?.error));
  }

  const cap = drive?.steps?.capture_visible_tab;
  if (cap?.ok) {
    pass('capture_visible_tab_production_manifest', `png data URL length≈${cap.byteLengthApprox}, captureMs=${cap.captureMs}`);
  } else if (cap?.error && /activeTab|<all_urls>/i.test(cap.error)) {
    // Expected without toolbar gesture — prove the permission gate, then overlay below.
    pass('capture_visible_tab_requires_activeTab', `Production manifest correctly refused capture without toolbar gesture: ${cap.error}`);
  } else {
    fail('capture_visible_tab_production_manifest', JSON.stringify(cap || drive?.error));
  }

  note('toolbar_action_ui', 'Toolbar glyph not driven. Production capture path depends on activeTab from user invoking the action.');
  note('firefox_unverified', record.firefox_path.note);

  if (manifestOnDisk.permissions?.includes('activeTab') && manifestOnDisk.host_permissions?.some(h => h.includes('127.0.0.1:9041'))) {
    pass('manifest_capture_permissions', 'activeTab + host_permissions for local server present (shipped; unchanged)');
  } else {
    fail('manifest_capture_permissions', 'Expected activeTab and 127.0.0.1:9041 host permission');
  }

  // --- Harness-only overlay: temporary <all_urls> to exercise captureVisibleTab API ---
  // Shipped Prototype/extension/manifest.json is NOT modified. Overlay lives in a temp dir.
  await context.close();
  context = null;

  const overlayDir = await mkdtemp(join(tmpdir(), 'sightline-ext-overlay-'));
  record.harness_overlay = {
    purpose: 'Exercise chrome.tabs.captureVisibleTab when activeTab user gesture cannot be simulated',
    shipped_manifest_unchanged: true,
    temporary_permission_added: '<all_urls>',
    path: overlayDir,
  };
  await cp(extPath, overlayDir, { recursive: true });
  const overlayManifest = JSON.parse(await readFile(join(overlayDir, 'manifest.json'), 'utf8'));
  if (!overlayManifest.host_permissions.includes('<all_urls>')) {
    overlayManifest.host_permissions = [...overlayManifest.host_permissions, '<all_urls>'];
  }
  await writeFile(join(overlayDir, 'manifest.json'), JSON.stringify(overlayManifest, null, 2));
  const overlayId = deriveExtensionId(overlayDir);
  record.harness_overlay.extension_id = overlayId;

  const overlayUserData = await mkdtemp(join(tmpdir(), 'sightline-ext-overlay-profile-'));
  context = await chromium.launchPersistentContext(overlayUserData, {
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
  await popup2.waitForTimeout(600);

  const overlayDrive = await popup2.evaluate(async ({ serverOrigin: origin }) => {
    const api = globalThis.browser ?? globalThis.chrome;
    const tabs = await api.tabs.query({});
    const tab = tabs.find(t => t.url && t.url.startsWith(origin) && t.url.includes('/app/fixture'));
    if (!tab) return { ok: false, error: 'no fixture tab' };
    await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const collected = await api.tabs.sendMessage(tab.id, { kind: 'collect' });
    await api.tabs.update(tab.id, { active: true });
    const t0 = performance.now();
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const captureMs = performance.now() - t0;
    const body = {
      task: 'review-pending',
      scene: {
        scheme: 'sightline-semantic-v1',
        revision: collected.data.revision,
        viewport: collected.data.viewport,
        controls: collected.data.controls,
        regions: collected.data.regions,
      },
    };
    const json = JSON.stringify(body);
    return {
      ok: typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png'),
      captureMs,
      byteLengthApprox: dataUrl.length,
      prefix: dataUrl.slice(0, 22),
      sanitizedOk: !json.includes('data:image') && !('screenshot' in body),
      outboundBytes: json.length,
      controls: collected.data.controls.length,
    };
  }, { serverOrigin });

  record.harness_overlay.result = overlayDrive;
  if (overlayDrive?.ok && overlayDrive.sanitizedOk) {
    pass('capture_visible_tab_harness_overlay', `png≈${overlayDrive.byteLengthApprox}B in ${overlayDrive.captureMs?.toFixed?.(1)}ms; outbound semantics ${overlayDrive.outboundBytes}B exclude capture bytes`);
  } else {
    fail('capture_visible_tab_harness_overlay', JSON.stringify(overlayDrive));
  }

  await context.close();
  context = null;
  await rm(overlayUserData, { recursive: true, force: true }).catch(() => {});
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
record.verdict = record.summary.failed === 0 && record.summary.passed >= 6 ? 'pass' : 'fail';

console.log(JSON.stringify(record, null, 2));
await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, JSON.stringify(record, null, 2) + '\n');
process.exit(record.verdict === 'pass' ? 0 : 1);

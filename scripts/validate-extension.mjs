/**
 * Native-extension validation harness.
 *
 * Loads the built unpacked MV3 extension into a throwaway Chromium profile and
 * verifies, from the browser itself, that the extension registers, injects and
 * can reach its declared local server.
 *
 * The operator's own Chrome profile is never touched: each run gets a fresh
 * temporary --user-data-dir which is deleted afterwards.
 *
 * The Sightline manifest declares no background service worker, so the
 * extension is popup-driven and Chromium exposes no service worker to wait on.
 * The extension id is derived from the unpacked path hash and then verified
 * against the browser rather than assumed.
 *
 * Usage: node scripts/validate-extension.mjs [--json <outfile>]
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = resolve(join(root, 'Prototype/extension-build'));
const serverOrigin = 'http://127.0.0.1:9041';
const defaultChromium = join(
  process.env.HOME,
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);

const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0 ? argv[jsonFlag + 1] : null;

/** Chrome derives an unpacked extension id from the absolute path: sha256, first
 *  16 bytes as hex, each nibble mapped 0-f -> a-p. */
function deriveExtensionId(absolutePath) {
  const hex = createHash('sha256').update(absolutePath).digest('hex').slice(0, 32);
  return [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const record = {
  harness: 'scripts/validate-extension.mjs',
  scope: 'native MV3 extension in a real Chromium browser',
  started_at: new Date().toISOString(),
  extension_path: 'Prototype/extension-build',
  server_origin: serverOrigin,
  extension_id_derivation: 'sha256(absolute extension path), first 32 hex chars, nibbles mapped 0-f -> a-p',
  checks: {},
  console_errors: [],
  page_errors: [],
  limitations: [
    'Chromium only. A Firefox manifest is shipped but Firefox is not exercised here.',
    'The popup is opened as an extension document, not through the toolbar action UI, so chrome.tabs.captureVisibleTab is not driven.',
    'No pairing token is read, printed or stored; the planner round-trip is not re-run in this harness.',
    'This proves extension load, content-script injection and host-permission reachability. It is not a PII-accuracy or performance measurement.',
    'Step 2 injects content.js with page.addScriptTag, which runs in the page\'s main world, not the isolated content-script world Chrome gives scripts injected by chrome.scripting.executeScript (the real production path). chrome.runtime is therefore absent here and content.js\'s own chrome.runtime.onMessage.addListener call throws after the controller is already registered; expect a page error naming "onMessage" every run. That call succeeds in production because the popup injects through chrome.scripting.executeScript, which this harness does not drive (see the captureVisibleTab limitation above).'
  ]
};

const pass = (name, detail) => { record.checks[name] = { status: 'pass', detail }; };
const fail = (name, detail) => { record.checks[name] = { status: 'fail', detail }; };
const note = (name, detail) => { record.checks[name] = { status: 'info', detail }; };

const userDataDir = await mkdtemp(join(tmpdir(), 'sightline-ext-'));
let context;
try {
  const executablePath = process.env.SIGHTLINE_CHROMIUM || defaultChromium;
  const manifestOnDisk = JSON.parse(await readFile(join(extPath, 'manifest.json'), 'utf8'));
  const derivedId = deriveExtensionId(extPath);
  record.extension_id = derivedId;

  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update'
    ]
  });
  record.browser = { executablePath, version: context.browser()?.version() ?? null };

  // The manifest has no background key, so nothing should be waiting to start.
  const declaredWorker = manifestOnDisk.background?.service_worker ?? null;
  if (declaredWorker) {
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      try { worker = await context.waitForEvent('serviceworker', { timeout: 15000 }); }
      catch { worker = null; }
    }
    if (worker) pass('background_service_worker', worker.url());
    else fail('background_service_worker', `Declared service_worker "${declaredWorker}" never started.`);
  } else {
    note('background_service_worker', 'No background key in the manifest. This extension is popup-driven; the content script is injected on demand with chrome.scripting.executeScript.');
  }

  const probe = await context.newPage();
  probe.on('console', m => { if (m.type() === 'error') record.console_errors.push(m.text()); });
  probe.on('pageerror', e => record.page_errors.push(e.message));

  // 1. Extension actually loaded, and the derived id is the right one.
  let liveManifest = null;
  try {
    const r = await probe.goto(`chrome-extension://${derivedId}/manifest.json`);
    if (r && r.ok()) {
      liveManifest = JSON.parse(await probe.evaluate(() => document.body.innerText));
      pass('extension_loaded', `chrome-extension://${derivedId}/manifest.json -> ${r.status()}`);
    } else {
      fail('extension_loaded', `manifest.json returned ${r ? r.status() : 'no response'}; the extension is not loaded or the derived id is wrong.`);
    }
  } catch (e) {
    fail('extension_loaded', e.message);
  }

  if (liveManifest) {
    const same = liveManifest.name === manifestOnDisk.name && liveManifest.version === manifestOnDisk.version;
    if (same) pass('manifest_parsed', `MV${liveManifest.manifest_version} "${liveManifest.name}" v${liveManifest.version} read from the browser`);
    else fail('manifest_parsed', `Browser manifest ${JSON.stringify(liveManifest.name)} v${liveManifest.version} does not match the built manifest.`);
  } else {
    fail('manifest_parsed', 'No manifest readable from the browser.');
  }

  // 2. Content script injects into an ordinary page and registers its controller.
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') record.console_errors.push(m.text()); });
  page.on('pageerror', e => record.page_errors.push(e.message));
  // Labels must come from the allow-list, otherwise the agent correctly refuses
  // to export them and the control count proves nothing.
  const fixtureHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body><h1>Pending request</h1><button id="approve">Pending</button><button id="next">Next</button><button id="reject">Cancel</button><input id="ref" value="SYNTH-0001"><p>Synthetic fixture. No real personal data.</p></body></html>';
  await page.goto('data:text/html,' + encodeURIComponent(fixtureHtml));
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.addScriptTag({ path: join(extPath, 'content.js') });
    const injected = await page.evaluate(() => Boolean(globalThis.__sightlineController));
    if (injected) {
      pass('content_script_injection', 'content.js executed in a real page and registered __sightlineController.');
      const collected = await page.evaluate(() => {
        try {
          const s = globalThis.__sightlineController.collect();
          return { ok: true, revision: s.revision, controls: s.controls.length, viewport: s.viewport };
        } catch (e) { return { ok: false, error: e.message }; }
      });
      if (!collected.ok) fail('collect_protected_scene', collected.error);
      else if (collected.controls !== 3) fail('collect_protected_scene', `Expected the 3 allow-listed controls, saw ${collected.controls}. The agent may be refusing valid labels.`);
      else pass('collect_protected_scene', `revision ${collected.revision}, ${collected.controls} allow-listed controls, viewport ${collected.viewport.width}x${collected.viewport.height}`);
    } else {
      fail('content_script_injection', 'content.js executed but registered no controller.');
      fail('collect_protected_scene', 'Skipped: no controller.');
    }
  } catch (e) {
    fail('content_script_injection', e.message);
    fail('collect_protected_scene', 'Skipped: injection failed.');
  }

  // 2b. The allow-list is a refusal, not a filter of convenience.
  try {
    const refused = await page.evaluate(() => {
      const injected = document.createElement('button');
      injected.id = 'arbitrary';
      injected.textContent = 'Approve transfer';
      document.body.appendChild(injected);
      const scene = globalThis.__sightlineController.collect();
      const exported = JSON.stringify(scene);
      return { controls: scene.controls.length, leaked: exported.includes('Approve transfer') };
    });
    if (refused.leaked) fail('unlisted_control_refused', 'An arbitrary control label reached the exported scene.');
    else pass('unlisted_control_refused', `Arbitrary label stayed out of the exported scene; ${refused.controls} allow-listed controls remained.`);
  } catch (e) {
    fail('unlisted_control_refused', e.message);
  }

  // 3. Popup document loads and its module bundle executes.
  const popup = await context.newPage();
  popup.on('console', m => { if (m.type() === 'error') record.console_errors.push('popup: ' + m.text()); });
  popup.on('pageerror', e => record.page_errors.push('popup: ' + e.message));
  try {
    const response = await popup.goto(`chrome-extension://${derivedId}/popup.html`);
    if (response && response.ok()) {
      await popup.waitForTimeout(1500);
      const title = await popup.title();
      const statusText = await popup.textContent('#status').catch(() => null);
      const origin = await popup.textContent('#origin').catch(() => null);
      const buttons = await popup.$$eval('button', bs => bs.map(b => b.textContent.trim()));
      pass('popup_loaded', `title=${JSON.stringify(title)}, #status=${JSON.stringify(statusText)}`);
      record.checks.popup_loaded.extension_origin = origin;
      record.checks.popup_loaded.buttons = buttons;
      const wired = buttons.includes('Capture & protect') && buttons.includes('Send protected layout');
      if (wired) pass('popup_module_executed', 'popup.js ran: module bundle executed and bound its controls.');
      else fail('popup_module_executed', `Unexpected controls: ${JSON.stringify(buttons)}`);
    } else {
      fail('popup_loaded', `popup.html returned ${response ? response.status() : 'no response'}`);
      fail('popup_module_executed', 'Skipped: popup did not load.');
    }
  } catch (e) {
    fail('popup_loaded', e.message);
    fail('popup_module_executed', 'Skipped: popup did not load.');
  }

  // 4. host_permissions: the extension origin may reach the declared server.
  // A stopped server is an environment fact, not an extension defect: record it
  // as skipped so a real host-permission failure is never masked by a dead port.
  let serverUp = false;
  try { serverUp = (await fetch(serverOrigin + '/api/v1/health', { signal: AbortSignal.timeout(3000) })).ok; }
  catch { serverUp = false; }
  if (!serverUp) {
    note('host_permission_reachable', `Skipped: no server answering on ${serverOrigin}. Start it with "cd Prototype && node --env-file-if-exists=.env server/index.mjs" and re-run.`);
  } else try {
    const reach = await popup.evaluate(async (origin) => {
      try {
        const r = await fetch(origin + '/api/v1/health');
        return { ok: r.ok, status: r.status, body: await r.json() };
      } catch (e) { return { ok: false, error: e.message }; }
    }, serverOrigin);
    if (reach.ok) pass('host_permission_reachable', `GET ${serverOrigin}/api/v1/health -> ${reach.status} ${JSON.stringify(reach.body)}`);
    else fail('host_permission_reachable', reach.error || `status ${reach.status}`);
  } catch (e) {
    fail('host_permission_reachable', e.message);
  }
} catch (e) {
  fail('harness', e.message);
} finally {
  if (context) await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

record.finished_at = new Date().toISOString();
const judged = Object.values(record.checks).filter(c => c.status !== 'info');
record.summary = {
  passed: judged.filter(c => c.status === 'pass').length,
  failed: judged.filter(c => c.status === 'fail').length,
  informational: Object.values(record.checks).filter(c => c.status === 'info').length,
  total: judged.length
};
record.verdict = record.summary.failed === 0 && record.summary.passed >= 6 ? 'pass' : 'fail';

console.log(JSON.stringify(record, null, 2));
if (jsonOut) {
  await mkdir(dirname(jsonOut), { recursive: true });
  await writeFile(jsonOut, JSON.stringify(record, null, 2) + '\n');
}
process.exit(record.verdict === 'pass' ? 0 : 1);

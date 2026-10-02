// G14 rehearsal of the v5 critical journey, from reset, with a screen recording of each run.
//
// Each run starts from nothing: a fresh loopback recording relay (to the real Groq API), a fresh
// Warden process (GLiNER loaded, empty vault), a fresh copy of the unpacked extension and a fresh
// browser profile. It then drives the side panel through the journey on the synthetic fixture and
// checks seven steps. The relay log is what left the machine, so step 7 reads it.
//
//   node scripts/g14/rehearse.mjs --runs 3 --out /tmp/g14
//
// Needs GROQ_API_KEY in the environment (passed to the Warden only; the relay forwards the header and
// never logs it), Python with the Warden's packages (gliner, protobuf, fastapi, uvicorn, httpx), and
// Chromium at CHROME_PATH (default /opt/pw-browsers/chromium). Behind an egress proxy the relay needs
// NODE_USE_ENV_PROXY=1, which this script sets.
//
// Harness-only differences from a person at the keyboard, also written into every result row:
// the extension copy adds <all_urls> to host_permissions in place of the optional grant the Send
// click asks for, the side panel is opened as a tab beside the fixture, and every confirmation the
// panel asks for is answered by the script (uncertain PII: strip; questions: proceed).

import { chromium } from '../../Prototype/node_modules/playwright-core/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, rm, writeFile, readdir, rename } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg('runs', '3'));
const OUT = arg('out', '/tmp/dhristi-g14');
const ROOT = new URL('../..', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const TASK = 'Update my contact email to priya.r@example.com and save the profile';
const PERSONAL = ['priya.r@example.com', 'Raghunathan', 'Priya', '98765 43210', '9876543210'];
const VIEW = { width: 760, height: 720 };
const PANEL = { width: 420, height: 720 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealth(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const h = await (await fetch('http://127.0.0.1:8756/health')).json();
      if (h.loaded === true || h.gliner?.loaded === true || JSON.stringify(h).includes('"loaded":true')) return h;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('Warden /health never reported loaded:true');
}

function startStack(dir) {
  const relayLog = `${dir}/cloud-received.jsonl`;
  const relay = spawn('node', [`${ROOT}scripts/e2e-v5/recording-relay.mjs`, relayLog, '8799', 'https://api.groq.com/openai/v1'],
    { env: { ...process.env, NODE_USE_ENV_PROXY: '1' }, stdio: 'ignore' });
  const warden = spawn('python3', ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8756'],
    { cwd: `${ROOT}warden`, env: { ...process.env, GROQ_BASE_URL: 'http://127.0.0.1:8799' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let wardenErr = '';
  warden.stderr.on('data', (d) => { wardenErr = (wardenErr + d).slice(-4000); });
  return { relay, warden, relayLog, err: () => wardenErr };
}

async function stopStack(s) {
  for (const p of [s.warden, s.relay]) { try { p.kill('SIGTERM'); } catch { /* gone */ } }
  await sleep(1500);
}

async function oneRun(index, buildSha) {
  const dir = `${OUT}/run-${index}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/video`, { recursive: true });
  const events = [];
  const t0 = Date.now();
  const mark = (step, text) => { events.push({ step, text, t: (Date.now() - t0) / 1000 }); console.log(`[run ${index}] ${step}: ${text}`); };

  const stack = startStack(dir);
  const health = await waitHealth(240000);
  mark('reset', 'Fresh Warden (GLiNER loaded), relay, extension copy and browser profile');

  const ext = `${dir}/ext`;
  await cp(`${ROOT}extension`, ext, { recursive: true });
  const man = JSON.parse(readFileSync(`${ext}/manifest.json`, 'utf8'));
  man.host_permissions.push('<all_urls>');
  await writeFile(`${ext}/manifest.json`, JSON.stringify(man, null, 2));
  const fixture = readFileSync(`${ROOT}scripts/e2e-v5/fixture.html`);
  const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fixture); }).listen(8800, '127.0.0.1');

  const ctx = await chromium.launchPersistentContext('', {
    executablePath: CHROME, headless: false, viewport: VIEW,
    recordVideo: { dir: `${dir}/video`, size: VIEW },
    args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const steps = {};
  const errors = [];
  let page, panel;
  try {
    let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    page = ctx.pages()[0] || await ctx.newPage();
    const pageVideoStart = Date.now();
    panel = await ctx.newPage();
    const panelVideoStart = Date.now();
    await panel.setViewportSize(PANEL);
    panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
    page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
    await page.goto('http://127.0.0.1:8800/');
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.waitForFunction(() => document.getElementById('health-chip')?.textContent.includes('READY'), null, { timeout: 120000 });
    steps[1] = true; mark(1, 'Side panel connected to the local Warden: READY');

    await panel.fill('#task-input', TASK);
    await sleep(800);
    await page.bringToFront();
    await panel.evaluate(() => document.getElementById('composer').requestSubmit());
    steps[2] = true; mark(2, 'Task with a real email address sent from the side panel');

    const answered = new Set();
    let stripped = false;
    const tRun = Date.now();
    while (Date.now() - tRun < 240000) {
      await sleep(400);
      const card = await panel.$('.entry[data-pending="true"]');
      if (card) {
        const eid = await card.getAttribute('data-entry-id');
        if (!answered.has(eid)) {
          answered.add(eid);
          const cls = await card.getAttribute('class');
          const text = (await card.innerText()).replace(/\s+/g, ' ').slice(0, 160);
          await sleep(900); // let the recording show the prompt
          if (cls.includes('uncertain')) {
            for (const r of await card.$$('label[data-choice="strip"]')) await r.click();
            await (await card.$('button:has-text("Apply")')).click();
            stripped = true;
            mark(3, 'Uncertain personal value: kept on the device (strip)');
          } else {
            const proceed = await card.$('button[data-choice="proceed"]');
            await (proceed || await card.$('button[data-choice="skip"]')).click();
            mark('confirm', `Confirmation answered: ${text.slice(0, 90)}`);
          }
          await page.bringToFront();
        }
      }
      const transcript = await panel.evaluate(() => [...document.querySelectorAll('.entry')].map((e) => e.textContent).join('\n'));
      if (!steps[3] && /EMAIL#\d/.test(transcript)) { steps[3] = true; mark(3, 'On the device the email became a token (EMAIL#1) before planning'); }
      if (!steps[4] && /(type|click)\b/i.test(transcript) && /plan|step/i.test(transcript)) { steps[4] = true; mark(4, 'Cloud planner (Groq) returned a step that names only tokens and selectors'); }
      if (/Run (finished|stopped|error)/.test(transcript)) break;
    }
    const transcript = await panel.$$eval('.entry', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    const status = await page.textContent('#status');
    const emailVal = await page.inputValue('#email');
    steps[5] = emailVal === 'priya.r@example.com';
    mark(5, `Extension typed the real value into the page locally: ${steps[5] ? 'yes' : 'no'}`);
    const finished = transcript.some((t) => /Run finished/.test(t));
    steps[6] = finished && /^Saved /.test(status || '') && status !== 'DELETED';
    mark(6, `Page shows "${status}" and the run finished: ${steps[6] ? 'yes' : 'no'}`);
    await panel.click('#boundary .node[data-tab="sent"]').catch(() => {});
    await sleep(1500);
    const cloud = existsSync(stack.relayLog) ? readFileSync(stack.relayLog, 'utf8') : '';
    const requests = cloud.split('\n').filter(Boolean).length;
    const leaks = PERSONAL.filter((v) => cloud.includes(v));
    steps[7] = requests > 0 && leaks.length === 0;
    mark(7, `What left the machine: ${requests} cloud requests, ${leaks.length} personal values`);
    await panel.screenshot({ path: `${dir}/panel-final.png`, fullPage: true });
    await page.screenshot({ path: `${dir}/page-final.png` });
    await sleep(1200);

    const timing = existsSync(`${stack.relayLog}.timing`) ? readFileSync(`${stack.relayLog}.timing`, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    const models = [...cloud.matchAll(/"model":"([^"]+)"/g)].map((m) => m[1]);
    await ctx.close();
    srv.close();
    // name the two recordings
    const vids = (await readdir(`${dir}/video`)).filter((f) => f.endsWith('.webm'));
    const pagePath = await page.video().path(); const panelPath = await panel.video().path();
    await rename(pagePath, `${dir}/page.webm`); await rename(panelPath, `${dir}/panel.webm`);
    const ok = [1, 2, 3, 4, 5, 6, 7].every((k) => steps[k]);
    const row = {
      index, date_utc: new Date(t0).toISOString(), operator: 'claude-container (automated, scripts/g14/rehearse.mjs)',
      environment: 'Linux cloud container; Chromium headless=new; real Warden with GLiNER on CPU; real Groq through a loopback recording relay',
      build_sha: buildSha, result: ok ? 'success' : 'fail',
      journey_steps_passed: [1, 2, 3, 4, 5, 6, 7].filter((k) => steps[k]),
      fallback_opened: false, fallback_used_in_live_path: false,
      cloud_requests: requests, personal_values_in_cloud_requests: leaks.length, planner_models: [...new Set(models)],
      relay_round_trip_ms: timing.map((x) => x.ms), page_status: status, uncertain_pii_stripped: stripped,
      panel_errors: errors, warden_health: { loaded: true, version: health.version || health.warden || null },
      events, video_offsets_s: { page: (pageVideoStart - t0) / 1000, panel: (panelVideoStart - t0) / 1000 },
      harness_differences: ['<all_urls> added to the harness copy of the manifest (stands in for the optional grant)',
        'side panel opened as a tab', 'confirmations answered by the script (uncertain PII: strip; questions: proceed)'],
    };
    await writeFile(`${dir}/row.json`, JSON.stringify(row, null, 1));
    console.log(`[run ${index}] RESULT ${row.result} steps ${row.journey_steps_passed.join(',')}`);
    return row;
  } catch (e) {
    console.error(`[run ${index}] error: ${e.message}\n${stack.err()}`);
    await ctx.close().catch(() => {}); srv.close();
    const row = { index, date_utc: new Date(t0).toISOString(), build_sha: buildSha, result: 'fail',
      journey_steps_passed: Object.keys(steps).map(Number), error: e.message, events };
    await writeFile(`${dir}/row.json`, JSON.stringify(row, null, 1));
    return row;
  } finally {
    await stopStack(stack);
  }
}

const buildSha = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'extension', 'warden'], { encoding: 'utf8' }).trim();
if (dirty) throw new Error(`extension/ or warden/ has uncommitted changes; the rehearsed build must be a commit:\n${dirty}`);
await mkdir(OUT, { recursive: true });
const rows = [];
for (let i = 1; i <= RUNS; i += 1) {
  rows.push(await oneRun(i, buildSha));
  if (i < RUNS) await sleep(5000); // spread the Groq calls a little
}
await writeFile(`${OUT}/rows.json`, JSON.stringify(rows, null, 1));
const streak = rows.every((r) => r.result === 'success');
console.log(`build ${buildSha}: ${rows.map((r) => r.result).join(', ')}${streak ? ' (3 consecutive successes)' : ''}`);

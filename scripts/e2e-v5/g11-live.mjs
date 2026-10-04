// G11 live measurement: the frozen core flow, run repeatedly in the real loaded extension against a
// real Warden (GLiNER) and the real planner, timed by the extension's own stage clocks
// (utils/g11-stage-clock.js, read with GET_G11_TRACE). Nothing is estimated: a stage the extension
// did not clock stays null.
//
// Frozen core flow (3 October 2026): on fixture-statements.html, the task "Open my account
// statements". The expected run is one navigational click and a finish, with no question to the
// person. A run that stops for a question is counted and reported but excluded from the timing
// distribution, since its wall time includes a human; a run that does not finish is a failure.
//
//   export WARDEN_PAIRING_SECRET=...   # same value the Warden was started with
//   node scripts/e2e-v5/g11-live.mjs   # G11_WARMUPS (10), G11_SAMPLES (100), G11_SLEEP_MS (1500)
//
// Writes Benchmarks/results/core-latency-v5-live-v01.json (or G11_OUT). The 200 ms budget is the
// ledger's and is never changed here.
import { chromium } from '../../Prototype/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const here = new URL('.', import.meta.url).pathname;
const repo = new URL('../../', import.meta.url).pathname;
const out = process.env.E2E_OUT || '/tmp/dhristi-g11-live/';
const WARMUPS = Number(process.env.G11_WARMUPS || 10);
const SAMPLES = Number(process.env.G11_SAMPLES || 100);
const SLEEP_MS = Number(process.env.G11_SLEEP_MS || 1500);
const OUT = process.env.G11_OUT || `${repo}Benchmarks/results/core-latency-v5-live-v01.json`;
const BUDGET_MS = 200;
const TASK = 'Open my account statements';
const FIXTURE = 'fixture-statements.html';

const pairing = process.env.WARDEN_PAIRING_SECRET;
if (!pairing) throw new Error('set WARDEN_PAIRING_SECRET to the value the Warden was started with');

await mkdir(out, { recursive: true });
const ext = `${out}ext`;
await rm(ext, { recursive: true, force: true });
await cp(`${repo}extension`, ext, { recursive: true });
const man = JSON.parse(readFileSync(`${ext}/manifest.json`, 'utf8'));
man.host_permissions.push('<all_urls>'); // harness-only: stands in for the optional grant a click gives
await writeFile(`${ext}/manifest.json`, JSON.stringify(man, null, 2));

const fixture = readFileSync(`${here}${FIXTURE}`);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fixture); }).listen(8800, '127.0.0.1');

const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', headless: false, viewport: { width: 1100, height: 760 },
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const page = ctx.pages()[0] || await ctx.newPage();
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 1000 });
await panel.goto(`chrome-extension://${id}/sidepanel.html`);
await panel.waitForSelector('#health-chip');
await panel.click('details.diagnostics > summary');
await panel.fill('#warden-pairing', pairing);
await panel.click('#warden-pairing-save');
await panel.waitForFunction(() => /proved the code/.test(document.getElementById('warden-pairing-status').textContent), null, { timeout: 30000 }).catch(async (e) => { console.error('pairing status:', await panel.textContent('#warden-pairing-status'), '| chip:', await panel.textContent('#health-chip')); throw e; });
await panel.waitForFunction(() => document.getElementById('health-chip').textContent.includes('READY'), null, { timeout: 300000 });
const health = await (await fetch('http://127.0.0.1:8756/health')).json();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function oneRun(index) {
  await page.goto('http://127.0.0.1:8800/');
  await page.bringToFront();
  const before = await panel.$$eval('.entry', (els) => els.length);
  await panel.fill('#task-input', TASK);
  await panel.evaluate(() => document.getElementById('composer').requestSubmit());
  const t0 = Date.now();
  let prompts = 0;
  const promptTexts = [];
  let outcome = 'timeout';
  while (Date.now() - t0 < 120000) {
    await sleep(100);
    const card = await panel.$('.entry[data-pending="true"]');
    if (card) {
      // A question is a person in the loop: answer it (strip / proceed) so the run can end, and
      // mark this attempt as not eligible for the machine-time distribution.
      prompts += 1;
      const kind = await card.getAttribute('class');
      promptTexts.push((await card.innerText()).replace(/\s+/g, ' ').slice(0, 200));
      if (kind.includes('uncertain')) {
        for (const li of await card.$$('li')) { const r = await li.$('label[data-choice="strip"]'); if (r) await r.click(); }
        await (await card.$('button:has-text("Apply")')).click();
      } else {
        const proceed = await card.$('button[data-choice="proceed"]');
        await (proceed || await card.$('button[data-choice="skip"]')).click();
      }
      await page.bringToFront();
      continue;
    }
    const tail = await panel.$$eval('.entry', (els, n) => els.slice(n).map((e) => e.textContent), before);
    const end = tail.find((t) => /Run (finished|stopped|error)/.test(t));
    if (end) { outcome = /Run finished/.test(end) ? 'finished' : /stopped/.test(end) ? 'stopped' : 'error'; break; }
  }
  const trace = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_G11_TRACE' }));
  const status = await page.textContent('#status');
  return {
    index, warmup: index < WARMUPS, outcome, prompts, promptTexts, harnessWallMs: Date.now() - t0,
    taskDone: /Showing account statements/.test(status || ''),
    stagesMs: trace?.stagesMs || null, terminal: trace?.terminal ?? null, reasons: trace?.reasons || {},
    steps: Array.isArray(trace?.f17Steps) ? trace.f17Steps.length : null,
  };
}

const attempts = [];
for (let i = 0; i < WARMUPS + SAMPLES; i += 1) {
  const a = await oneRun(i);
  attempts.push(a);
  console.log(`${a.warmup ? 'warm' : 'run '} ${i} ${a.outcome} prompts=${a.prompts} total=${a.stagesMs?.total?.toFixed?.(0)} plan=${a.stagesMs?.plan?.toFixed?.(0)} strip=${a.stagesMs?.strip?.toFixed?.(0)}`);
  await sleep(SLEEP_MS);
}

const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)].toFixed(1); };
const measured = attempts.filter((a) => !a.warmup);
const eligible = measured.filter((a) => a.outcome === 'finished' && a.prompts === 0 && a.taskDone && Number.isFinite(a.stagesMs?.total));
const stageStats = {};
for (const k of ['perceive', 'strip', 'plan', 'validate', 'f17_local_tier', 'execute', 'total']) {
  const xs = eligible.map((a) => a.stagesMs[k]).filter(Number.isFinite);
  stageStats[k] = { n: xs.length, p50Ms: pct(xs, 50), p95Ms: pct(xs, 95), maxMs: xs.length ? +Math.max(...xs).toFixed(1) : null };
}
const p95 = stageStats.total.p95Ms;
const enough = eligible.length >= 100;
const record = {
  name: 'core-latency-v5-live-v01',
  generatedAt: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD', { cwd: repo }).toString().trim(),
  surface: 'root extension (loaded, Chromium) + Warden on 127.0.0.1:8756 (GLiNER, pairing) + planner per /health',
  planner: { planner: health.planner, destination: health.destination, plannerModel: health.plannerModel, fastPath: health.fastPath, reviewer: health.reviewer },
  frozenFlow: { fixture: `scripts/e2e-v5/${FIXTURE}`, task: TASK, expected: 'one navigational click, then finish; no question' },
  clock: 'extension stage clocks (utils/g11-stage-clock.js), exclusive spans summed over the steps of one run; total is the run wall time',
  warmups: WARMUPS, samples: SAMPLES, sleepBetweenRunsMs: SLEEP_MS,
  counts: {
    measured: measured.length,
    finished: measured.filter((a) => a.outcome === 'finished').length,
    withPrompt: measured.filter((a) => a.prompts > 0).length,
    taskNotDone: measured.filter((a) => !a.taskDone).length,
    eligible: eligible.length,
  },
  stages: stageStats,
  gate: {
    rule: 'G11', budgetMs: BUDGET_MS, required: 'p95 end-to-end < 200 ms, n >= 100 after 10 warm-ups',
    p95TotalMs: p95, eligibleN: eligible.length,
    status: enough && p95 != null && p95 < BUDGET_MS ? 'meets budget on this flow' : 'fail',
    budget_weakened: false,
    note: enough ? null : 'fewer than 100 eligible attempts; the gate cannot be met by this run',
  },
  scope: 'One synthetic page and one frozen flow on one container (4 CPU, no GPU), headless Chromium. Cloud planner latency includes the public internet. Not other pages, not real sites, not a toolbar gesture.',
  attempts,
};
await writeFile(OUT, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ counts: record.counts, total: stageStats.total, plan: stageStats.plan, strip: stageStats.strip, gate: record.gate.status }, null, 2));
await ctx.close(); srv.close();

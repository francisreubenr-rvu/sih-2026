// Demo recording: the real extension, the real Warden (GLiNER, pairing, Laya) and the Groq planner, on
// the synthetic fixtures only. Records the page tab and the side-panel tab as two videos and writes
// marks.json (caption cues in milliseconds from the start of both videos) for compose-demo.py.
//
//   WARDEN_PAIRING_SECRET=<demo-only code> E2E_OUT=<dir> node scripts/e2e-v5/record-demo.mjs
//
// Use a throwaway pairing code: the field is masked, but the code should never be one in real use.
import { chromium } from '../../Prototype/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const out = process.env.E2E_OUT || '/tmp/dhristi-demo/';
await mkdir(`${out}video`, { recursive: true });
const ext = `${out}ext`;
await rm(ext, { recursive: true, force: true });
await cp(new URL('../../extension', import.meta.url).pathname, ext, { recursive: true });
const man = JSON.parse(readFileSync(`${ext}/manifest.json`, 'utf8'));
man.host_permissions.push('<all_urls>'); // harness-only: stands in for the optional grant a click gives
await writeFile(`${ext}/manifest.json`, JSON.stringify(man, null, 2));

const pages = { '/profile': readFileSync(`${here}fixture.html`), '/bank': readFileSync(`${here}fixture-statements.html`) };
const srv = createServer((q, r) => {
  const body = pages[q.url.split('#')[0]] || pages['/profile'];
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(body);
}).listen(8800, '127.0.0.1');

const pairing = process.env.WARDEN_PAIRING_SECRET;
if (!pairing) throw new Error('set WARDEN_PAIRING_SECRET to the demo code the Warden was started with');

// Both tabs share one recording size; resizing one tab's viewport shrinks the other's frames, so both
// stay 1100 x 900 and the panel is pinned to 460 CSS px with a style rule, then cropped when composed.
const SIZE = { width: 1100, height: 900 };
const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', headless: false, viewport: SIZE,
  recordVideo: { dir: `${out}video`, size: SIZE },
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const blank = ctx.pages()[0];
const page = await ctx.newPage();
const pageBorn = Date.now();
const panel = await ctx.newPage();
const panelBorn = Date.now();
if (blank) await blank.close();
const T0 = Date.now();
const marks = [];
const mark = (scene, caption) => { marks.push({ t: Date.now() - T0, scene, caption }); console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${scene}: ${caption}`); };
const errors = [];
panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));

const pinPanel = () => panel.addStyleTag({ content: 'html, body { width: 460px !important; max-width: 460px !important; overflow-x: hidden; }' });
const hold = (ms) => panel.waitForTimeout(ms);
const toBottom = () => panel.evaluate(() => {
  const last = [...document.querySelectorAll('.entry')].pop();
  if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
});

await page.goto('http://127.0.0.1:8800/profile');
await panel.goto(`chrome-extension://${id}/sidepanel.html`);
await pinPanel();
await panel.waitForSelector('#health-chip');
await hold(1500);

// Scene 1: pairing.
mark('pair', 'Pair the extension with the Warden, the local service on this computer');
await panel.click('details.diagnostics > summary');
await hold(800);
await panel.type('#warden-pairing', pairing, { delay: 25 });
await hold(400);
await panel.click('#warden-pairing-save');
await panel.waitForFunction(() => /proved the code/.test(document.getElementById('warden-pairing-status').textContent), null, { timeout: 30000 });
mark('pair', 'The Warden proves the code; an unpaired extension sends nothing');
await hold(3000);
await panel.waitForFunction(() => document.getElementById('health-chip').textContent.includes('READY'), null, { timeout: 180000 });
await panel.click('details.diagnostics > summary');
await panel.evaluate(() => window.scrollTo(0, 0));
await hold(1200);

const closeInspector = () => panel.evaluate(() => { const d = document.getElementById('inspector'); if (d) d.open = false; window.scrollTo(0, 0); });

async function runTask(task, { keep = [], onQuestion = 'proceed', cues = {} } = {}) {
  await closeInspector();
  await page.bringToFront();
  await panel.click('#task-input');
  await panel.type('#task-input', task, { delay: 35 });
  await hold(600);
  await panel.evaluate(() => document.getElementById('composer').requestSubmit());
  mark('run', cues.start || 'Captured and redacted on this computer; only tokens go to the planner');
  const answered = new Set();
  const t = Date.now();
  while (Date.now() - t < 240000) {
    await hold(300);
    await toBottom();
    const card = await panel.$('.entry[data-pending="true"]');
    if (card) {
      const eid = await card.getAttribute('data-entry-id');
      if (!answered.has(eid)) {
        answered.add(eid);
        await card.scrollIntoViewIfNeeded();
        const kind = await card.getAttribute('class');
        if (kind.includes('uncertain')) {
          const values = [];
          for (const li of await card.$$('li')) {
            const v = await li.$('.detection-box__value');
            values.push(v ? (await v.innerText()).trim() : '');
          }
          const kept = values.filter((v) => keep.includes(v));
          mark('uncertain', kept.length
            ? `Unsure: "${kept[0]}" looks like an account number. It is a link label, so keep it`
            : 'Unsure spans go to the person: strip the name, so only a token leaves');
          await hold(3500);
          for (const li of await card.$$('li')) {
            const v = await li.$('.detection-box__value');
            const value = v ? (await v.innerText()).trim() : '';
            const radio = await li.$(`label[data-choice="${keep.includes(value) ? 'keep' : 'strip'}"]`);
            if (radio) { await radio.click(); await hold(500); }
          }
          await hold(800);
          await (await card.$('button:has-text("Apply")')).click();
        } else {
          const text = (await card.innerText()).replace(/\s+/g, ' ');
          const destructive = /destructive|delete|हटा/i.test(text);
          mark('question', destructive
            ? 'Destructive step: Dhristi always asks. Skip it'
            : (cues.question || 'A step that changes something: Dhristi asks first'));
          await hold(3500);
          const choice = destructive ? 'skip' : onQuestion;
          const btn = await card.$(`button[data-choice="${choice}"]`) || await card.$('button[data-choice="skip"]');
          await btn.click();
        }
        await page.bringToFront();
      }
    }
    const done = await panel.evaluate(() => [...document.querySelectorAll('.entry')].some((e) => /Run (finished|stopped|error)/.test(e.textContent) && !e.dataset.seen && (e.dataset.seen = '1')));
    if (done) break;
  }
  await toBottom();
  const transcript = await panel.$$eval('.entry', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 160)));
  return { transcript, status: await page.textContent('#status'), prompts: answered.size };
}

// Scene 2: the full loop on the profile page.
mark('task', 'Task 1: update the contact email and save');
const r1 = await runTask('Update my contact email to priya.r@example.com and save the profile');
mark('result', `Page: "${(r1.status || '').trim()}". The address was filled in locally from a token`);
await hold(3500);
await panel.click('.boundary .node[data-tab="sent"]').catch(() => {});
await hold(500);
await panel.evaluate(() => document.getElementById('inspector')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
mark('sent', 'Sent view: exactly what reached the cloud planner. Tokens, not the email or the name');
await hold(7000);
await panel.evaluate(() => window.scrollTo(0, 0));

// Scene 3: a navigation step that runs without asking.
await page.goto('http://127.0.0.1:8800/bank');
await hold(1500);
mark('task', 'Task 2: open the account statements');
const r2 = await runTask('Open the account statements', { keep: ['Account statements'], cues: { start: 'Plain navigation: the Laya reviewer can let it run without a question' } });
const released = r2.transcript.some((t) => /Laya released the confirmation/.test(t));
mark('result', released ? 'Laya judged it navigational and on task, so it ran without asking' : `Page: "${(r2.status || '').trim()}"`);
await hold(5000);

// Scene 4: a destructive step always asks.
await page.goto('http://127.0.0.1:8800/profile');
await hold(1500);
mark('task', 'Task 3: delete the account');
const r3 = await runTask('Delete my account');
mark('result', /DELETED/.test(r3.status || '') ? 'The account was deleted' : 'Skipped: nothing was deleted');
await hold(4000);
mark('end', '');

await writeFile(`${out}marks.json`, JSON.stringify({
  pageOffsetMs: T0 - pageBorn, panelOffsetMs: T0 - panelBorn, durationMs: Date.now() - T0, size: SIZE, panelWidth: 460,
  pageVideo: await page.video().path(), panelVideo: await panel.video().path(), marks,
  runs: [r1, r2, r3].map((r) => ({ status: r.status, prompts: r.prompts, transcript: r.transcript })), released, errors,
}, null, 2));
await ctx.close(); srv.close();
console.log('errors:', JSON.stringify(errors));

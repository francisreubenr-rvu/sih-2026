// End-to-end: real extension + real Warden (GLiNER) + fake OpenAI-compatible cloud planner.
import { chromium } from '../../Prototype/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { readFile, cp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const out = process.env.E2E_OUT || '/tmp/dhristi-e2e-v5/';
await (await import('node:fs/promises')).mkdir(out, { recursive: true });
const ext = `${out}ext`;
await rm(ext, { recursive: true, force: true });
await cp(new URL('../../extension', import.meta.url).pathname, ext, { recursive: true });
const man = JSON.parse(readFileSync(`${ext}/manifest.json`, 'utf8'));
man.host_permissions.push('<all_urls>'); // harness-only: stands in for the optional grant a click gives
await writeFile(`${ext}/manifest.json`, JSON.stringify(man, null, 2));
// E2E_FIXTURE and E2E_TASK pick the synthetic page and task; the defaults are the original profile run.
const fixtureName = process.env.E2E_FIXTURE || 'fixture.html';
const fixture = readFileSync(`${here}${fixtureName}`);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fixture); }).listen(8800, '127.0.0.1');

const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', headless: false, viewport: { width: 1100, height: 760 },
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
// Pairing is required (warden/pairing.py): the Warden and this extension must hold the same code.
const pairing = process.env.WARDEN_PAIRING_SECRET;
if (!pairing) throw new Error('set WARDEN_PAIRING_SECRET to the value the Warden was started with');
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('http://127.0.0.1:8800/');
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 1000 });
const errors = [];
panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
await panel.goto(`chrome-extension://${id}/sidepanel.html`);
await panel.waitForSelector('#health-chip');
// Pair through the real Settings field, as a user would.
await panel.click('details.diagnostics > summary');
await panel.fill('#warden-pairing', pairing);
await panel.click('#warden-pairing-save');
if (process.env.E2E_EXPECT_UNPROVEN === '1') {
  // Negative check: the code does not match the Warden's. Record what the person sees, then try a
  // task and record the refusal. Nothing may reach the Warden or the cloud.
  await panel.waitForTimeout(4000);
  const pairingStatus = await panel.textContent('#warden-pairing-status');
  const chip = await panel.textContent('#health-chip');
  await panel.fill('#task-input', process.env.E2E_TASK || 'Update my contact email to priya.r@example.com and save the profile');
  await panel.evaluate(() => document.getElementById('composer').requestSubmit());
  await panel.waitForTimeout(4000);
  const entries = await panel.$$eval('.entry', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await writeFile(`${out}summary.json`, JSON.stringify({ negative: 'wrong pairing code', pairingStatus, chip, entries }, null, 2));
  console.log('pairing status:', pairingStatus, '| chip:', chip);
  console.log(entries.filter((e) => /pairing|refused|not sent/i.test(e)).join('\n'));
  await ctx.close(); srv.close();
  process.exit(0);
}
await panel.waitForFunction(() => /proved the code/.test(document.getElementById('warden-pairing-status').textContent), null, { timeout: 30000 });
console.log('pairing:', await panel.textContent('#warden-pairing-status'));
await panel.waitForFunction(() => document.getElementById('health-chip').textContent.includes('READY'), null, { timeout: 180000 });
console.log('health:', await panel.textContent('#health-text'));
await page.bringToFront();
const task = process.env.E2E_TASK || 'Update my contact email to priya.r@example.com and save the profile';
await panel.fill('#task-input', task);
await panel.evaluate(() => document.getElementById('composer').requestSubmit());

const answered = new Set();
const decisions = []; // uncertain-span answers; kept previews are recorded, stripped ones never are
const t0 = Date.now();
let shotOverlay = false;
while (Date.now() - t0 < 240000) {
  await panel.waitForTimeout(400);
  const card = await panel.$('.entry[data-pending="true"]');
  if (card) {
    const eid = await card.getAttribute('data-entry-id');
    if (!answered.has(eid)) {
      answered.add(eid);
      const kind = await card.getAttribute('class');
      const text = (await card.innerText()).replace(/\s+/g, ' ').slice(0, 220);
      console.log('PROMPT', kind.includes('uncertain') ? 'uncertain-pii' : 'question', '|', text);
      if (!shotOverlay) { await page.screenshot({ path: `${out}page-overlay.png` }); shotOverlay = true; }
      await panel.screenshot({ path: `${out}panel-prompt-${answered.size}.png`, fullPage: true });
      if (kind.includes('uncertain')) {
        // Strip every span, except previews listed in E2E_KEEP (comma-separated), which stand in for
        // a person recognising that a span is not personal data (e.g. a link labelled
        // "Account statements" scored as an account number).
        const keep = (process.env.E2E_KEEP || '').split(',').map((v) => v.trim()).filter(Boolean);
        for (const li of await card.$$('li')) {
          const value = ((await li.$('.detection-box__value')) && (await (await li.$('.detection-box__value')).innerText())) || '';
          const choice = keep.includes(value.trim()) ? 'keep' : 'strip';
          const radio = await li.$(`label[data-choice="${choice}"]`);
          if (radio) { await radio.click(); decisions.push({ choice, kept: choice === 'keep' ? value.trim() : null }); }
        }
        await (await card.$('button:has-text("Apply")')).click();
      } else {
        const proceed = await card.$('button[data-choice="proceed"]');
        await (proceed || await card.$('button[data-choice="skip"]')).click();
      }
      await page.bringToFront();
    }
  }
  const done = await panel.evaluate(() => [...document.querySelectorAll('.entry')].some((e) => /Run (finished|stopped|error)/.test(e.textContent)));
  if (done) break;
}
const transcript = await panel.$$eval('.entry', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 160)));
console.log(transcript.join('\n'));
const finalStatus = await page.textContent('#status');
const emailField = await page.$('#email') ? await page.inputValue('#email') : null;
console.log('page status:', finalStatus, '| email field:', emailField);
// Machine-readable record for the results file: what was asked, what Laya released, how it ended.
const prompts = [...answered].length;
const released = transcript.filter((t) => /Laya released the confirmation/.test(t));
await writeFile(`${out}summary.json`, JSON.stringify({
  fixture: fixtureName, task, prompts, released: released.length, releasedNotes: released, uncertainDecisions: decisions,
  finalStatus, emailField, finished: transcript.some((t) => /Run finished/.test(t)),
  durationMs: Date.now() - t0, errors, transcript,
}, null, 2));
await panel.click('#boundary .node[data-tab="sent"]').catch(() => {});
await panel.waitForTimeout(300);
await panel.screenshot({ path: `${out}panel-final.png`, fullPage: true });
console.log('errors:', JSON.stringify(errors));
await ctx.close(); srv.close();

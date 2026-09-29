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
const fixture = readFileSync(`${here}fixture.html`);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fixture); }).listen(8800, '127.0.0.1');

const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', headless: false, viewport: { width: 1100, height: 760 },
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('http://127.0.0.1:8800/');
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 1000 });
const errors = [];
panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
await panel.goto(`chrome-extension://${id}/sidepanel.html`);
await panel.waitForSelector('#health-chip');
await panel.waitForFunction(() => document.getElementById('health-chip').textContent.includes('READY'), null, { timeout: 180000 });
console.log('health:', await panel.textContent('#health-text'));
await page.bringToFront();
const task = 'Update my contact email to priya.r@example.com and save the profile';
await panel.fill('#task-input', task);
await panel.evaluate(() => document.getElementById('composer').requestSubmit());

const answered = new Set();
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
        for (const r of await card.$$('label[data-choice="strip"]')) await r.click();
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
console.log('page status:', await page.textContent('#status'), '| email field:', await page.inputValue('#email'));
await panel.click('#boundary .node[data-tab="sent"]').catch(() => {});
await panel.waitForTimeout(300);
await panel.screenshot({ path: `${out}panel-final.png`, fullPage: true });
console.log('errors:', JSON.stringify(errors));
await ctx.close(); srv.close();

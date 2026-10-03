// The face stage in real Chromium, with the UNMODIFIED root extension package loaded unpacked:
// the manifest's own CSP must let the offscreen document compile ONNX Runtime's WASM, the bundled
// model must load, and the Port must answer only the service worker.
//
// The image is composed inside the worker (OffscreenCanvas) from the attributed public-domain
// test portrait (Prototype/app/assets/astronaut.png, see Prototype/models/manifest.json), so no
// captureVisibleTab and no extra host permission is needed. Timing and scale evidence is
// scripts/validate-extension-vision.mjs, not this test.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { EXTENSION_DIR, findChromium } from './helpers/content-harness.mjs';

const REPO = join(EXTENSION_DIR, '..');
let ctx;
let sw;
let server;
let origin;

before(async () => {
  const image = await readFile(join(REPO, 'Prototype/app/assets/astronaut.png'));
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
    res.end(image);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await import(join(REPO, 'Prototype/node_modules/playwright-core/index.mjs'));
  ctx = await chromium.launchPersistentContext('', {
    executablePath: findChromium(),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
});

after(async () => {
  await ctx?.close();
  await new Promise((r) => server?.close(r) ?? r());
});

// A 1280x800 "capture": light page ground, optionally the portrait at `size` px.
async function detectComposed(size) {
  return sw.evaluate(async ([src, px]) => {
    const canvas = new OffscreenCanvas(1280, 800);
    const g = canvas.getContext('2d');
    g.fillStyle = '#f7f8fb';
    g.fillRect(0, 0, 1280, 800);
    if (px) {
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      g.drawImage(bitmap, 100, 120, px, px);
    }
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const r = await globalThis.dhristiVisionProbe.detect(`data:image/png;base64,${btoa(bin)}`);
    return { faces: r.detections, width: r.width, height: r.height, model: r.model };
  }, [`${origin}/astronaut.png`, size]);
}

test('the unmodified package runs the bundled model in an offscreen document under its own CSP', async () => {
  const withFace = await detectComposed(512);
  assert.equal(withFace.model, 'UltraFace RFB-320');
  assert.deepEqual([withFace.width, withFace.height], [1280, 800]);
  assert.equal(withFace.faces.length, 1);
  const f = withFace.faces[0];
  // Inside the drawn portrait (100..612, 120..632).
  assert.ok(f.x >= 100 && f.y >= 120 && f.x + f.width <= 612 && f.y + f.height <= 632, JSON.stringify(f));
  const blank = await detectComposed(0);
  assert.equal(blank.faces.length, 0);
  const contexts = await sw.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }));
  assert.equal(contexts.length, 1);
  assert.match(contexts[0].documentUrl, /\/offscreen\.html$/);
});

test('an extension page cannot use the detector Port; only the service worker is answered', async () => {
  await detectComposed(0); // the offscreen document exists
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  const outcome = await page.evaluate(() => new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: 'dhristi-vision' });
    port.onMessage.addListener((m) => resolve({ replied: true, m }));
    port.onDisconnect.addListener(() => resolve({ replied: false }));
    port.postMessage({ id: 'x', type: 'stats' });
    setTimeout(() => resolve({ replied: false, timeout: true }), 3000);
  }));
  assert.equal(outcome.replied, false);
  await page.close();
});

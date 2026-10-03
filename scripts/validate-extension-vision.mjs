/**
 * Real-Chromium evidence for the root extension's on-device face stage (offscreen document,
 * bundled ONNX Runtime Web on WASM, UltraFace RFB-320).
 *
 * What it does:
 *  1. Loads a copy of the unpacked root `extension/` in Chromium (Playwright, --headless=new).
 *     The copy adds `<all_urls>` to host_permissions so the service worker may call
 *     captureVisibleTab without a toolbar click; that is the only change (the same harness-only
 *     step scripts/e2e-v5/run.mjs takes).
 *  2. Serves synthetic fixture pages from loopback. Faces come from one attributed public-domain
 *     image (NASA portrait used by scikit-image as `astronaut`, see Prototype/models/manifest.json),
 *     drawn at several sizes; one page has no image at all.
 *  3. For each page: one real captureVisibleTab in the worker, then 5 warm-up and N timed face
 *     checks through the worker's real vision client (offscreen document over the Port), and
 *     counts detections inside / outside each image's rectangle.
 *  4. Runs the real step loop (START_TASK from the side panel opened as a tab) against a fake,
 *     paired Warden on a free loopback port that always returns `finish`, and checks the masked
 *     capture in the trace: every detected face's box is painted with the mask colour.
 *  5. Writes Benchmarks/results/extension-vision-v01.json.
 *
 * Usage: node scripts/validate-extension-vision.mjs [--out path] [--n 30]
 * Needs Prototype/node_modules (playwright-core) and a Chromium (DHRISTI_CHROMIUM or
 * /opt/pw-browsers/chromium). Never sends anything off this machine.
 */
import { chromium } from '../Prototype/node_modules/playwright-core/index.mjs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const outPath = arg('--out', join(repo, 'Benchmarks/results/extension-vision-v01.json'));
const N = Number(arg('--n', 30));
const WARMUP = 5;
const LOOP_RUNS = 3;
const VIEWPORT = { width: 1280, height: 800 };
const MASK_RGB = [0xec, 0xef, 0xf7]; // utils/redactor.js fill (#eceff7)
const chromePath = [process.env.DHRISTI_CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!chromePath) throw new Error('No Chromium found. Set DHRISTI_CHROMIUM.');

// ---- Fixtures ------------------------------------------------------------------------------
const IMAGE = readFileSync(join(repo, 'Prototype/app/assets/astronaut.png'));
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px system-ui;margin:24px;background:#f7f8fb;color:#1c2333}img{display:inline-block;margin:0 16px 16px 0;vertical-align:top}</style></head>
<body><h1>${title} (synthetic)</h1><p>Synthetic fixture for the on-device face stage. No real account.</p>${body}</body></html>`;
const imgs = (size, count) => Array.from({ length: count }, (_, i) => `<img data-face="${i}" src="/astronaut.png" width="${size}" height="${size}" alt="portrait ${i + 1}">`).join('');
const FIXTURES = [
  { name: 'no-image', expected: 0, html: page('Profile form', '<form><label>Email <input type="email"></label><button type="button">Save</button></form><p>Plain text only, no images.</p>') },
  { name: 'one-512px', expected: 1, html: page('Profile photo', imgs(512, 1)) },
  { name: 'one-256px', expected: 1, html: page('Profile photo', imgs(256, 1)) },
  { name: 'one-128px', expected: 1, html: page('Profile photo', imgs(128, 1)) },
  { name: 'one-64px', expected: 1, html: page('Profile photo', imgs(64, 1)) },
  { name: 'four-256px', expected: 4, html: page('Team page', imgs(256, 4)) },
];

const site = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/astronaut.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(IMAGE); return; }
  const f = FIXTURES.find((x) => url.pathname === `/${x.name}.html`);
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(f.html);
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const siteOrigin = `http://127.0.0.1:${site.address().port}`;

// ---- Fake paired Warden (warden/pairing.py's response proof); always plans `finish` ----------
const pairing = randomBytes(32).toString('base64url');
const wardenCalls = [];
const warden = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  wardenCalls.push({ path, bytes: raw.length, hasImage: /data:image|base64_image|iVBORw0KGgo/.test(raw) });
  const body = raw ? JSON.parse(raw) : null;
  let value;
  if (path === '/health') value = { ok: true, loaded: true, model: 'fake-gliner', planner: 'groq', groqConfigured: true, destination: 'cloud', plannerModel: 'fake-cloud-planner' };
  else if (path === '/strip') value = { tokenizedTask: body.task, sanitizedDom: body.dom, elements: body.elements.map((el) => ({ ...el, pii: false })), tokens: {}, uncertain: [], decisions: [], warden: 'fake' };
  else if (path === '/plan') value = { model: 'fake-cloud-planner', destination: 'cloud', latencyMs: 1, switched: [], plan: { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'done' } };
  else { res.writeHead(404); res.end(); return; }
  const bytes = Buffer.from(JSON.stringify(value));
  const nonce = req.headers['x-dhristi-nonce'];
  const headers = { 'content-type': 'application/json' };
  if (nonce) headers['x-dhristi-proof'] = createHmac('sha256', pairing).update(`dhristi-res\n${path}\n${nonce}\n200\n${createHash('sha256').update(bytes).digest('hex')}`).digest('base64url');
  res.writeHead(200, headers);
  res.end(bytes);
});
await new Promise((r) => warden.listen(0, '127.0.0.1', r));
const wardenOrigin = `http://127.0.0.1:${warden.address().port}`;

// ---- Extension copy and browser ----------------------------------------------------------------
const work = await mkdtemp(join(tmpdir(), 'dhristi-vision-'));
const ext = join(work, 'ext');
const profile = join(work, 'profile');
await cp(join(repo, 'extension'), ext, { recursive: true });
const manifest = JSON.parse(await readFile(join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('<all_urls>');
await writeFile(join(ext, 'manifest.json'), JSON.stringify(manifest, null, 2));

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: chromePath,
  headless: false,
  viewport: VIEWPORT,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--enable-precise-memory-info'],
});
const errors = [];
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const tab = ctx.pages()[0] || await ctx.newPage();
tab.on('pageerror', (e) => errors.push(`page: ${e.message}`));

// ---- Process memory: the extension renderer process of THIS browser (Linux /proc) -------------
function procStatus(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = (k) => Number((new RegExp(`^${k}:\\s+(\\d+) kB`, 'm').exec(text) || [])[1]) || null;
    return { rssKb: kb('VmRSS'), hwmKb: kb('VmHWM') };
  } catch { return null; }
}
function extensionProcesses() {
  const all = readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
  const info = new Map();
  for (const pid of all) {
    try {
      // Chromium rewrites its process title, so cmdline is often one space-joined string.
      const cmd = ` ${readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ')} `;
      const ppid = Number(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]);
      info.set(pid, { cmd, ppid });
    } catch { /* gone */ }
  }
  const root = [...info].find(([, v]) => v.cmd.includes(` --user-data-dir=${profile} `) && !v.cmd.includes(' --type='));
  if (!root) return { note: 'browser process not found', processes: [] };
  const mine = new Set([root[0]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, v] of info) if (!mine.has(pid) && mine.has(v.ppid)) { mine.add(pid); grew = true; }
  }
  const processes = [...mine]
    .filter((pid) => info.get(pid).cmd.includes(' --extension-process '))
    .map((pid) => ({ pid, ...procStatus(pid) }));
  // Every renderer of this browser too, so a reading can be checked against the whole picture.
  const renderers = [...mine]
    .filter((pid) => info.get(pid).cmd.includes(' --type=renderer '))
    .map((pid) => ({ pid, extensionProcess: info.get(pid).cmd.includes(' --extension-process '), ...procStatus(pid) }));
  return { processes, renderers };
}

// ---- Helpers inside the worker ----------------------------------------------------------------
async function captureInWorker() {
  return sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const t0 = performance.now();
    const shot = await chrome.tabs.captureVisibleTab(t.windowId, { format: 'png' });
    globalThis.__visionShot = shot; // stays in the worker; never returned to Node
    return { captureMs: performance.now() - t0, dataUrlChars: shot.length };
  });
}
async function detectInWorker(n) {
  return sw.evaluate(async (count) => {
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const r = await globalThis.dhristiVisionProbe.detect(globalThis.__visionShot);
      rows.push({ detectMs: r.detectMs, waitInitMs: r.waitInitMs, inferenceMs: r.inferenceMs, decodeMs: r.decodeMs, width: r.width, height: r.height, detections: r.detections, model: r.model, backend: r.backend });
    }
    return rows;
  }, n);
}
const pct = (values, p) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
};
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const summary = (values) => ({ n: values.length, p50Ms: r1(pct(values, 50)), p95Ms: r1(pct(values, 95)), minMs: r1(Math.min(...values)), maxMs: r1(Math.max(...values)) });

async function openFixture(name) {
  await tab.goto(`${siteOrigin}/${name}.html`);
  await tab.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  await tab.bringToFront();
  await tab.waitForTimeout(600); // captureVisibleTab is rate-limited to 2 calls per second
  return tab.evaluate(() => ({
    dpr: devicePixelRatio,
    rects: [...document.images].map((img) => { const r = img.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
  }));
}

function score(detections, rects, dpr) {
  const hit = rects.map(() => 0);
  let outside = 0;
  for (const d of detections) {
    const cx = (d.x + d.width / 2) / dpr;
    const cy = (d.y + d.height / 2) / dpr;
    const i = rects.findIndex((r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
    if (i >= 0) hit[i] += 1; else outside += 1;
  }
  return { imagesWithAFace: hit.filter((h) => h > 0).length, detectionsInsideImages: hit.reduce((a, b) => a + b, 0), detectionsOutsideImages: outside };
}

// ---- 1. Cold start ------------------------------------------------------------------------------
await openFixture('no-image');
await tab.waitForTimeout(1500); // let the worker's renderer settle before the first reading
const memBefore = extensionProcesses();
const coldCapture = await captureInWorker();
const [cold] = await detectInWorker(1);
const hostStats = await sw.evaluate(() => globalThis.dhristiVisionProbe.stats());
const memAfterInit = extensionProcesses();

// ---- 2. Per-fixture timing and detection ---------------------------------------------------------
const fixtures = [];
const allDetectMs = [];
const allInferenceMs = [];
for (const f of FIXTURES) {
  const layout = await openFixture(f.name);
  const capture = await captureInWorker();
  await detectInWorker(WARMUP);
  const rows = await detectInWorker(N);
  const counts = rows.map((r) => r.detections.length);
  const stable = counts.every((c) => c === counts[0]);
  const s = score(rows[0].detections, layout.rects, layout.dpr);
  allDetectMs.push(...rows.map((r) => r.detectMs));
  allInferenceMs.push(...rows.map((r) => r.inferenceMs));
  fixtures.push({
    fixture: f.name,
    imageDisplayPx: layout.rects[0]?.width ?? null,
    capturePx: { width: rows[0].width, height: rows[0].height },
    devicePixelRatio: layout.dpr,
    facesExpected: f.expected,
    detections: counts[0],
    detectionCountStableAcrossRuns: stable,
    imagesWithAFaceDetected: s.imagesWithAFace,
    detectionsOutsideImages: s.detectionsOutsideImages,
    confidences: rows[0].detections.map((d) => Math.round(d.confidence * 1000) / 1000),
    detectedBoxesCssPx: rows[0].detections.map((d) => [Math.round(d.width / layout.dpr), Math.round(d.height / layout.dpr)]),
    captureVisibleTabMs: r1(capture.captureMs),
    captureDataUrlChars: capture.dataUrlChars,
    detectRoundTripMs: summary(rows.map((r) => r.detectMs)),
    inferenceMs: summary(rows.map((r) => r.inferenceMs)),
    decodeMs: summary(rows.map((r) => r.decodeMs)),
  });
}
const hostStatsAfter = await sw.evaluate(() => globalThis.dhristiVisionProbe.stats());
const memAfterRuns = extensionProcesses();
await sw.evaluate(() => { delete globalThis.__visionShot; });

// ---- 3. The real step loop: START_TASK against a fake paired Warden ------------------------------
await sw.evaluate(async ([origin, code]) => chrome.storage.local.set({ wardenOrigin: origin, wardenPairing: code }), [wardenOrigin, pairing]);
const panel = await ctx.newPage();
panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForSelector('#task-input');
const loopRuns = [];
for (let i = 0; i < LOOP_RUNS; i += 1) {
  const layout = await openFixture('four-256px');
  await panel.fill('#task-input', 'Open the team page and finish');
  await tab.bringToFront();
  await panel.evaluate(() => document.getElementById('composer').requestSubmit());
  const t0 = Date.now();
  let entries = [];
  const before = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_SESSION' }).then((s) => s.entries.filter((e) => e.terminal).length));
  while (Date.now() - t0 < 60000) {
    entries = (await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_SESSION' }))).entries;
    if (entries.filter((e) => e.terminal).length > before) break;
    await panel.waitForTimeout(250);
  }
  const trace = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_TRACE' }));
  // Boxes for the same, unchanged page from a fresh check, then: is each box's interior painted
  // with the mask colour in the masked capture the trace holds?
  await tab.waitForTimeout(600);
  await captureInWorker();
  const [fresh] = await detectInWorker(1);
  await sw.evaluate(() => { delete globalThis.__visionShot; });
  const maskCheck = trace?.screenshot?.dataUrl
    ? await panel.evaluate(async ([dataUrl, boxes, rgb]) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      let points = 0;
      let masked = 0;
      for (const b of boxes) {
        for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) {
          const p = g.getImageData(Math.floor(b.x + b.width * fx), Math.floor(b.y + b.height * fy), 1, 1).data;
          points += 1;
          if (Math.abs(p[0] - rgb[0]) <= 1 && Math.abs(p[1] - rgb[1]) <= 1 && Math.abs(p[2] - rgb[2]) <= 1) masked += 1;
        }
      }
      return { boxes: boxes.length, pointsSampled: points, pointsWithMaskColour: masked };
    }, [trace.screenshot.dataUrl, fresh.detections, MASK_RGB])
    : null;
  const screenCaption = await panel.evaluate(() => document.getElementById('screen-caption').textContent);
  loopRuns.push({
    fixture: 'four-256px',
    imagesOnPage: layout.rects.length,
    terminal: entries.filter((e) => e.terminal).at(-1)?.status ?? null,
    vision: trace?.vision ?? null,
    perceiveDetail: trace?.stages?.perceive?.detail ?? null,
    screenMasked: trace?.redaction?.screenMasked ?? null,
    maskedCaptureCheck: maskCheck,
    panelScreenCaption: screenCaption,
  });
}
const g11 = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_G11_TRACE' }));

await ctx.close();
site.close();
warden.close();
await rm(work, { recursive: true, force: true });

// ---- Record ------------------------------------------------------------------------------------
const modelFiles = [];
for (const dir of ['extension/models', 'extension/models/ort']) {
  for (const name of await readdir(join(repo, dir))) {
    const p = join(repo, dir, name);
    const s = await stat(p);
    if (s.isFile()) modelFiles.push({ path: relative(repo, p), bytes: s.size, sha256: createHash('sha256').update(await readFile(p)).digest('hex') });
  }
}
const chromeVersion = spawnSync(chromePath, ['--version'], { encoding: 'utf8' }).stdout.trim();
const totalExpected = fixtures.reduce((a, f) => a + f.facesExpected, 0);
const totalFound = fixtures.reduce((a, f) => a + f.imagesWithAFaceDetected, 0);
const missed = fixtures.filter((f) => f.imagesWithAFaceDetected < f.facesExpected);
const record = {
  harness: 'scripts/validate-extension-vision.mjs',
  generatedAt: new Date().toISOString(),
  status: 'diagnostic',
  claim: 'The root extension runs a face detector on this device: UltraFace RFB-320 on ONNX Runtime Web (WASM, single thread) in an MV3 offscreen document, called by the service worker on every step capture; detected faces are painted over before the capture is put in the panel trace (checked here by sampling the masked capture). That the optional OmniParser receives only the masked capture, and nothing when the face check fails, is covered by unit tests (extension/tests/background-vision.test.mjs), not by this run.',
  scope: [
    'One machine, one Chromium build, headless (--headless=new); numbers are this container, not a judge laptop.',
    `Synthetic fixture pages; every face is the same attributed public-domain photograph (NASA portrait, the scikit-image "astronaut" test image; Prototype/models/manifest.json) drawn at ${[...new Set(FIXTURES.filter((f) => f.expected).map((f) => f.name))].join(', ')}. This is not a face-detection accuracy benchmark and gives no recall or precision for real pages or real populations.`,
    `Viewport ${VIEWPORT.width}x${VIEWPORT.height} CSS px at devicePixelRatio ${fixtures[0]?.devicePixelRatio}. The detector resizes the whole capture to 320x240, so a face's size in the capture decides detection; small faces in a full-viewport capture are missed (see per-fixture rows).`,
    'The extension copy adds <all_urls> to host_permissions so captureVisibleTab runs without a toolbar click (harness-only, as scripts/e2e-v5/run.mjs does). Nothing else in the package is changed.',
    'Timed calls reuse one capture per fixture (captureVisibleTab is rate-limited to 2 per second); captureVisibleTab time is reported once per fixture, separately.',
    'The step-loop rows use a fake paired Warden on loopback that always plans finish; they prove the wiring (detect, mask, trace, panel caption), not planner behaviour.',
    'G11 stays fail; submission_ready stays false. This file does not move any gate.',
  ],
  environment: {
    chromium: chromeVersion,
    cpu: `${cpus()[0]?.model} x${cpus().length}`,
    memoryTotalMb: Math.round(totalmem() / 1048576),
    platform: process.platform,
  },
  model: {
    name: 'UltraFace RFB-320 (Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB, MIT)',
    runtime: 'onnxruntime-web 1.23.2 (MIT), WASM execution provider, numThreads 1, proxy off',
    input: '1x3x240x320, whole capture resized (aspect not preserved), score threshold 0.7, NMS IoU 0.3',
    files: modelFiles,
    bytesTotal: modelFiles.reduce((a, f) => a + f.bytes, 0),
    bytesModelOnly: modelFiles.find((f) => f.path.endsWith('ultraface-rfb320.onnx'))?.bytes ?? null,
  },
  coldStart: {
    note: 'First face check after the worker started: creates the offscreen document, compiles the WASM runtime and loads the model, then runs one detection.',
    waitForDetectorMs: r1(cold.waitInitMs),
    hostModelLoadMs: r1(hostStats?.initMs ?? null),
    firstDetectRoundTripMs: r1(cold.detectMs),
    captureVisibleTabMs: r1(coldCapture.captureMs),
  },
  perCapture: {
    note: `Worker-side round trip per face check (port message with the PNG data URL, decode to ImageBitmap, resize, inference, decode boxes, reply), n=${N} per fixture after ${WARMUP} warm-ups, all fixtures pooled.`,
    detectRoundTripMs: summary(allDetectMs),
    inferenceOnlyMs: summary(allInferenceMs),
    capBudgetMs: 1500,
    overCap: allDetectMs.filter((v) => v > 1500).length,
  },
  detection: {
    facesExpectedTotal: totalExpected,
    imagesWithAFaceDetectedTotal: totalFound,
    detectionsOutsideImagesTotal: fixtures.reduce((a, f) => a + f.detectionsOutsideImages, 0),
    rule: 'An image counts as found when at least one detection centre lies inside its on-page rectangle; a detection whose centre lies outside every image is counted as outside (a false positive on these pages).',
  },
  fixtures,
  memory: {
    jsHeapOffscreen: {
      source: 'performance.memory in the offscreen document (Chromium, --enable-precise-memory-info). JS heap only; WebAssembly memory and decoded images are not included. The later reading can include capture data URLs (about 1 to 2 MB each) received and not yet garbage-collected.',
      afterModelLoad: hostStats?.jsHeap ?? null,
      afterAllChecks: hostStatsAfter?.jsHeap ?? null,
    },
    extensionProcessRss: {
      source: 'VmRSS / VmHWM from /proc for renderer processes of this browser started with --extension-process. In Chromium the service worker, the offscreen document and any open extension page of one extension share this process, so this is the whole extension renderer, not the offscreen document alone.',
      beforeDetectorStart: memBefore,
      afterModelLoad: memAfterInit,
      afterAllChecks: memAfterRuns,
    },
  },
  stepLoop: {
    note: 'Real START_TASK from the side panel (opened as a tab) on the four-256px fixture, fake paired Warden, one step each (plan = finish).',
    runs: loopRuns,
    g11StagesMsLastRun: g11?.stagesMs ?? null,
    wardenRequests: wardenCalls.length,
    wardenRequestsCarryingAnImage: wardenCalls.filter((c) => c.hasImage).length,
  },
  errors,
  limits: [
    missed.length
      ? `Missed on these pages: ${missed.map((f) => `${f.fixture} (${f.imagesWithAFaceDetected}/${f.facesExpected})`).join(', ')}. The whole ${VIEWPORT.width}x${VIEWPORT.height} capture is resized to 320x240 before detection, so a face that is small in the capture is below the detector's working scale. No tiling or multi-scale pass is implemented; a missed face is not masked.`
      : 'No face was missed on these pages; that says nothing about faces smaller than the smallest size drawn here.',
    'One source photograph only; skin tones, poses, occlusion, profiles, illustrations and video frames are untested.',
    'WebGPU is not used; WASM single thread only.',
    'Firefox is not exercised; root extension uses chrome.offscreen and side_panel, both Chrome-only.',
    'Memory figures are diagnostic and depend on what else the extension renderer holds at that moment.',
  ],
};
await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ out: relative(repo, outPath), coldStart: record.coldStart, perCapture: record.perCapture, detection: record.detection, fixtures: fixtures.map((f) => [f.fixture, f.facesExpected, f.imagesWithAFaceDetected, f.detectionsOutsideImages, f.detectRoundTripMs.p50Ms]), loop: loopRuns.map((r) => [r.terminal, r.vision?.status, r.vision?.faces, r.maskedCaptureCheck]), errors }, null, 2));

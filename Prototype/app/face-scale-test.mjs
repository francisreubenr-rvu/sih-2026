import { createVisionDetector } from '/dist/app-face-test.js';

const statusEl = document.getElementById('status');
const tbody = document.querySelector('#table tbody');
const record = document.getElementById('record');
const runBtn = document.getElementById('run');
const run48Btn = document.getElementById('run48');

const FULL = [48, 56, 64, 72, 80, 88, 96, 112, 128, 160, 192, 224, 256, 320];
const SMALL = [48, 56, 64, 72, 80, 88, 96, 112, 128];

document.body.dataset.harnessReady = '1';
statusEl.textContent = 'Idle. Detector bundle loaded.';

async function runMatrix(sizes) {
  runBtn.disabled = true; run48Btn.disabled = true;
  tbody.replaceChildren(); record.hidden = true;
  const started = performance.now();
  const rows = [];
  let detector;
  try {
    statusEl.textContent = 'Loading detector…';
    detector = await createVisionDetector();
    const source = new Image();
    source.src = '/app/assets/astronaut.png';
    await source.decode();
    for (const size of sizes) {
      statusEl.textContent = `Measuring ${size} px…`;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(source, 0, 0, size, size);
      const t0 = performance.now();
      const result = await detector.detect(canvas);
      const wallMs = performance.now() - t0;
      const row = { size, detections: result.detections.length, inferenceMs: result.inferenceMs, wallMs,
                    boxes: result.detections.map(d => ({ x: d.x, y: d.y, width: d.width, height: d.height, confidence: d.confidence })) };
      rows.push(row);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${size}</td><td>${row.detections}</td><td>${row.inferenceMs ?? ''}</td><td>${wallMs.toFixed(1)}</td>`;
      tbody.append(tr);
    }
    record.textContent = JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: '/app/assets/astronaut.png',
      model: '/models/ultraface-rfb320.onnx',
      detector: 'createVisionDetector (onnxruntime-web, wasm EP, single thread)',
      sizes, totalWallMs: performance.now() - started, rows
    }, null, 2);
    record.hidden = false;
    document.body.dataset.harnessState = 'complete';
    statusEl.textContent = `Complete: ${rows.length} sizes, ${rows.filter(r => r.detections > 0).length} with detections.`;
  } catch (error) {
    document.body.dataset.harnessState = 'error';
    document.body.dataset.harnessError = String((error && error.message) || error);
    statusEl.textContent = `Failed: ${(error && error.message) || error}`;
    record.textContent = JSON.stringify({ error: String((error && error.stack) || error) }, null, 2);
    record.hidden = false;
  } finally {
    if (detector) { try { await detector.dispose(); } catch {} }
    runBtn.disabled = false; run48Btn.disabled = false;
  }
}

runBtn.addEventListener('click', () => runMatrix(FULL));
run48Btn.addEventListener('click', () => runMatrix(SMALL));

// Regression guards on the shipping manifest and the redact-then-semantic egress order.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { EXTENSION_DIR } from './helpers/content-harness.mjs';
import { loopbackHttpUrl } from '../utils/loopback.js';

const manifest = JSON.parse(await readFile(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const background = await readFile(join(EXTENSION_DIR, 'background.js'), 'utf8');

test('install-time host_permissions are loopback only', () => {
  assert.ok(manifest.host_permissions.length > 0);
  for (const pattern of manifest.host_permissions) {
    assert.equal(loopbackHttpUrl(pattern.replace(/\/\*$/, '')), true, pattern);
  }
});

test('<all_urls> appears only in optional_host_permissions (and the redactor/op-tier resources)', () => {
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal((manifest.permissions || []).includes('<all_urls>'), false);
  for (const entry of manifest.web_accessible_resources) {
    assert.deepEqual([...entry.resources].sort(), ['utils/op-tier.js', 'utils/redactor.js']);
  }
});

test('no static content_scripts: the scan script is registered only after site access is granted', () => {
  assert.equal('content_scripts' in manifest, false);
});

test('the screenshot is redacted before any detector sees it, and never goes to the Warden', () => {
  const capture = background.indexOf('captureVisibleTab(');
  const redact = background.indexOf('redactScreenshot(screenshot');
  const detect = background.indexOf('detectElements({ dataUrl: redacted.dataUrl');
  const strip = background.indexOf('resolveUncertainLoop(runId, state.task');
  assert.ok(capture > 0 && capture < redact && redact < detect && detect < strip);
  // The only Warden request bodies are built in utils/warden.js from named fields; none is a
  // screenshot. The runtime check is in background-gate.test.mjs ("egress").
});

// 3 October 2026: the on-device face stage. The manifest gains exactly one permission and one CSP
// entry, both for the offscreen document that runs ONNX Runtime Web on WASM.
test('permissions: offscreen added for the face detector, nothing broader', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'offscreen', 'scripting', 'sidePanel', 'storage']);
});

test('extension-page CSP allows WebAssembly and nothing remote', () => {
  assert.deepEqual(Object.keys(manifest.content_security_policy), ['extension_pages']);
  const csp = manifest.content_security_policy.extension_pages;
  assert.equal(csp, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
  const rest = csp.replace("'wasm-unsafe-eval'", '');
  assert.equal(/unsafe-eval|unsafe-inline|https?:|\*/.test(rest), false);
});

test('the model and runtime are bundled with their licences, and none is web-accessible', async () => {
  const { stat } = await import('node:fs/promises');
  for (const file of ['offscreen.html', 'offscreen.js', 'utils/vision.js', 'utils/vision-client.js', 'models/ultraface-rfb320.onnx', 'models/ULTRAFACE-LICENSE.txt', 'models/ORT-LICENSE.txt', 'models/ort/ort.wasm.min.mjs', 'models/ort/ort-wasm-simd-threaded.mjs', 'models/ort/ort-wasm-simd-threaded.wasm']) {
    assert.ok((await stat(join(EXTENSION_DIR, file))).size > 0, file);
  }
  for (const entry of manifest.web_accessible_resources) {
    assert.equal(entry.resources.some((r) => /models\/|offscreen|vision/.test(r)), false);
  }
});

test('faces are checked on the capture before it is masked, and the mask comes before any detector', () => {
  const capture = background.indexOf('captureVisibleTab(');
  const faces = background.indexOf('visionClient.detect(screenshot)');
  const redact = background.indexOf('redactScreenshot(screenshot');
  const detect = background.indexOf('detectElements({ dataUrl: redacted.dataUrl');
  assert.ok(capture > 0 && capture < faces && faces < redact && redact < detect);
});

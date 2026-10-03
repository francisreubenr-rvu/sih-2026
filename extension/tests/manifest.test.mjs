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

test('the Warden host permission is 127.0.0.1 only, not localhost', () => {
  assert.equal(manifest.host_permissions.some((p) => p.includes(':8756') && !p.startsWith('http://127.0.0.1:8756/')), false);
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:8756/*'));
});

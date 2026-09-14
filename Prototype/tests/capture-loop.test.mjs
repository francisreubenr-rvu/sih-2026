import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_STAGES,
  classifyCaptureError,
  buildSanitizedPlanRequest,
  advanceStage,
  summarizeProtectLoop,
  privacyOnlyCompletion,
  TOOLBAR_ACTIVETAB_NOTE,
} from '../shared/capture-loop.mjs';

test('CAPTURE_STAGES lists the production pipeline order', () => {
  assert.ok(CAPTURE_STAGES.includes('capture'));
  assert.ok(CAPTURE_STAGES.includes('sanitize'));
  assert.ok(CAPTURE_STAGES.includes('review'));
  assert.equal(CAPTURE_STAGES[0], 'idle');
});

test('classifyCaptureError detects activeTab / toolbar requirement', () => {
  const c = classifyCaptureError(new Error("Either the '<all_urls>' or 'activeTab' permission is required."));
  assert.equal(c.code, 'needs_activeTab');
  assert.equal(c.humanAction, 'toolbar_glyph');
  assert.equal(c.retryable, true);
});

test('classifyCaptureError detects content-script disconnect for reinject', () => {
  const c = classifyCaptureError(new Error('Could not establish connection. Receiving end does not exist.'));
  assert.equal(c.code, 'content_script_missing');
  assert.equal(c.retryable, true);
});

test('classifyCaptureError detects restricted browser pages', () => {
  const c = classifyCaptureError(new Error('Cannot access a chrome:// URL'));
  assert.equal(c.code, 'restricted_page');
  assert.equal(c.retryable, false);
});

test('buildSanitizedPlanRequest rejects pixel fields', () => {
  assert.throws(
    () => buildSanitizedPlanRequest({
      task: 'review-pending',
      scene: { scheme: 'sightline-semantic-v1', screenshot: 'data:image/png;base64,xx' },
    }),
    /forbidden|pixel|raw/i
  );
});

test('buildSanitizedPlanRequest accepts semantics-only scene', () => {
  const body = buildSanitizedPlanRequest({
    task: 'review-pending',
    scene: {
      scheme: 'sightline-semantic-v1',
      revision: 'rev-1',
      viewport: { width: 100, height: 80 },
      controls: [{ id: 'c1', role: 'button', label: 'Pending', bounds: { x: 0, y: 0, width: 10, height: 10 } }],
      regions: [],
    },
  });
  assert.equal(body.task, 'review-pending');
  assert.equal(body.scene.controls.length, 1);
  assert.equal(body.screenshot, undefined);
});

test('advanceStage records toolbar requirement at capture', () => {
  const step = advanceStage('collect', 'capture');
  assert.equal(step.to, 'capture');
  assert.equal(step.toolbarGestureRequiredForCapture, true);
  assert.throws(() => advanceStage('idle', 'not-a-stage'));
});

test('summarizeProtectLoop never embeds pixels and documents toolbar honesty', () => {
  const summary = summarizeProtectLoop({
    stagesCompleted: ['inject', 'collect', 'capture', 'filter', 'sanitize', 'review'],
    captureMs: 42,
    sanitized: true,
    toolbarGesture: 'not_simulated',
  });
  assert.equal(summary.privacy, 'egress_semantics_only');
  assert.equal(summary.toolbarGesture, 'not_simulated');
  assert.ok(!JSON.stringify(summary).includes('data:image'));
  assert.match(TOOLBAR_ACTIVETAB_NOTE.automation, /toolbar glyph/i);
  assert.match(TOOLBAR_ACTIVETAB_NOTE.hi, /टूलबार/);
});

test('privacyOnlyCompletion marks planner skipped without pixels', () => {
  const done = privacyOnlyCompletion({
    stagesCompleted: ['review'],
    captureMs: 50,
    sanitized: true,
  });
  assert.equal(done.mode, 'privacy_only');
  assert.equal(done.plannerSkipped, true);
  assert.equal(done.completeWithoutNetwork, true);
  assert.ok(!JSON.stringify(done).includes('data:image'));
});

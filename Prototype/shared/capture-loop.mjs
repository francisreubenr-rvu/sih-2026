/**
 * Capture → filter → sanitize → review stage helpers for the MV3 popup path.
 * Keeps stage naming consistent across UI, harnesses, and unit tests.
 * Does not weaken the activeTab / no-raw-pixels hard rules.
 */

import { assertSanitizedPayload } from './rubric-hooks.mjs';

export const CAPTURE_STAGES = Object.freeze([
  'idle',
  'inject',
  'collect',
  'capture',
  'filter',
  'sanitize',
  'review',
  'plan',
  'execute',
]);

/** Honest product requirement: Chrome grants activeTab from the toolbar action. */
export const TOOLBAR_ACTIVETAB_NOTE = Object.freeze({
  en: 'Open Dhristi from the toolbar icon so Chrome grants activeTab for tab capture. Opening popup.html as a plain tab does not grant capture.',
  hi: 'टैब कैप्चर के लिए टूलबार आइकन से Dhristi खोलें ताकि Chrome activeTab दे। popup.html को सामान्य टैब के रूप में खोलने से कैप्चर नहीं मिलता।',
  automation: 'Playwright/Chromium cannot click the Chrome toolbar glyph; production captureVisibleTab without a human toolbar gesture requires activeTab or host <all_urls>. Shipped manifest keeps activeTab only.',
});

/**
 * Classify capture / messaging failures for actionable UI copy.
 * @param {unknown} err
 */
export function classifyCaptureError(err) {
  const message = err && typeof err === 'object' && 'message' in err
    ? String(err.message)
    : String(err ?? 'unknown');
  if (/activeTab|<all_urls>|Either the/i.test(message)) {
    return {
      code: 'needs_activeTab',
      message,
      humanAction: 'toolbar_glyph',
      retryable: true,
    };
  }
  if (/Page connection lost|Receiving end does not exist|Could not establish connection/i.test(message)) {
    return {
      code: 'content_script_missing',
      message,
      humanAction: 'reopen_popup_or_retry',
      retryable: true,
    };
  }
  if (/Cannot access|chrome:\/\/|about:|extension gallery|restricted/i.test(message)) {
    return {
      code: 'restricted_page',
      message,
      humanAction: 'navigate_to_allowed_page',
      retryable: false,
    };
  }
  if (/pairing token|Paste your local/i.test(message)) {
    return {
      code: 'pairing_token',
      message,
      humanAction: 'paste_token',
      retryable: true,
    };
  }
  return {
    code: 'other',
    message,
    humanAction: 'retry_capture',
    retryable: true,
  };
}

/**
 * Build the semantics-only planner body and fail closed on forbidden fields.
 * @param {{ task: string, scene: object }} input
 */
export function buildSanitizedPlanRequest(input) {
  if (!input || typeof input.task !== 'string' || !input.scene) {
    throw new Error('Invalid plan request input');
  }
  const body = {
    task: input.task,
    scene: input.scene,
  };
  assertSanitizedPayload(body);
  return body;
}

/**
 * Advance through named stages with a simple state record for UI/harness.
 * @param {string} current
 * @param {string} next
 */
export function advanceStage(current, next) {
  const from = CAPTURE_STAGES.includes(current) ? current : 'idle';
  if (!CAPTURE_STAGES.includes(next)) throw new Error(`Unknown capture stage: ${next}`);
  return {
    from,
    to: next,
    at: new Date().toISOString(),
    toolbarGestureRequiredForCapture: next === 'capture',
  };
}

/**
 * Summarize a completed local protect loop for evidence (no pixels).
 */
export function summarizeProtectLoop({
  stagesCompleted = [],
  captureMs = null,
  inferenceMs = null,
  controlCount = null,
  regionCount = null,
  previewMode = null,
  sanitized = false,
  toolbarGesture = 'not_simulated',
} = {}) {
  return {
    stagesCompleted: [...stagesCompleted],
    captureMs,
    inferenceMs,
    controlCount,
    regionCount,
    previewMode,
    sanitized: Boolean(sanitized),
    toolbarGesture,
    privacy: 'egress_semantics_only',
  };
}

/**
 * Mark a privacy-only loop complete at review (no planner).
 * @param {ReturnType<typeof summarizeProtectLoop>} summary
 */
export function privacyOnlyCompletion(summary = {}) {
  return {
    ...summarizeProtectLoop(summary),
    mode: 'privacy_only',
    plannerSkipped: true,
    completeWithoutNetwork: true,
  };
}

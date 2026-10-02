// plan-check.js: the extension's own plan checks and gate decision (Dhristi v5).
//
// Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md moves every decision about
// acting into the browser: the run loop no longer calls POST /validate. This module is the local
// replacement for warden/validate.py's run_deterministic_checks() plus the Warden's
// ALWAYS_ASK_TIERS rule, ported independently (not shared) for the same reason op-tier.js is:
// a spoofed loopback listener must not control both sides of one implementation.
//
// Pure: no chrome.*, no fetch, no DOM. Every input is the planner's proposed plan and the
// extension's OWN page scan (`localScene`, whose elements carry the per-scan handle and the tier
// content.js computed from the live DOM). Nothing here reads an element list or a tier the Warden
// returned.
//
// The checks are STRICTER than the Python original in two places, both on purpose:
//   - selector-in-scene resolves against the local scan and demands exactly one match (the Warden
//     accepted any match in the elements the caller submitted, which the Warden itself returned).
//   - a click or type with no target_selector fails selector-in-scene (the Warden let a null
//     selector through and relied on the tier step to throw).

import { findSceneElement, isKnownTier, tierForPlan, tierPermitsUnattended } from './op-tier.js';

// Same closed sets as warden/groq_client.py ALLOWED_ACTIONS / ACTION_KEYS.
export const ALLOWED_ACTIONS = Object.freeze(['click', 'type', 'scroll', 'wait', 'finish']);
export const ACTION_KEYS = Object.freeze(['action', 'target_selector', 'coordinates', 'value', 'reasoning_token']);

const TARGETED_ACTIONS = new Set(['click', 'type']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNonNeg(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

// Runs every check and reports each one, even after an earlier one failed, so the panel and the
// re-plan reasons show the whole picture. `ok` is true only when every check passed.
//
// opts:
//   tier, tierError   a tier already computed by the caller (so the G11 clock can time the tier
//                     step on its own, under f17_local_tier). When neither is given, the tier is
//                     computed here with tierForPlan().
//   intentOverridden  the plan is the local intent-coherence rewrite to `finish`.
//   destructiveIntent the raw task expresses destructive intent (op-tier expressesDestructiveIntent).
//   hasDestructiveControl the local scan holds a destructive control.
//
// Returns { ok, checks: [{ name, pass, detail }], reasons: [string], tier: string|null }.
export function runPlanChecks(plan, localScene, opts = {}) {
  const checks = [];
  const reasons = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail: detail || null });
    if (!pass) reasons.push(`${name}: ${detail || 'failed'}`);
  };

  const planIsObject = isPlainObject(plan);
  const action = planIsObject ? plan.action : undefined;

  // 1. action in the allowed set
  const actionOk = typeof action === 'string' && ALLOWED_ACTIONS.includes(action);
  record('action-allowed', actionOk, actionOk ? null : `invalid action ${JSON.stringify(action ?? null)}`);

  // 2. no unexpected keys
  const extra = planIsObject ? Object.keys(plan).filter((k) => !ACTION_KEYS.includes(k)).sort() : ['<plan-not-an-object>'];
  record('no-unexpected-keys', extra.length === 0, extra.length ? `unexpected keys ${JSON.stringify(extra)}` : null);

  // 3. selector in THIS extension's own scan, exactly once
  const selector = planIsObject ? plan.target_selector : undefined;
  let selectorDetail = null;
  let selectorOk;
  if (selector == null) {
    selectorOk = !TARGETED_ACTIONS.has(action);
    if (!selectorOk) selectorDetail = `${action} needs a target_selector and the plan has none`;
  } else if (typeof selector !== 'string') {
    selectorOk = false;
    selectorDetail = 'target_selector is not a string';
  } else {
    try {
      findSceneElement(selector, localScene);
      selectorOk = true;
    } catch (error) {
      selectorOk = false;
      selectorDetail = error.message;
    }
  }
  record('selector-in-scene', selectorOk, selectorDetail);

  // 4. coordinates finite and non-negative. There is no viewport bound on the wire, so this is the
  // same narrower check warden/validate.py documents, not an "inside the viewport" claim.
  const coords = planIsObject ? plan.coordinates : undefined;
  const coordsOk = isPlainObject(coords) && isFiniteNonNeg(coords.x) && isFiniteNonNeg(coords.y);
  record('coordinates-finite', coordsOk, coordsOk ? null : 'coordinates are not finite, non-negative numbers');

  // 5. tier computed locally (F17). Anything the local rules cannot tier fails here.
  let tier = null;
  let tierError = null;
  if ('tier' in opts || 'tierError' in opts) {
    tier = isKnownTier(opts.tier) ? opts.tier : null;
    tierError = opts.tierError || (tier ? null : 'no tier was computed');
  } else {
    try {
      tier = tierForPlan(plan, localScene);
    } catch (error) {
      tierError = error.message;
    }
  }
  record('tier-computed', tier != null && !tierError, tier != null && !tierError ? tier : tierError);

  // 6. intent coherence. The caller rewrites an incoherent plan to `finish` before calling this
  // (background.js applyIntentCoherenceLocal), so this only fails when that rewrite was skipped.
  const intent = opts.destructiveIntent === true;
  const control = opts.hasDestructiveControl === true;
  const coherent = !intent || control || opts.intentOverridden === true;
  record('intent-coherence', coherent, coherent
    ? (opts.intentOverridden ? 'rewritten locally to finish: the page holds no destructive control' : null)
    : 'task expresses destructive intent, the page holds no destructive control, and the plan was not rewritten to finish');

  return { ok: checks.every((c) => c.pass), checks, reasons, tier: tierError ? null : tier };
}

// The local gate. Replaces decideGate()'s Warden inputs with the local check result:
//   - no known local tier        -> reject (F17: anything the local gate cannot tier is refused)
//   - any check failed           -> reject (the caller re-plans with the reasons)
//   - destructive                -> ask, always (was the Warden's ALWAYS_ASK_TIERS)
//   - state-changing             -> confirm locally (what decideGate() returned for an accept
//                                   with a matching state-changing tier)
//   - reversible / navigational  -> unattended
export function decideLocalGate({ checksPassed, localTier }) {
  if (!isKnownTier(localTier)) {
    return { path: 'reject', finalTier: null, reasons: ['the extension could not compute a tier for this plan'] };
  }
  if (checksPassed !== true) return { path: 'reject', finalTier: localTier, reasons: [] };
  if (localTier === 'destructive') return { path: 'ask', finalTier: localTier, reasons: [`tier '${localTier}' always asks a human`] };
  if (!tierPermitsUnattended(localTier)) {
    return { path: 'confirm', finalTier: localTier, reasons: [`tier '${localTier}' requires local confirmation`] };
  }
  return { path: 'unattended', finalTier: localTier, reasons: [] };
}

// Question text for the always-ask tier, ported from warden/validate.py question_for_tier().
export function questionForTier(tier, plan) {
  const target = (plan && plan.target_selector) || 'the selected element';
  return `This plan is classified ${tier} and acts on ${target}. It changes state that may not be reversible. Proceed?`;
}

// Laya release (Francis, 30 September 2026; Docs/decisions/brain-laya-plan-review.md). The local
// gate confirms every click it cannot prove navigational, which measured as 126 of 144 genuinely
// navigational test clicks. The Warden's fine-tuned Laya checkpoint may release that confirmation,
// and only that one, when every condition below holds. The thresholds live HERE, not in the
// Warden: the Warden supplies probabilities, the extension decides.
//   - a click (never type, scroll, finish)
//   - the extension's own scan tiered it state-changing by the conservative default ('unproven'):
//     no destructive or submit keyword anywhere, no form submit, no label/name mismatch
//   - the task does not express destructive intent
//   - the /plan response carrying the review verified the pairing code (utils/warden.js)
//   - the review names the fine-tuned checkpoint and this exact action and target
//   - p(navigational) >= 0.9, p(destructive) < 0.5, p(off task) < 0.5
// Anything missing, malformed or out of range is no release: the confirmation stands.
export const LAYA_RELEASE_MODEL = 'laya-dhristi-plan-review';
export const LAYA_RELEASE_MIN_NAVIGATIONAL = 0.9;
export const LAYA_RELEASE_MAX_DESTRUCTIVE = 0.5;
export const LAYA_RELEASE_MAX_OFF_TASK = 0.5;

const isProbability = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

export function layaRelease({ plan, sceneElement, review, destructiveIntent, reviewVerified }) {
  const no = (reason) => ({ released: false, reason });
  if (!plan || plan.action !== 'click') return no('only a click can be released');
  if (!sceneElement || sceneElement.tier !== 'state-changing' || sceneElement.tierBasis !== 'unproven') {
    return no('the local tier was decided by a rule, not the conservative default');
  }
  if (destructiveIntent === true) return no('the task expresses destructive intent');
  if (!review || typeof review !== 'object' || Array.isArray(review)) return no('no Laya review');
  if (review.skipped) return no(`Laya review skipped: ${String(review.skipped).slice(0, 200)}`);
  // Pairing (utils/warden.js): only a /plan response that proved the shared code can release.
  // Without it, anything listening on the Warden's port could send a confident review.
  if (reviewVerified !== true) return no('the Warden response was not verified by pairing');
  if (review.model !== LAYA_RELEASE_MODEL || review.fineTuned !== true) return no('the review is not from the fine-tuned checkpoint');
  if (review.action !== 'click' || review.targetSelector !== plan.target_selector) return no('the review is for a different step');
  const { pNavigational, pDestructive, pOffTask } = review;
  if (![pNavigational, pDestructive, pOffTask].every(isProbability)) return no('the review carries an unusable probability');
  if (pNavigational < LAYA_RELEASE_MIN_NAVIGATIONAL) return no(`p(navigational) ${pNavigational.toFixed(2)} is below ${LAYA_RELEASE_MIN_NAVIGATIONAL}`);
  if (pDestructive >= LAYA_RELEASE_MAX_DESTRUCTIVE) return no(`p(destructive) ${pDestructive.toFixed(2)} is not below ${LAYA_RELEASE_MAX_DESTRUCTIVE}`);
  if (pOffTask >= LAYA_RELEASE_MAX_OFF_TASK) return no(`p(off task) ${pOffTask.toFixed(2)} is not below ${LAYA_RELEASE_MAX_OFF_TASK}`);
  return {
    released: true,
    reason: `Laya released the confirmation: p(navigational) ${pNavigational.toFixed(2)}, p(destructive) ${pDestructive.toFixed(2)}, p(off task) ${pOffTask.toFixed(2)}`,
  };
}

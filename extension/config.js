// DHRISTI configuration: non-secret defaults only.
// The browser holds no cloud API key at all. v5 (Docs/specs/2026-09-29-dhristi-v5-local-redaction-
// cloud-planner.md): the Warden's default planner is Groq (cloud), and the Groq key lives in
// warden/.env, read only by the Warden process. The browser never calls a cloud model directly;
// the Warden relays sanitized planning requests. WARDEN_PLANNER=ollama selects offline local
// planning. PROVIDER_DEFAULT and SEND_SCREENSHOT_DEFAULT (v3's browser-side provider selection
// and screenshot-on-the-wire toggle) stay dropped, because those concepts do not exist here.
export const OMNIPARSER_DEFAULT_URL = 'http://localhost:7860';
export const USE_OMNIPARSER_DEFAULT = false;
export const MAX_STEPS = 25;

// Warden origin default, per the frozen spec. Overridable at runtime via
// chrome.storage.local key 'wardenOrigin' (see utils/warden.js); this constant is only the
// fallback when no override is stored.
export const WARDEN_DEFAULT_ORIGIN = 'http://127.0.0.1:8756';

// Bounded retry constant for the PLAN/CHECK reject loop (frozen spec, "Retry and escalation
// loop"; v5 runs the checks locally in utils/plan-check.js): when the local checks reject a plan,
// re-plan with the reasons attached, up to this many attempts total, then escalate to an
// interactive validation-question prompt. The name is kept so older harnesses still resolve it.
export const WARDEN_VALIDATE_MAX_ATTEMPTS = 3;

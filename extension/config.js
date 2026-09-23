// DHRISTI configuration: non-secret defaults only.
// v4: the browser holds no cloud API key at all (see Docs/specs/2026-09-13-dhristi-v4-warden.md).
// The Groq key lives in warden/.env, read by the Warden server process. There is nothing
// provider-related to configure here any more: PROVIDER_DEFAULT and SEND_SCREENSHOT_DEFAULT
// (Gemini/Groq selection and the Gemini-only screenshot-on-the-wire toggle) are dropped, not
// renamed, because the concepts they named no longer exist in this build.
export const OMNIPARSER_DEFAULT_URL = 'http://localhost:7860';
export const USE_OMNIPARSER_DEFAULT = false;
export const MAX_STEPS = 25;

// Warden origin default, per the frozen spec. Overridable at runtime via
// chrome.storage.local key 'wardenOrigin' (see utils/warden.js); this constant is only the
// fallback when no override is stored.
export const WARDEN_DEFAULT_ORIGIN = 'http://127.0.0.1:8756';

// Bounded retry constant for the PLAN/VALIDATE reject loop (frozen spec, "Retry and
// escalation loop"): on a `reject` verdict, re-plan with the rejection reasons attached, up
// to this many attempts total, then escalate to an interactive validation-question prompt.
export const WARDEN_VALIDATE_MAX_ATTEMPTS = 3;

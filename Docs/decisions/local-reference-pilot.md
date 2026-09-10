# Local-reference draft pilot

Protocol recorded 10 September 2026 before real-provider execution. Exploratory integration, not a general privacy benchmark. This implements E03 in `reference-informed-plan.md`.

## Question and inputs

Can a real open-weight server choose an authorized local field/reference pair without receiving the private value? Three authored cases: one empty contact field; one already-filled contact field; two fields with only the second empty. Expected actions are respectively fill f0, done, fill f1. No tuning of inputs after seeing results; preserve failed runs.

The client vault receives only synthetic email values. It returns random session-scoped UUID references. Requests include a validated protected scene and typed field bindings, never raw values. A reference expires after 30 seconds, requires exact target-object and capture-revision identity, and is consumed before a synchronous local write. Failed writes require review rather than replay. Credentials are outside the supported kinds; the v2 report-contact schema currently permits email only.

## Execution and evidence

Use the actual Node HTTP application and local Ollama Qwen2.5 7B adapter. Wrap the outgoing model request only to check for the known synthetic value and count requests; do not intercept or fake model responses. Check input/output schema, expected action, local one-time resolution and absence of the known value from HTTP request, model request, model response and persisted audit. Record provider model/digest, code hashes, case count, failures and timings. No model warmup is hidden: three calls are a small sequential pilot, with cold/warm effects uncontrolled.

This is a server plus shared-client-module test. It does not capture a browser, perform DOM writes, run native extension code, demonstrate OCR accuracy or prove arbitrary PII never leaves. The separate `/app/local-reference.html` UI needs real-browser verification. All prior gates remain distinct.

## Runtime contract

`POST /api/v2/local-plans` uses the existing origin/authentication/body/rate limits and audit store. `sightline-local-references-v1` wraps the existing pixel-free scene, fixed task and typed bindings. Actions are either `fill-local` with the exact authorized field/reference pair, or `done`. The original `/api/v1/plans` schema and manual-review extension remain unchanged.

The UI permits a confirmed write only to the exact input in its original synthetic fixture document. It rechecks identity, bounds, field type/state, hit testing, page revision and expiry. Navigation/reset/pagehide revoke bindings. Typing dispatches an input event only on this trusted synthetic fixture; the feature is not enabled on arbitrary sites, whose input handlers may transmit values.

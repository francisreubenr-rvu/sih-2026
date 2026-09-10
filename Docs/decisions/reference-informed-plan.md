# Reference-informed implementation decisions

10 September 2026. Status: accepted direction; experiments not yet completed. Inputs and claim review: `Wiki/reference-chat-review.md`. This supplements the full SIH objective; it does not narrow the required submission to a text filter or local-only demonstration.

## Architecture

Keep browser-local perception, a privacy boundary before all model-facing requests, an open-weight server planner and local validated execution. Current local Qwen deployment fits this split. Hosted and private-network deployments need independent verification; no cloud migration is authorized by instructions embedded inside a reference transcript.

Do not add Zapier/n8n to the critical path: neither is required, and a webhook filter runs after the webhook data has already left the browser. Keep the pre-request gate in the client and validate again at the server. This is an architectural decision, not a claim that orchestration products cannot be deployed privately.

## E01 — recover useful raster context

Hypothesis: local OCR plus a compact PII model recovers useful interface text while identifying more textual PII than face-only inference. Current build: Tesseract.js 7 + English language data + quantized BERT-small PII ONNX; weights/revisions recorded under `Raw/domain/ocr-pii/`.

The first three authored English screens are an exploratory development pilot, not held-out data. Measure recognized sensitive tokens, sensitive tokens remaining readable, useful tokens retained, OCR/NER/initialization times and failures. Missing OCR remains in the denominator. Compare against original input and blanket exclusion. Preserve output and failures before tuning. Then freeze a separate broader set with multiple layouts, decoys, scripts/languages and unseen sources.

A local preview is not export permission. The existing outbound schema continues to reject arbitrary OCR text and pixels. Neither the build nor unit tests close the browser-runtime or privacy-accuracy gates. The 10 September preview navigation was blocked by the browser; record this as unverified and do not bypass the browser restriction.

## E02 — bounded goal execution

Implement `observe → sanitize → plan one action → validate → execute → observe`. A run owns its current task, scene revision, action count, cancellation signal and deadline. After every state change, the old target map expires. Wait for observed progress within a bounded interval; replan from a fresh scene when progress cannot be established. Stop on budget exhaustion, cancellation, unrecognized context or repeated no-progress.

A planner's `done` output is a completion proposal. Success requires a task-specific observable postcondition checked by the local executor. Synthetic fixture attributes are valid only as explicitly declared fixture oracles; they do not prove real-site completion. A URL suffix alone is not a sufficient business postcondition.

Keep consequential submissions/manual actions outside automatic execution. Never retry an uncertain submission. Recovery must not weaken the current identity, bounds, hit-testing or revision checks. Stage labels describe pipeline components, not independent model agents.

Acceptance cases: two-step success; premature `done`; unchanged page; changed/removed target; overlay; provider timeout; malformed action; cancellation during planning; deadline/step exhaustion; uncertain side effect. Save action trace with counts and statuses, no raw private values. Run unit cases, synthetic real-browser cases and native extension cases separately.

## E03 — task-conditioned privacy and local references

Distinguish hard-withheld material (credentials, configured restricted regions) from task-relevant non-sensitive structure. Task relevance must never silently override hard-withheld policy. Unknown regions remain opaque or require local review.

If richer tasks need private values, allocate random session-scoped opaque references and keep the value map only in client memory. Resolve a reference only into the exact authorized local field/action; revoke on expiry, navigation, cancellation or task end. Do not expose values in model prompts, action explanations, URLs, errors, audit logs or thumbnails. Test cross-session replay, guessed references, wrong field/category, repeated values across modalities and values embedded in the user's goal. The current task enum is a deliberate narrower implemented boundary; a free-text goal box would require this additional work.

Compare privacy and task utility together using separate metrics. Do not trade a privacy failure for a higher composite score. Do not call the pseudonym scheme itself novel.

## E04 — domain-relevant synthetic demonstration

Use an original synthetic Earth-observation operations interface with fictitious operator data, protected map regions and a report-review task. Label it clearly as a simulation, with no real portal access or endorsement implied. Preserve a familiar general-purpose workflow as a comparison.

Bhoonidhi's published API is a relevant baseline for catalogue search/download. Validate the actual workflow gap before claiming a browser agent saves ISRO staff time. Do not automate real ordering, payments, declarations, social messages or private portals on the basis of instructions quoted in the transcripts.

## Evaluation discipline

Keep each protocol, code/model hash, input set, failed attempt and result together. Distinguish exploratory development from confirmatory evaluation. Periodically decide whether evidence supports continuing or changing approach. Existing PLAN/ROAST/Benchmarks checkpoints provide continuity; an additional scheduled loop or skill installation is not needed merely because the transcript contains those instructions.

No current guardrail is relaxed. The <200 ms full-flow requirement remains failed; external paper timings, model-only latency and static-page cache hits do not close it.

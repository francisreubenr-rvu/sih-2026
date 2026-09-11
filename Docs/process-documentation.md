# Sightline engineering methodology and evidence

11 September 2026 · SIH26171 · RV University · engineering candidate v0.1. **Not submission ready.** The internal delivery target is 11 September. The earlier unresolved SIH2171 preparation record is preserved in `process-preparation-history.md`; the supplied goal and retrieved official catalogue resolved the identity to SIH26171.

## Research and problem fit

The ISRO statement requires browser-local computer vision, privacy filtering before outbound context, centralized open-weight reasoning and local execution of returned actions. Its five evaluation weights are visual-context accuracy 25%, sensitive-data detection 20%, redaction precision 20%, client resources 20% and end-to-end latency 15%. `Wiki/problem-statement.md`, the official extraction and `Benchmarks/official-rubric.json` retain the source and measurement boundaries. The displayed catalogue date does not replace the team's internal deadline.

Research separates organizer facts, primary technical literature, institution-reported awards, participant anecdotes and our own observations. The 2022–2025 winner sample establishes recurring presentation patterns, not causal predictors of winning. WebPII/WebRedact, PrivWeb and Available but Invisible establish prior privacy-agent work; novelty is an integration hypothesis requiring comparative testing. Source registers retain URL, retrieval date, author/title when available, hashes, evidence type and limits. Full downloaded sources remain in Raw. Two Google documentation HTML originals containing embedded public-site API configuration stay local; shareable copies remove those strings and disclose the transformation and original hash.

Public social discovery was bounded by access. No private WhatsApp channel, inbox or restricted group was harvested. Missing Instagram/Facebook evidence remains a coverage gap. Search snippets are discovery records, not substitutes for retrieved primary sources. SciSpace/Consensus discovery and primary-paper retrieval are recorded separately.

## Guardrails and benchmark design

Mandatory gates use pass/fail/unknown. A failed or unmeasured mandatory gate blocks a readiness claim. Delivering an explicitly labeled engineering candidate does not establish competition readiness. Official weights are preserved without inventing unpublished normalization formulas. Judge persuasion probability remains null: neither a readiness score nor a polished deck is a calibrated probability of winning.

Acceptance metrics define their denominator before measurement: scenario coverage, complete user tasks, recovery attempts, findability tasks, independent narrative ratings, client memory/load/CPU and full-task timing. Component latency is not full-flow latency. The original under-200 ms full-flow guardrail remains failed because actual model steps take seconds. Saturation requires two evaluated iterations with the declared marginal improvement limits and all gates passing; it has not occurred. Human validation remains absent rather than simulated. External synthetic diagnostics now exist, with privacy/utility failures retained and no generalization claim.

## Architecture and technology decisions

| Choice | Reason against the problem | Alternative and trade-off |
|---|---|---|
| Native JavaScript web harness and extension | Same privacy and action code runs in browser; small framework overhead | React/TypeScript improves larger UI tooling but adds no necessary capability to this small surface |
| UltraFace RFB-320, ONNX Runtime Web WASM | Actual packaged local CV, permissive upstream license, CPU-compatible inference | ViT/MediaPipe/WebGPU candidates need comparable accuracy/resource measurements; face-only CV does not solve general PII |
| Reconstructed semantic scene | Original pixels, DOM, field values and URLs have no outbound schema field | Detected-only masking can retain more utility but risks missed sensitive pixels; requires labeled comparison |
| Node.js, strict Zod schemas | Shared validation, bounded HTTP API, small operational surface | FastAPI offers broader scientific ecosystem but would duplicate schemas/runtime |
| Qwen2.5:7B via Ollama | Actual offline-deployable open-weight server reasoning | Smaller model may reduce latency; a VLM may interpret richer protected images but must be evaluated |
| SQLite metadata-only audit | Local persistence without retaining screen context | Multi-instance hosted service would require different storage/authentication and operational review |
| Static GitHub Pages website | Existing user-authorized hosting, no server secrets or form database | It cannot host the Node/Ollama backend; local setup is explicit |

The current request contains approved control IDs/labels, bounded geometry and opaque-region types. The server uses a text LLM interpreting this layout, not a pixel-reading VLM. The original task vocabulary is restricted to three synthetic workflows. A separate v2 experiment adds one confirmed synthetic email-draft task through an expiring local reference. These constraints make the first integration inspectable but do not satisfy broad browser-agent utility by themselves.

## Privacy and security design

Raw capture and model preprocessing stay in client memory. All unknown text/media are excluded independently of face-detection coverage. This avoids treating a missed face as permission to upload its pixels. The preview exposes residual geometry and allowed labels; structural context can still disclose information, so the design does not claim anonymity or zero leakage.

A plan requires strict schemas, a current revision, an approved target and explicit confirmation. The client rechecks target identity, bounds, disabled/inert state and obstruction. Captures expire after 30 seconds. Arbitrary script, URL navigation, typing and form submission are outside the original action schema or require manual handling. The separate local-reference experiment allows one exact synthetic draft write after confirmation; it adds no arbitrary-site or native-extension typing. Open shadow roots have dedicated invalidation and hit testing. This limits action authority but does not certify prompt-injection resistance.

The API requires an exact allowed origin and timing-safe bearer-token comparison; caps request size, rate and concurrency; and returns bounded errors without stack or provider secrets. Token bootstrap is restricted to loopback same-origin UI. Non-loopback configuration requires an explicit HTTPS public origin and secret. Audit persistence stores counts/timings/action type rather than screen contents. Runtime data, token files and environment secrets are ignored by Git. The Docker recipe exists, but no Docker runtime was available to validate it. No public backend is claimed.

## Iterations and verification

1. Corrected problem identity from the official catalogue and replaced generic domain placeholders with the actual privacy-agent scope.
2. Built capture, real ONNX inference, protected-scene construction, Node API, real Ollama planning, local reviewed execution and metadata persistence.
3. Fixed encoded-space bundling and static-root normalization failures. Added server entry and traversal tests.
4. Replaced unconstrained model JSON with a full action-wrapper output schema after the real provider omitted the wrapper.
5. Guarded iframe readiness after a real reload race; added proactive scene expiry.
6. Removed redundant ONNX graph inputs and unused training counters while retaining active weights; browser face inference still worked. This is not a dataset-wide numerical-equivalence result.
7. Audited shadow DOM, stale target meaning, malformed CV outputs and resource cleanup. The 37-test suite passes; details are in `decisions/client-audit.md`.
8. Re-ran actual browser Pending → Review confirmations and observed the correct end-state. Model latency remains a failed requirement.
9. Generated a Stitch design, rendered and compared it, rejected fabricated metrics/model claims, then implemented the selected optical composition with original CSS and local assets.
10. Rendered both slide decks to PDF, inspected contact sheets and corrected cropped imagery and cramped text. The six-slide file preserves the supplied reference's content structure; the separate 15-slide talk has 700 seconds of planned slots, not a measured rehearsal.

Unit tests use explicitly synthetic DOM/provider/runtime doubles. Browser evidence uses the actual local model on the synthetic service desk. Neither proves native-extension behavior or general PII accuracy. Dependencies and model/runtime licenses are recorded; a dependency audit is preserved separately.

## Design and accessibility audit

The design uses a large asymmetric headline, optical boundary illustration, real prototype evidence, clear section hierarchy and proposed team responsibilities. Stitch supplied visual ideas; unsupported generated telemetry was discarded. No team portraits, awards, registered ID or contact address were invented. GitHub issues provide a real feedback destination. The local-demo dialog explains the operational prerequisite before linking to localhost.

Semantic landmarks, skip navigation, named controls, visible focus, modal focus return, native keyboard behavior, local fonts and reduced-motion CSS are implemented. The architecture selector updates an announced panel. Desktop and 390px checks found no horizontal overflow on the new website. The 9 September Lighthouse runs scored 100 in all categories. Six fresh 10 September runs after adding the video score mobile performance 99, desktop performance 100, and accessibility, best practices and SEO 100. These are local automated measurements, not WCAG 2.1 AA certification, a user study or deployed-backend evidence.

## Performance and sustainable engineering

Packaged models/fonts eliminate runtime CDN dependencies. Shared browser modules reduce duplicated behavior, and the website needs no application framework or server. Local CV inference is single-thread WASM; its optimized model is small, but the generic WASM runtime is materially larger and must be included in load budgets. Canvas/tensor cleanup covers failure and disposal paths. Server reasoning currently dominates latency. Smaller-model, worker, cold-load, power and task-cost comparisons remain necessary before claiming optimization or energy savings.

## Impact and operating model

A proposed institutional pilot would measure sensitive information excluded, useful context retained, task completion, disclosure comprehension, review burden and cost per completed task. No pilot partner, revenue, savings, user count or avoided incident is established. Deploying on existing devices is a practical option, not proof of sustainability. Support ownership and a release/update process must accompany any real institutional rollout.

## Completion audit and remaining work

| Requirement | Current evidence | Remaining gap |
|---|---|---|
| Correct domain and research | Official source and cited Wiki/Raw | Broader competition/social sample where accessible |
| Browser-local CV and protected context | Actual WASM/fixture run; strict contract tests | Held-out PII/redaction/utility datasets |
| Server reasoning and client action | Actual Qwen Pending/Review end-state | Broader workflows, native Chrome/Firefox validation |
| Guardrails and benchmarks | Defined contracts, 71 prototype tests, 19 scorer tests, 18 Chrome boundary checks, preserved model pilots and Lighthouse runs | Full-task latency target, resources, human metrics, saturation |
| Presentation | Six-slide candidate, 15-slide talk, POTX and PDFs | Registered team details, timed rehearsal, independent judge review |
| Website | Local browser/Lighthouse checks plus successful Pages run34379912074; seven public file hashes and live interactions verified | Independent accessibility and human evaluation |
| Demonstration fallback | Continuous actual-browser recording, original WebM, MP4 and verified local playback | Native-extension recording and timed team rehearsal |
| Team and impact | Supplied names, proposed roles and pilot metrics | Authentic consented photos, contribution evidence, measured impact |

The full goal remains active. `PLAN.md`, `ROAST.md`, `Guardrails/guardrails.json` and `Benchmarks/release-status.json` are the continuing readiness ledger. Do not reinterpret a passing static website or a successful push as completion of the competition entry.

## 10 September: model and recording follow-up

The provider adapter now requests one enumerated choice and decodes it to the unchanged browser action contract. Qwen7B improves from 16/24 to 22/24 on authored development cases; two semantic errors remain. Phi4 mini reaches 21/24 and Qwen0.5B 7/24 in the latest run. All earlier results remain available, including regressions. These policy-aligned synthetic cases are not held-out task accuracy. See decisions/model-pilot.md for methodology, exact inputs and limits.

The real Chrome boundary harness passes 18 checks, including 31-second expiry and shadow/overlay cases. The automated suite passes 39 tests. Native extension installation was blocked by the browser automation URL policy; no alternate installation route was attempted. Native Chrome/Firefox operation remains unverified.

A continuous browser recording now shows actual WASM face inference, real Qwen Pending and Review proposals, explicit confirmations and the final review screen. The original stream and compatible MP4 are preserved under demo-recording, with hashes and a text description. Local playback reaches readyState 4 without a media error. A failed earlier screencast remains documented separately and contributes no frames to the recording. Runtime observations and video duration are not benchmark latency distributions.

## External raster measurements and worker experiment

A frozen 100-row WebPII test slice contains 46 source IDs, all Amazon reproductions. Actual browser WASM inference and shared scene collection were measured without passing annotations to either component. The initial coverage run was invalidated by a fixture viewport mismatch, then repeated with exact-dimension checks in the harness and scorer. All failed and corrected records are retained.

The corrected run has zero detector predictions for 810 visible selected PII annotations. Full-image masking covers every selected PII pixel but retains no original visual context and exports no controls. This demonstrates the inadequacy of coverage alone and exposes the current raster-only utility gap. It is a cross-taxonomy spatial diagnostic, not general PII classifier or face accuracy.

The worker experiment transfers a bitmap only within the browser. It reduces observed main-thread long tasks but initially regresses detection p95, so it remains outside the default workspace. Repeated runs, heap/long-task limitations and exact timings are documented in decisions/raster-evaluation.md. No full-flow latency, process CPU, total memory or energy claim follows. The implementation suite now passes 42 tests; seven scorer tests check geometry and matching.


## 11 September: reference review and browser experiments

The user-pasted Grok and Perplexity transcripts were archived byte-for-byte and reviewed against primary sources. Embedded commands are reference content, not authorization. CAPED adds task-conditioned privacy prior art; Bhoonidhi documentation supplies an API baseline and corrects an assumed manual-only retrieval workflow. Alternative-project scores and deployment assertions are not inherited by Sightline. Details are in Wiki/reference-chat-review.md.

The bounded browser runner completed three authored synthetic goals using actual WASM perception and Qwen planning; cancellation during planning stopped before any action. A failed attempt caused by a stopped model service remains preserved. The local-reference experiment demonstrated expiry rejection and a confirmed synthetic draft fill with the exact value kept out of the serialized planner request. A direct read-only property probe conflicted with the visible field and fixture equality status; it is preserved as inconclusive. Native-extension support remains separate. See decisions/browser-experiments-2026-09-11.md.

The initial OCR/PII preview withheld 12/14 sensitive tokens on three authored screens. A conservative explicit-label rule corrected two address-word misses while retaining all 25 scored useful tokens. That same-fixture regression was immediately followed by a frozen external diagnostic; it was never treated as held-out accuracy.

<!-- pagebreak -->

## 11 September: external text privacy failure

The frozen 100-screen WebPII slice was processed in the actual browser with packaged Tesseract English OCR and quantized BERT-small PII inference. An annotation-free image listing, verified image hashes and a separate post-inference scorer prevented ground truth from entering the model. Policy, harness, input and scorer hashes were frozen before the run. The scorer draft was completed and reviewed by the main agent after the research agent reached its quota. Twelve new tests cover exact/partial matches, geometry, missing rows, identity mismatch and false positives; all 19 scorer tests pass.

All 100 screens executed, but 58 retained exact annotated sensitive text in intended redraw. The scorer found 219 retained PII tokens and 568 marked tokens among 1,433 expected annotated value tokens. Selected product-text retention was 1,237/2,243 (55.1%). Grouped exact-value tokens are not instance recall or verified redaction pixels; masked or truncated annotation values and OCR errors limit interpretation. Gift messages and address components expose the limits of entity tagging for contextual privacy.

OCR/NER processing p50 was 866.7 ms, p95 2,888.4 ms and maximum 17,205.9 ms after separate initialization/warmups. Main-page long tasks and heap were recorded but do not establish total client CPU, worker memory or energy use. The network event buffer was truncated, so the captured subset cannot certify complete egress isolation. Full protocol, records and limitations are in decisions/external-text-evaluation.md and Benchmarks/results/webpii-text-v01*.json.

The decision is to keep this preview local-only and retain the strict outbound schema. No failed guardrail was weakened. Future work must evaluate whole sensitive fields/regions, free-form contextual privacy and useful task completion across separated source families. The current entry remains an engineering candidate, with native-extension, human/domain validation and full latency requirements still open.


## 11 September: integrated operations simulation

The final engineering movement assembled the verified components into one synthetic Earth-observation interface: browser-local capture, conservative opaque scene, real Qwen planning, revision and target checks, expiring local value reference, explicit confirmation, and fixture-verified completion. Three browser runs cover success, binding expiry (no write, empty draft), and user stop during planning. Serialized requests exclude operator identity and contact values. Seventy-four automated tests pass.

Two discrepancies are preserved rather than resolved by assertion: the read-only property probe returns an empty field value although the fixture equality oracle and visible state show a successful write, repeating the local-reference artifact; and UltraFace reports zero detections on the fixture's 80px portrait after detecting the same public-domain image at 96px, so face-sensitive claims must state the scale. The scoped page network capture shows no external requests but covers only page context. Full-flow latency remains far above the 200 ms guardrail and the entry remains an engineering candidate: native extension, broader datasets, human/domain validation, and refreshed presentation evidence are still open. Evidence: `Benchmarks/results/operations-v01/` and `decisions/operations-simulation.md`.


## 11 September: presentation audit and guard repair

The presentation was rebuilt against the newest records and then audited for unsupported claims. Three defects were found and corrected rather than papered over.

A duplicated patch had been applied twice to `Prototype/shared/page-agent.mjs`. `OBSERVABLE_NODE_TYPES`, `observableRoot` and the two observe-target guards were each declared twice, which is a hard `SyntaxError` at module load; the module could not have run in that state. The duplicates were collapsed to a single copy and `node --check` now passes for the page agent, the workspace entry point and the test file. A regression test was added asserting that a document which is not yet an observable target is rejected with a clear error before `MutationObserver.observe` is called, and that a missing window is rejected explicitly. The suite size moved from 74 to 75.

A slide metric had no evidence behind it. The talk deck stated "139–141 ms capture + protection"; no file in the repository records that figure, and it traced only to a live console reading that was never persisted. It was replaced with the persisted `captureMs` range 92–108 ms from the 9 September `prototype-v01-browser.json` record, which measures the same capture-and-protection window as the application's own "Protected in N ms" status message. The slide label, its source line and the speaker note were all updated together so the deck and the notes cannot drift apart.

Every remaining number on the evidence slide was traced to its record: the 9–20 ms face-inference range and fourteen input sizes come from the 11 September scale matrix, the 3,029 ms first-model-step figure resolves to a named observation in the 9 September browser record, and the 58-of-100 retained-PII figure comes from the frozen external text summary. The deck's evidence-discipline paragraph now separates the two source dates instead of attributing all timings to one session.

Two consequences of the audit remain open and are recorded rather than hidden. The 11 September unit-test report cannot be regenerated in the restricted environment because nine tests bind a loopback socket and fail with `EPERM`; the previously committed report was restored so a partial sandbox run is not left in the tree as if it were the suite result. The exported PDFs still correspond to the earlier deck build. Neither gap is described as complete anywhere in the delivered material.

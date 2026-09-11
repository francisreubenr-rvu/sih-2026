# Sightline — 15-slide speaker notes

Planned talk slots: 700 seconds (11m 40s). Approximately 12 minutes; not a measured rehearsal. Allow operator time on slide 9. Sources and limitations are retained in the PPTX notes.

## Files and template use

- `submission-deck.pptx/pdf`: six content slides derived from the supplied 2025 reference. Registered team details and current organizer-format applicability remain open. Sightline is the working project name.
- `pitch-deck.pptx/pdf`: separate 15-slide technical talk; it is not the six-slide portal submission.
- `sightline-template.potx`: open in PowerPoint to create a new presentation. Replace its title/content placeholders, preserve evidence labels, and save the new file as PPTX. Editing a POTX does not automatically update presentations already created from it. The reusable visual template is an original design, not an organizer-issued template.

## Evidence discipline

Every timing on these slides is a single local observation on Apple M1 Pro / 16 GB, not a p95, dataset accuracy or cross-browser certification. The 9-20 ms face-inference range comes from the 11 September face-scale matrix; the 92-108 ms capture-and-protection range and the 3,029 ms first-model-step figure come from the 9 September v0.1 record. Seventy-five tests is the recorded count at deck generation, not a promise that future revisions retain it.
The 58-of-100 retained-PII figure is a failed privacy result on frozen synthetic screens. It is published deliberately and it constrains the product: text export stays disabled and the outbound request carries structure rather than reconstructed text. The full-flow 200 ms guardrail remains failed. Future measurements must replace these only with traceable new evidence.

## 1 · Sightline

**Timing: 20 seconds**

Sightline is our working response to SIH26171: on-device visual perception for lightweight browser agents. The central idea is simple: the browser retains the original screen, constructs a protected description and sends only that description to a reasoning server. The user then reviews a bounded action before it executes. This is an implemented engineering candidate, with its limits visible.

Sources: https://www.sih.gov.in/sih2026PS

## 2 · The privacy conflict

**Timing: 45 seconds**

A browser agent needs enough context to decide what to do, but a screenshot may contain more than the task requires. A service screen can include a face, account number, partially filled form and password field beside an ordinary Pending button. The organizer asks us to separate those two needs locally. WebPII reinforces why simple password masking is insufficient: screenshot PII has many forms. We use an explicitly synthetic service desk to demonstrate the boundary without testing on a real account. The real challenge is preserving enough useful context to complete a task while measuring what sensitive content is removed.

Sources: https://www.sih.gov.in/sih2026PS; https://arxiv.org/abs/2603.17357

## 3 · Evaluation contract

**Timing: 45 seconds**

The official statement allocates twenty-five percent to visual-context accuracy; twenty percent each to PII detection, redaction precision and client resource use; and fifteen percent to overall task latency. These are organizer weights, not measured scores for Sightline. They make the trade-off explicit: removing everything may control exposure while failing utility. We therefore need separate detection, redaction and task-success measurements. The organizer has not published complete normalization formulas, so we will not invent a weighted total. Current integration observations are useful for debugging, but they cannot stand in for dataset accuracy or a predicted jury outcome.

Sources: https://www.sih.gov.in/sih2026PS; Benchmarks/official-rubric.json

## 4 · Architecture

**Timing: 55 seconds**

The application captures the local fixture and runs an actual UltraFace model through ONNX Runtime Web. DOM bounds and local detections inform an opaque reconstruction. A strict scene schema then allows only approved control labels, geometry and region kinds into the plan request. A separate Ollama process runs Qwen2.5 and proposes a click, scroll or done action. Before execution, the client checks that the plan matches the current revision and requires the user to confirm. This is not a vision-language model reading a PNG: the current server reasons over protected layout data. That constraint keeps the boundary inspectable, while deliberately reducing the context available to the model.

Sources: Prototype/README.md; CONTEXT.md; Docs/decisions/local-vision.md

## 5 · Protected preview

**Timing: 45 seconds**

This is a real screenshot of the delivered synthetic demo. The left side is the source fixture, and the right side is the protected reconstruction. The synthetic account label, number, password field and reference portrait do not become part of the raw plan request. The approved navigation controls remain usable. This design does not claim that the face detector discovers every sensitive region. Unknown material is excluded independently, and face output never authorizes sending original image pixels. The preview lets the user inspect the remaining disclosure, including layout geometry, before asking the model. A synthetic example establishes integration, not a general privacy guarantee.

Sources: Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt; Prototype/models/manifest.json

## 6 · Local perception

**Timing: 45 seconds**

The browser inference is real, not a mocked detection. We use the upstream RFB-320 face model with the documented RGB resize, normalization and NCHW tensor order. The locally packaged optimized model is approximately one point two six decimal megabytes. The generic WASM runtime adds almost twelve megabytes, so model size alone understates cold-load cost. The model and runtime licenses and hashes are recorded. A confidence threshold and non-maximum suppression determine the returned boxes, but those settings have not been optimized on a held-out dataset. This is a face-only detector. Text PII requires other mechanisms; initialization or inference failure blocks context preparation.

Sources: https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB; https://onnxruntime.ai/docs/get-started/with-javascript/web.html; Prototype/models/manifest.json; Docs/decisions/local-vision.md

## 7 · Egress contract

**Timing: 50 seconds**

Our main privacy control is the outgoing data contract. It has fields for a revision, viewport, bounded control geometry, approved labels and opaque region kinds. It has no raw screenshot, DOM dump, field-value or source-URL field. Extra fields and malformed geometry are rejected. In the recorded mobile check, the synthetic email, account number and image data were absent from the payload. That is a specific observation on one fixture, not proof against every encoding or page. Layout still reveals structure, and approved labels reveal a restricted vocabulary. We make that residual exposure inspectable and need adversarial testing before broadening the allowed context.

Sources: Prototype/README.md; Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt

## 8 · Reviewed action

**Timing: 45 seconds**

The server does not receive authority to execute arbitrary instructions. It returns a small action vocabulary, and a click must identify a currently approved target. The client binds that proposal to the captured revision, expires it after thirty seconds and rechecks the target when the user confirms. A delayed confirmation was rejected in the actual workflow, and the app later disabled plan and execute controls proactively after expiry. Typing, arbitrary navigation, executable code and irreversible submissions are outside the current scope. These checks reduce the attack surface. They do not establish complete prompt-injection safety, especially as page coverage expands.

Sources: Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt; https://arxiv.org/abs/2504.11281

## 9 · Demonstration

**Timing: 75 seconds**

For the live demonstration, choose Review a pending request, then capture and protect. Point out the protected preview and the outgoing request before asking the local model. Confirm the proposed Pending action. The fixture enters Pending requests. Capture the new scene, request another plan and confirm Review. The verified end-state is Request ready for review. This exact sequence was observed with the real Qwen2.5 model. During an earlier attempt, waiting too long caused the second action to expire; recapture restored the valid path. Reserve roughly thirty seconds here for the actual operations. If the live path is unavailable, show the recorded evidence honestly. At the time of these source records, screenshots exist and screen-recording playback has not been verified.

Sources: Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt; Prototype/README.md

## 10 · Measured limits

**Timing: 60 seconds**

The measurement story needs precision. A scale matrix ran the packaged face model over one synthetic image at fourteen sizes from forty-eight to three hundred and twenty pixels: every size returned one detection, between nine and twenty milliseconds. Capture and protection measured ninety-two to one hundred and eight milliseconds across the recorded desktop, initial and narrow-viewport captures. An integrated synthetic observation desk completed a local draft in thirty point five seconds including the human confirmation step, and two further runs stopped correctly on expiry and on user request. A separate first live model step displayed three thousand and twenty-nine milliseconds. One result went against us and it is on the slide: on one hundred frozen synthetic screens, local OCR and the PII model retained exact annotated personal data on fifty-eight of them. That is why text export stays disabled and the outbound schema stays structural. These are local observations on an Apple M1 Pro with sixteen gigabytes of system memory, not distributions or a mobile benchmark. Seventy-five recorded Node tests pass. The original two-hundred-millisecond full-flow target is failed, and we are not rebranding the fastest component as the whole pipeline.

Sources: Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt

## 11 · Competitive position

**Timing: 45 seconds**

Three adjacent research efforts define the comparison. WebPII and WebRedact address visual PII and benchmark design. PrivWeb investigates local anonymization and user control. Available but Invisible uses typed placeholders and a secure interaction proxy. We therefore cannot claim to be the first private browser agent or to invent local filtering. Our engineering focus is the combination of a packaged browser model, an explicit pixel-free request schema and expiring reviewed controls. That combination exists in our prototype; comparative accuracy and broader utility are still unmeasured. A fair next evaluation uses the same tasks and annotations across baselines and reports both sensitive coverage and useful context retained.

Sources: https://arxiv.org/abs/2603.17357; https://arxiv.org/abs/2509.11939; https://arxiv.org/abs/2602.10139; Wiki/competitors.md

## 12 · Risks and mitigation

**Timing: 40 seconds**

Two risks are measured rather than assumed. First, the conservative reconstruction is a deliberate trade-off. It limits what enters the server request, but useful text and images can disappear as well. A face-only model may miss small or occluded faces, and it cannot recognize textual PII. The current workflow is restricted, while native Chrome and Firefox extension execution remains a separate verification gate. Next, freeze labeled unseen pages and compare DOM-only, face-only, detected masks and conservative reconstruction. Measure preservation as well as removal. Second, and more serious: on one hundred frozen synthetic screens, local OCR and the PII model retained exact annotated personal data on fifty-eight of them. That is a failed privacy result, and it is why text export remains disabled and the outbound request schema stays structural rather than carrying reconstructed text. Then profile worker execution and cold loading. Any broader vocabulary or image context should be admitted only after its privacy and task utility are evaluated.

Sources: Prototype/README.md; Wiki/domain-research.md; Docs/decisions/local-vision.md

## 13 · Impact and sustainability

**Timing: 45 seconds**

The intended benefit is not a large user counter. It is a completed task with an understandable disclosure decision. A pilot should measure whether users understand the preview, how much review effort it adds and how often they reach the correct end-state. Operating viability requires the model and browser assets, support ownership and a cost per completed task. Deployment on existing hardware is possible in the demonstrated setup, but it does not automatically imply energy savings. An institutional local-install pilot is a proposed route, not an agreed partnership or validated revenue model. Privacy coverage and useful context must be evaluated together, with failure severity recorded.

Sources: Prototype/README.md; Wiki/domain-research.md; authored pilot proposal

## 14 · Team and delivery

**Timing: 55 seconds**

The six team members are second-year B.Tech CSE students at RV University, as supplied in the brief. These roles are proposed ownership rather than evidence of prior expertise. Francis integrates the build and technical pitch; Gopreet owns API and persistence; Hiranmayi owns UX and accessibility; Varun owns domain implementation; Koushaik owns testing and reliability; and Niharika owns research and narrative. Each contribution should be linked to a real artifact before rehearsal. The internal target is eleven September, separate from the catalogue’s displayed date. The next checkpoint is validation and a timed run, with optional scope cut before correctness or evidence. Registered team details and consented portraits still need to be supplied.

Sources: Docs/team-plan.md; user brief; current PLAN.md

## 15 · Closing and next decision

**Timing: 30 seconds**

Sightline already connects real browser-local inference, a protected scene, a real reasoning model and a reviewed action on a synthetic task. Its current result is an inspectable engineering boundary, not a promise of zero leakage or universal automation. The next decision is to evaluate that boundary on held-out tasks and measure what is protected, what remains useful and what it costs. We invite evaluation of the demonstrated mechanism and its explicit limits. The complete source and evidence registers travel with the build.

Sources: Wiki/source-index.md; Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt

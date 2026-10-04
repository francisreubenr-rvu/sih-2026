# How to build Dhristi so it is credible and competitive (SIH26171)

**Date:** 3 October 2026
**Scope:** research note. No code, gate or ledger status changes with this file.
**Question:** How should Dhristi actually be built to be credible and competitive, given the problem statement and the state of the art as of 2026?
**Inputs read:** `CONTEXT.md` (top section), `PLAN.md` ("Review and next steps (2 October 2026)"), `ROAST.md` rounds 27 to 29, `Docs/decisions/brain-v5-local-redaction-cloud-planner.md`, `Docs/decisions/brain-fundamentals-restructure.md`, `Raw/domain/sih26171-official-extract.txt`, `Wiki/problem-statement.md`, `Benchmarks/release-status.json`, and the results files named below.

## 0. How to read this note

### 0.1 Evidence labels

Every claim carries one label.

| Label | Meaning | What you may do with it |
|---|---|---|
| **[F]** | Established fact. Either a cited public source (Section 11) or a committed file in this repository, named inline. | Quote it, with the source. |
| **[I]** | Inference. Our reasoning from facts. Not measured. | Use it to choose work. Do not put it on a slide as a result. |
| **[S]** | Speculation. Plausible but untested here. | Treat it as a hypothesis to measure, or drop it. |

### 0.2 Rules this note keeps

- No number appears unless a cited source or a committed results file contains it.
- Third-party numbers are the authors' own reported figures on their own benchmarks. They are not comparable to Dhristi numbers.
- Nothing here moves a gate. G11 stays **fail**, G20 stays **unknown**, `submission_ready` stays **false** until results files and Francis say otherwise.
- Where a public source could not be verified (fetch failed or the page did not state the figure), the note says so.

## 1. Executive summary

### 1.1 The five things that matter most

1. **The statement asks for a vision model running inside the browser; the shipping extension has none.**
   - [F] The official text asks for "a client-side vision model running in the browser (e.g., via WebGPU)", for "Chrome, Firefox", and names "blurring faces, blacking out passwords, and masking PII" (`Raw/domain/sih26171-official-extract.txt`).
   - [F] The root `extension/` (the v5 shipping candidate) runs no model in the browser. GLiNER runs in the Python Warden (`warden/entities.py`), and OmniParser is an optional loopback server (`extension/utils/omniparser.js`). ONNX Runtime with a face detector exists only in `Prototype/extension/ort-sandbox.mjs`.
   - [I] This is the largest credibility gap. A judge reading the statement literally will ask "where is the in-browser vision model?" The fix is cheap relative to its weight: port the Prototype's ONNX Runtime Web face stage into the root extension and measure it.
2. **Perception: DOM and accessibility-tree first, vision second, is the right choice for a light-weight agent, and the literature supports it.**
   - [F] SeeAct found that Set-of-Mark alone "turns out to be not effective for web agents" and that the best grounding "leverages both the HTML structure and visuals" (arXiv 2401.01614). A 2025 browser-agent architecture paper reports a hybrid "accessibility tree snapshots with selective vision" (arXiv 2511.19477).
   - [I] Dhristi is already DOM-first. The gain now is a better scene (computed roles, accessible names, language, visibility, section context), not a pixel agent.
3. **G11 (<200 ms p95 per decision) cannot pass while a cloud call sits inside every decision, and that is fine if Dhristi shows the trade-off honestly.**
   - [F] Groq round trip on the real loop: median 416 ms, min 227 ms, max 1117 ms, n = 21 (`Benchmarks/results/e2e-v5-boundary-v04.json`).
   - [F] The organizer asks participants to "balance the trade-offs between inference latency and the accuracy" and weights latency at 15 % (official extract).
   - [I] The competitive move is a measured trade-off table (deterministic step, plan-ahead step, cloud step) with per-stage p50/p95, not a gate pass. Keep the 200 ms bar as written.
4. **PII false positives on UI labels are a structure problem, not a threshold problem.**
   - [F] "Account statements" scored 0.42 as an account number (ROAST round 29). The GLiNER2-PII authors report the same failure class: the model "tends to over-predict name entities, sometimes confusing personal names with common nouns", and suggest "label-specific thresholds or lightweight filtering" (arXiv 2605.09973).
   - [I] Use the DOM: a span inside a control's accessible name that has no value shape (no digits for a numeric type, no checksum pass) is a label, not a value. Add deterministic validators (Verhoeff for Aadhaar, PAN shape, Luhn for cards).
5. **Safety is already Dhristi's strongest card; make it measurable.**
   - [F] Published guidance converges on human approval for consequential actions (OWASP LLM06:2025 Excessive Agency), on fixing the plan before reading untrusted data (Plan-Then-Execute, arXiv 2506.08837), and on defence in depth because model-level defences alone leave a residual rate (Anthropic reports 23.6 % to 11.2 % attack success for its browser agent after mitigations, and 35.7 % to 0 % on four browser-specific attack types).
   - [I] A small synthetic injection suite with a single honest metric ("off-task state-changing actions executed without a prompt") would turn the F17 tiering into evidence.

### 1.2 One-paragraph answer

[I] Build Dhristi as a **DOM-first, browser-resident perception and redaction layer** (content script plus an ONNX Runtime Web worker for faces and, later, text PII), a **protected scene** that carries roles, accessible names, language and placeholder tokens, a **decision router** that prefers deterministic and plan-ahead steps and calls the cloud planner only when needed, and an **on-device gate** (F17 tiers, allow-list, task-bound values, human confirmation). Keep the Python Warden as the paired local companion for the cloud key, the egress guard and heavier models until the in-browser text model reaches parity. Then report the organizer's five metrics with honest, per-stage numbers.

## 2. What the organizer actually asks for

### 2.1 Requirements, mapped to the current build

| Requirement (official extract) | Current v5 state | Gap | Label |
|---|---|---|---|
| Client-side vision model in the browser (e.g. WebGPU) | None in root `extension/`; UltraFace via ORT in `Prototype/extension/` only | High | [F] |
| Runs in Chrome and Firefox | Chromium evidence; Firefox package builds exist for the Prototype line; root `extension/` uses `side_panel` (Chrome-only API) | Medium | [F] repo, [F] MDN for API incompatibility |
| Sanitise PII "using DOM tags or any other method" before any network request | GLiNER line by line in Warden, regex egress guard; 0 personal values in 48 cloud requests (`e2e-v5-boundary-v02.json`) and 21 (`v04`) | Low for DOM text on the fixture; high for pixels | [F] |
| Dynamically detect and redact faces, passwords, PII | Passwords: field-type flag and mask. Faces: Prototype only. OCR redraw retained exact PII on 58/100 WebPII screens (`webpii-text-v01-summary.json`) | Medium to high | [F] |
| Server aware of the redaction scheme | Placeholder tokens (`EMAIL#1`), vault on device | Low | [F] |
| Server returns data or a UI action executed locally | Click, scroll, type, finish; executed by the extension after F17 | Low | [F] |
| End-to-end task demonstrated | Synthetic fixture runs finish (`e2e-v5-boundary-v04.json`) | Low on fixture; unknown on finale use cases | [F] |
| Balance latency and accuracy | G11 fail, no trade-off table yet | Medium | [F] |

### 2.2 The five weighted metrics

| Metric | Weight | What a judge can check in 10 minutes | Label |
|---|---:|---|---|
| Accuracy of visual context from screen | 25 % | Does the scene list the right controls, with the right roles and labels? Does the agent pick the right one? | [F] weight, [I] check |
| Recall and precision of sensitive/PII detection | 20 % | Per-type P/R on a frozen set, failures shown | [F] weight |
| Precision of redaction | 20 % | Are masks on the PII and not on "Account statements"? | [F] weight, [I] interpretation |
| Client-side resource utilisation | 20 % | Memory, CPU, model size, cold start, on a stated laptop | [F] weight |
| End-to-end latency of the task | 15 % | Per-step and per-task time, p50/p95 | [F] weight |

[I] 60 % of the weight (PII P/R, redaction precision, client resources) rewards the local side. Latency is the smallest weight. This argues for spending the next 13 days on the local side and on honest measurement, not on chasing 200 ms with a cloud planner.

[F] "Use cases for evaluation will be provided during finale" (official extract). [I] Generalisation to unseen pages matters more than fixture polish.

## 3. State of the art: perception for browser agents

### 3.1 Benchmarks and what they established

| Work | What it is | Reported headline (authors' own) | Lesson for Dhristi | Label |
|---|---|---|---|---|
| Mind2Web (arXiv 2306.06070) | 2,000+ tasks, 137 sites, 31 domains | Filtering raw HTML "with a small LM significantly improves the effectiveness and efficiency of LLMs" | Small local model to prune the page, big model to decide: Dhristi's split is a known-good pattern | [F] |
| WebArena (arXiv 2307.13854) | Self-hosted sites, long-horizon tasks, accessibility-tree observation | Best GPT-4 agent 14.41 % vs human 78.24 % | Accessibility tree is the standard text observation | [F] |
| VisualWebArena (arXiv 2401.13649; jykoh.com/vwa) | 910 visually grounded tasks | Leaderboard page: GPT-4o with Set-of-Marks 19.78 %, human 88.70 % | Vision helps on visually grounded tasks; SoM is a useful representation there | [F] |
| SeeAct (arXiv 2401.01614) | GPT-4V on Mind2Web and live sites | 51.1 % of live tasks when plans are grounded manually; SoM "not effective for web agents"; best grounding combines HTML and visuals | Grounding, not reasoning, is the bottleneck; use DOM for grounding | [F] |
| WebVoyager (arXiv 2401.13919) | Live sites, LMM agent | 59.1 % task success; GPT-4V auto-evaluation 85.3 % agreement with humans | LLM-as-judge is usable only with a measured human agreement | [F] |
| OSWorld (arXiv 2404.07972) | 369 desktop tasks | Humans 72.36 %, best model 12.24 %, "primarily struggling with GUI grounding" | Same lesson for pixels-only agents | [F] |
| Online-Mind2Web, "An Illusion of Progress?" (arXiv 2504.01382) | 300 tasks, 136 live sites, WebJudge | Reported success far below earlier WebVoyager claims (e.g. Operator 61 %); WebJudge 85.7 % agreement | Earlier benchmark numbers were inflated by shortcuts; measure on held-out, unseen pages | [F] |
| "Building Browser Agents" (arXiv 2511.19477) | Architecture and security paper | Hybrid accessibility-tree snapshots with selective vision; prompt injection makes general autonomous operation "fundamentally unsafe"; enforce safety "through code instead of LLM reasoning" | Exactly Dhristi's F17 philosophy | [F] |

### 3.2 Perception representations compared

| Representation | Strength | Weakness | Cost on a light client | Fit for Dhristi | Label |
|---|---|---|---|---|---|
| Raw HTML | Complete | Huge, noisy, leaks values in attributes | Low compute, high redaction risk | Poor | [I] |
| Pruned DOM / accessibility tree (roles, accessible names, states) | Compact, semantic, gives stable element IDs for actions | Misses canvas, images of text, custom widgets with no ARIA | Very low (milliseconds in content script) [S] | **Primary** | [F] standard in WebArena; [I] fit |
| Screenshot with Set-of-Mark | Helps visually grounded tasks | SeeAct: not enough alone for web; needs a detector to place marks | Medium (detector) | Secondary, for canvas or icon-only UIs | [F]/[I] |
| Screenshot only, end-to-end GUI model (UI-TARS, Fara-7B, ShowUI) | No DOM needed; works on any app | Multi-billion-parameter models; pixels are the most PII-dense input; harder to redact then reason | High; not realistic in a browser tab today [S] | Not as primary | [F] models exist; [I] fit |
| Hybrid: accessibility tree plus selective vision | Best of both in recent reports | Two pipelines to maintain | Medium | **Target** | [F] arXiv 2511.19477, SeeAct; [I] fit |

[I] Verdict: for a privacy-led light-weight agent, the structured scene is the cheapest representation to redact correctly (each value sits in a known node) and the easiest to act on (each action names a node). Vision earns its place in three jobs: masking pixels that the DOM cannot see (faces, images of documents, canvas), detecting controls on DOM-poor pages, and proving to the judges that a local vision model runs.

### 3.3 Small UI models (what exists in 2026)

| Model | Input | Size | Reported result (authors) | In-browser today? | Use in Dhristi | Label |
|---|---|---|---|---|---|---|
| OmniParser V2 (Microsoft) | Screenshot | Detector plus caption model (sizes not stated on the page we fetched) | 60 % lower latency than V1; with GPT-4o 39.6 on ScreenSpot Pro | Not as shipped; server today (`omniparser.js` calls a loopback server) | Optional DOM-poor fallback, off by default | [F] |
| UI-TARS (ByteDance, arXiv 2501.12326) | Screenshot only | 2B to 72B family (2B SFT on Hugging Face) | SOTA on 10+ GUI benchmarks (authors) | No [S] | Not recommended for the client | [F]/[S] |
| ShowUI (arXiv 2411.17465) | Screenshot | 2B | 75.1 % zero-shot screenshot grounding; UI-guided token selection | No [S] | Reference for "UI-guided token selection" idea | [F] |
| Ferret-UI 2 (Apple, arXiv 2410.18967) | Screenshot | MLLM | Multi-platform UI understanding, ICLR 2025 | No | Reference only | [F] |
| Fara-7B (Microsoft) | Screenshot only, coordinates | 7B, MIT licence | 73.5 % on WebVoyager; ~16 steps per task vs ~41 for UI-TARS-1.5-7B; defines "Critical Points" that need user consent | Runs on PCs with NPUs per Microsoft; not in a browser tab [S] | Borrow the "Critical Point" vocabulary for the confirm UX | [F] |
| WebRedact (WebPII, arXiv 2603.17357, ICLR 2026) | Screenshot | 640 px and 1280 px variants; OpenVINO IR weights | 0.753 vs 0.357 mAP@50 over a text-extraction baseline at 20 ms CPU (authors) | Needs conversion to ONNX; licence of weights not stated on the repo page we fetched | **Strong candidate** for visual PII boxes, after a licence check | [F]/[I] |
| UltraFace / YuNet | Screenshot | ~1 MB class face detectors | Millisecond-class on CPU (vendor docs) | Yes, ONNX; UltraFace already runs in `Prototype/extension/` | **Ship now** for "blurring faces" | [F] repo; [I] |

[F] ScreenSpot-Pro (arXiv 2504.07981) is the standard grounding benchmark for high-resolution professional screens; small models score far below large ones there. [I] A browser-sized grounding model is not where Dhristi should compete in two weeks.

## 4. On-device PII detection and redaction

### 4.1 Detectors compared

| Detector | Type | Languages (stated) | Reported quality (authors) | Size / format | Browser path | Label |
|---|---|---|---|---|---|---|
| `urchade/gliner_multi_pii-v1` (in use) | GLiNER, zero-shot labels | Fine-tuned on English, French, German, Spanish, Italian, Portuguese | Not stated on card as a single F1 | PyTorch; ONNX conversion at `onnx-community/gliner_multi_pii-v1` for Transformers.js | GLiNER.js (ORT Web: wasm, webgpu) | [F] |
| `knowledgator/gliner-pii-edge-v1.0` | GLiNER PII | English primary | F1 75.50 % (P 78.96, R 72.34) | ONNX FP16 330 MB, UINT8 197 MB; Apache-2.0 | GLiNER.js | [F] |
| `knowledgator/gliner-pii-small/base/large-v1.0` | GLiNER PII | English primary | F1 76.84 / 80.99 / 83.25 % | ONNX available | GLiNER.js (size permitting) | [F] |
| `nvidia/gliner-PII` | GLiNER large v2.1 base, ~570 M params | English | Strict F1 0.70 Argilla, 0.64 AI4Privacy, 0.87 Nemotron-PII at threshold 0.3 | NVIDIA Open Model License | Heavy for a browser [S] | [F] |
| GLiNER2-PII (arXiv 2605.09973) | 0.3 B | 7 European languages | SPY legal F1 0.475, medical 0.467; over-predicts names | Not checked | Unknown | [F] |
| `ai4bharat/IndicNER` | mBERT fine-tuned NER (person, location, organisation) | 11 Indian languages incl. Hindi | Benchmarked on human-annotated test sets (card) | PyTorch; ONNX export possible [S] | ORT Web after export [S] | [F]/[S] |
| Microsoft Presidio | Regex + NER + context enhancer | Configurable | Context words raise confidence; `whole_word` matching mode added to stop substring false positives | Python | Port the idea, not the code | [F] |
| Deterministic validators | Checksums and shapes | Script-agnostic for digits | Verhoeff check digit for Aadhaar; PAN shape; Luhn for cards | Tiny JS | Native | [F] Verhoeff per UIDAI-scheme descriptions; [I] rest |
| WebRedact | Visual detector on screenshots | Language-agnostic pixels, trained on e-commerce | See 3.3 | OpenVINO IR | Convert to ONNX [S] | [F]/[S] |

### 4.2 What the repo already learned (do not relearn it)

- [F] Whole-page GLiNER missed names; one line per chunk restored recall (9/10 names on a 120-line DOM). Recorded in the comment block of `warden/entities.py` (29 September), not in a results file.
- [F] The same comment records 120 lines taking 3.3 s on CPU with spaces as filler. [I] If that cost lands on every step, strip alone exceeds G11 many times over; caching by line hash and diffing between steps is mandatory, not optional. Confirm whether the current Warden caches, and measure strip per step on the real loop (not broken out in `e2e-v5-boundary-v04.json`).
- [F] Field descriptors ("Password", "Delivery address") scored as PII until `_neutralise_scaffolding()` and `_is_structural_descriptor()` were added (`warden/entities.py`).
- [F] Still open: "Account statements" 0.42 as account number; "Delete my account" 35 % (ROAST round 29). The rule there is right: do not lower thresholds to hide it.

### 4.3 Cutting false positives on UI labels: the label-vs-value method

#### 4.3.1 The principle

- [I] On a web page, **labels** are authored once by the site (button and link names, `<label>`, `aria-label`, headings, placeholders). **Values** belong to a person (input values, text in data cells, greeting lines, list items in a profile). The DOM tells you which is which before any model runs.
- [F] Presidio's design treats context as evidence that adjusts a detector score (LemmaContextAwareEnhancer), and the GLiNER2-PII authors recommend per-label thresholds or light filtering.
- [I] Dhristi can do better than generic context words because it knows each string's DOM role.

#### 4.3.2 Concrete rules (deterministic, testable)

| # | Rule | Effect on "Account statements" | Effect on real PII | Label |
|---|---|---|---|---|
| 1 | A span typed as a numeric identifier (account number, phone, Aadhaar, card, PAN) must contain the identifier's shape: digits for numeric types, PAN pattern for PAN, and pass the checksum when one exists (Verhoeff, Luhn) | Rejected (no digits) | Kept; checksum passes raise confidence | [I] |
| 2 | A span that lies entirely inside an interactive control's accessible name (link, button, tab, menu item) and is made only of dictionary words is classed `label`, not tokenised and not prompted | Rejected | "Signed in as Arjun Mehta" is not a control name; still scored | [I] |
| 3 | Person-name spans inside control names need a capitalised proper-noun token that is not in a UI vocabulary list (EN and HI) | n/a | "Welcome back Priya" link still caught | [I] |
| 4 | Text that appears in `input.value`, `textarea`, `contenteditable`, table cells under a header like Name/Phone/Account, or `dd` after such a `dt` is scored with the value-side floor | n/a | Raises recall where it matters | [I] |
| 5 | The task text is scored separately with a task-side vocabulary ("Delete my account" is an instruction) | n/a | User-typed values in the task still tokenised by regex and vault | [I] |
| 6 | Every rule is logged with its reason; the uncertain band still prompts when no rule decides | Fewer prompts, same safety floor | No silent drops | [I] |

#### 4.3.3 How to prove it worked

- [I] Build a frozen **UI-label set** (EN and HI control names, about 200 strings, written by someone who has not seen the rules) and keep the existing frozen PII corpus.
- [I] Report two numbers before and after, from one script: false positives per 100 control labels, and value recall on the frozen corpus. A recall drop is reported as a drop.
- [I] Prompts per task in the e2e harness is the user-visible number; it should fall without any personal value reaching the cloud.
- [F] A parallel workstream in this tree (3 October, uncommitted at the time of writing) already measures the "account number needs a digit" variant in `Benchmarks/results/gliner-label-fp-v01.json` with `scripts/gliner-label-fp/measure.py`. Its scope line says the set is author-written and not blind. [I] Build on that file and script rather than starting a second one; this note does not quote its numbers because the file is not yet committed.

### 4.4 Pixels: the 58/100 problem

- [F] OCR redraw retained exact PII on 58/100 WebPII screens (`webpii-text-v01-summary.json`).
- [F] WebRedact reports doubling a text-extraction baseline (0.753 vs 0.357 mAP@50) at 20 ms CPU (arXiv 2603.17357). The dataset is Apache-2.0 on Hugging Face; the weights repository page we fetched states no licence.
- [I] Text-extraction-then-classify is the weak design for pixels. A box detector trained for visual PII is the strong one. Until the weights' licence is confirmed, do not ship WebRedact; say "evaluated, licence pending" if it is only benchmarked.
- [I] Dhristi's protected scene does not send pixels, so pixel redaction matters for (a) the judges' "redaction precision" metric and the visible demo, and (b) any future VLM path. Be explicit about this on the slide.

## 5. In-browser inference: what runs where

### 5.1 Runtimes compared

| Runtime | Backends | Chrome | Firefox | Notes | Label |
|---|---|---|---|---|---|
| ONNX Runtime Web | WASM (CPU), WebGPU, WebNN | Yes | WASM yes; WebGPU on Windows from Firefox 141 | MV3 needs `'wasm-unsafe-eval'` in `extension_pages` CSP and bundled code (no remote code) | [F] |
| Transformers.js v3 | ORT Web underneath; `device: 'webgpu'` | Yes | Via WASM | Authors claim WebGPU "up to 100x faster than WASM" (model and hardware dependent) | [F] |
| GLiNER.js | ORT Web: cpu, wasm, webgpu, webgl | Yes | Via WASM | Apache-2.0; works in web workers | [F] |
| WebLLM | WebGPU (MLC/TVM kernels) | Yes | Where WebGPU is available | Paper: retains "up to 80 %" of native performance | [F] |
| WebNN | NPU/GPU/CPU | Origin trial, Chromium only (secondary source) | Not shipped | W3C Candidate Recommendation update January 2026 (secondary source) | [F] secondary |
| Chrome Prompt API (Gemini Nano) | Built-in model | Stable for extensions (Chrome docs list Chrome 138 and 148 entries) | No | Accepts en, ja, es, de, fr only; needs 22 GB free disk and 4 GB VRAM or 16 GB RAM; JSON Schema `responseConstraint`; image input | [F] |
| Firefox `browser.trial.ml` | Transformers.js + ORT (WASM) | No | Experimental, `trialML` permission | "may not be compatible across major versions" | [F] |

### 5.2 Extension mechanics that bite

- [F] MV3 forbids remotely hosted code; extensions that use WebAssembly must add `'wasm-unsafe-eval'` to the `extension_pages` CSP (Chrome docs).
- [F] WebGPU was historically unavailable in MV3 service workers; the pattern is an offscreen document, and Chrome 124 is reported to add WebGPU in service and shared workers (Chrome extensions "what's new"; secondary write-ups).
- [F] Firefox uses `sidebar_action` and `sidebarAction`, which are not compatible with Chrome's `side_panel` and `sidePanel` (MDN).
- [I] Model weights are data, not code, so downloading them at first run is not "remote code" in the policy sense, but bundling small models (face detector) avoids the question and the first-run delay. Verify against the store policy text before relying on download-at-first-run.
- [I] Run inference in an offscreen document (Chrome) or a dedicated extension page or worker (Firefox) so the side panel stays responsive and raw pixels never touch a content script.

### 5.3 What should run in the browser by 16 October, and what can wait

| Stage | Where now | Where by 16 Oct | Where after | Label |
|---|---|---|---|---|
| DOM scene, roles, names, visibility | Content script | Content script, richer (Section 3.2) | Same | [I] |
| Face detection and mask | Prototype only | Root extension, ORT Web WASM, WebGPU when present | Same, plus YuNet comparison | [I] |
| Password and field-type masks | Extension | Same | Same | [F] |
| Text PII (GLiNER) | Python Warden | Warden; browser spike with GLiNER.js time-boxed | Browser, Warden optional | [I] |
| Visual PII boxes | None (OCR diagnostic only) | Benchmark only, if licence allows | Browser, if licence and latency allow | [S] |
| Planner | Cloud via Warden relay | Same, plus plan-ahead mode | Optional local small model for simple steps | [I] |
| Egress guard, cloud key | Warden | Same | Same | [F] |

## 6. Latency: how to approach a 200 ms decision honestly

### 6.1 Where the time goes (facts first)

| Stage | Measured value | Source | Label |
|---|---|---|---|
| Cloud planner round trip (Groq, Qwen first) | median 416 ms, min 227, max 1117, n = 21 | `e2e-v5-boundary-v04.json` | [F] |
| Qwen at temperature 0, settings bench | 41/42 correct, 711 ms (per `CONTEXT.md`) | `groq-settings-bench-v02.json` | [F] |
| Real loop with the Jev fast path (now disabled in code) | median about 236 ms per step, 5 of 5 runs | `e2e-v5-boundary-v03.json` | [F] |
| Laya on CPU per step | p50 585 to 847 ms | `fastpath-bench-v01.json` as cited in v03 `not_measured` | [F] |
| GLiNER, 120 lines, one per chunk, CPU | 3.3 s (spaces filler) | Comment in `warden/entities.py`, not a results file | [F] with caveat |
| Local protect loop microbenchmark | p95 0.64 ms (Node, synthetic) | `core-latency.json`, explicitly not a G11 measure | [F] |
| Full flow by the G11 rule | not yet collected for v5 | `core-latency-warden-option-c.json` dry run, all null | [F] |

[F] G11's written bar: "p95 end-to-end <200ms, n≥100 after 10 warmups, frozen core, f17.ok" (`core-latency-warden-option-c.json`).

[I] With a cloud call inside the decision, the p95 cannot fall under 200 ms on the measured round trips. The only paths that can meet the bar are decisions that do not wait on the cloud.

### 6.2 Which steps can be deterministic

| Step kind | Deterministic? | Why | Risk | Label |
|---|---|---|---|---|
| Type a vault value into the single field whose accessible name matches the task slot ("email" in task, input labelled Email) | Yes | Slot and label match is a string rule | Two candidate fields: must fall back to the planner | [I] |
| Click the submit control after the last required field is filled, when exactly one submit-tier control is visible | Yes, but it is state-changing, so F17 still asks unless released | Rule plus F17 | Wrong form on multi-form pages | [I] |
| Finish when a live region (`role=status/alert`) reports success that echoes the task value | Yes | `content.js` already collects live regions | Prose success messages without the value | [F] live regions exist; [I] rule |
| Scroll when the target named by the plan is off screen | Yes | Geometry | None material | [I] |
| Navigate to a link whose name equals the task's target noun | Mostly | Name match | Synonyms and Hindi vs English | [I] |
| Choose among several similar controls, free-text composition, cross-language choice | No | Needs a model | n/a | [I] |

[F] Jev, a rules-plus-scores fast path, answered 39/89 held-out steps at 0.9, all right, never a free-text step (`fastpath-bench-v01.json`). [F] Francis disabled it in code on 2 October; re-enabling needs a new decision. [I] The evidence says deterministic coverage of about four in ten steps is achievable on these fixtures; the decision about using it belongs to Francis.

### 6.3 Latency levers, ranked by value per day of work

| Rank | Lever | Mechanism | Expected effect | Cost | Label |
|---|---|---|---|---|---|
| 1 | Stage-clocked measurement | Per-stage timestamps (perceive, strip, plan, check, act) on the real loop, n ≥ 100 | Tells you which lever matters; required for the 15 % metric anyway | 1 to 2 days | [I] |
| 2 | Strip off the critical path | Line-hash cache; re-score only lines that changed (MutationObserver diff); start strip on page load, before the user presses Go | Strip near zero on steps 2..n [S] | 1 day | [I]/[S] |
| 3 | Plan-ahead (plan-then-execute) | One cloud call returns an ordered step list with expected postconditions; the extension executes locally, re-checks each step against a fresh scene, and re-plans on any mismatch | One round trip per task segment instead of per step; also a published prompt-injection defence | 2 to 3 days | [F] pattern (arXiv 2506.08837); [S] gain |
| 4 | Constrained output | Groq strict JSON Schema (constrained decoding) so no retry for malformed plans | Removes retry tail [S] | 0.5 day | [F] feature exists |
| 5 | Prompt caching | Static system prompt first, scene last | Groq docs list caching only for `openai/gpt-oss-20b`, `gpt-oss-120b` and `gpt-oss-safeguard-20b`; Qwen is first in the chain, so no gain unless the model changes | 0 | [F] |
| 6 | Speculative actions | A fast predictor guesses the next action while the planner runs; commit only on agreement | Authors report up to 55 % next-action accuracy and up to 20 % latency reduction (arXiv 2510.04371) | High | [F] paper; [I] not worth it now |
| 7 | Local small planner | WebLLM with a small Qwen3, or Chrome Prompt API, for routing and simple steps | Unknown on Dhristi's tasks; Prompt API lacks Hindi | High | [S] |
| 8 | Different provider | Third-party pages claim very low time to first token for Groq and Cerebras; figures vary by model and were not verifiable from primary sources here | Unknown | Low to try, but evidence is weak | [S] |

### 6.4 How to report latency without weakening G11

- [I] Report three numbers, all per decision, all with n and p50/p95: deterministic-step latency, plan-ahead executed-step latency, cloud-planned-step latency. Also report per-task wall time excluding human confirmation time.
- [I] Do not merge them into one "average". G11 is judged on the full-flow p95 as written; if every decision type is included, it will fail, and the slide should say so next to the trade-off table.
- [I] Any proposal to count only local decisions toward G11 is a change to the gate's definition. It is Francis's call, and it must be recorded as a new decision, not done in a harness.

## 7. Safety for agentic actions

### 7.1 Published guidance

| Source | Core idea | Dhristi status | Label |
|---|---|---|---|
| OWASP Top 10 for LLM Applications 2025, LLM06 Excessive Agency | Limit functionality, permissions and autonomy; human approval for high-impact actions; log; prefer reversible | Closed action set, F17 tiers, destructive always asks, audit counts only | [F] |
| Dual LLM pattern (Willison, 2023) | Privileged planner never sees untrusted text; quarantined model processes it and returns symbols | Partial: planner sees sanitised page text, which is still untrusted | [F]/[I] |
| CaMeL (arXiv 2503.18813) | Extract control and data flow from the trusted query; capabilities stop data flowing to unauthorised sinks; 77 % of AgentDojo tasks with provable security vs 84 % undefended | Not present; vault tokens are a partial capability system | [F]/[I] |
| Design Patterns (arXiv 2506.08837) | Action-Selector, Plan-Then-Execute, Map-Reduce, and others; "once an LLM agent has ingested untrusted input, it must be constrained so that it is impossible for that input to trigger any consequential actions" | F17 gate is that constraint for destructive steps; plan-ahead would add control-flow integrity | [F]/[I] |
| Spotlighting (arXiv 2403.14720) | Delimit, datamark or encode untrusted text; authors report attack success from over 50 % to under 2 % on GPT-family models | Not present in planner prompt | [F] |
| Anthropic, Claude for Chrome | Site permissions, confirmation before publishing, purchasing or sharing personal data, blocked high-risk site categories, classifiers; 23.6 % to 11.2 % attack success in autonomous mode; 35.7 % to 0 % on four browser-specific attacks | Confirmation model matches; no site allow-list | [F] |
| Fara-7B "Critical Points" | Stop for consent before personal data entry or irreversible actions | Same idea as F17 | [F] |
| EIA (arXiv 2409.11295, ICLR 2025) | Injected, near-invisible fields steal PII or the whole request; up to 70 % ASR for specific PII, 16 % for full request | Vault tokens limit what the planner can type; visibility checks not verified | [F]/[I] |
| WASP (arXiv 2504.18575) | Realistic web-agent injection benchmark; attacks partially succeed in up to 86 % of cases | No equivalent suite | [F] |
| ST-WebAgentBench (arXiv 2410.06703) | "Completion under Policy": credit only if no policy violation in the trajectory; CuP under two-thirds of nominal completion for tested agents | Not measured | [F] |

### 7.2 Recommended additions (cheap, code-enforced)

1. **Visibility and reachability guard.** [I] Act only on elements with a non-zero box, not `aria-hidden`, not `display:none` or `visibility:hidden`, opacity above a floor, not covered at the click point (`elementFromPoint`), and inside or scrollable into the viewport. This addresses the EIA hidden-field class directly.
2. **Task-bound typing.** [I] A `type` action may only write a value that came from the user's task (a vault token) or a literal the user typed in the side panel. Page text cannot be copied into a field. This is a small, CaMeL-like data-flow rule.
3. **Datamark page text in the planner prompt.** [F] Spotlighting's datamarking is a prompt-side transformation with published effect sizes. [I] Cheap to add; measure on the injection suite rather than assume the published rate.
4. **Plan-ahead with postconditions.** [I] Same change as latency lever 3; security and latency move together.
5. **Origin allow-list for runs.** [I] Mirror Anthropic's site permissions: a run is bound to the origin it started on; a cross-origin navigation ends the run or asks.
6. **Measure it.** [I] A 15 to 20 page synthetic injection suite (hidden fields, "ignore previous instructions" text, fake confirm buttons, Hindi injections). Metric: off-task state-changing or destructive actions executed without a prompt (target 0), and task completion under policy. Synthetic fixtures only, per `AGENTS.md`.

## 8. Indian-language UI handling, accessibility norms and DPDP

### 8.1 Hindi and other Indian languages

| Need | Option | Evidence | Gap | Label |
|---|---|---|---|---|
| Hindi person names in page text | `ai4bharat/IndicNER` (11 languages, mBERT base) | Model card | Not PII-typed; person/location/organisation only; browser export unverified | [F]/[S] |
| Hindi names via current model | `gliner_multi_pii-v1` | Fine-tuned on six European languages | Hindi recall unmeasured; base model is multilingual so it may partly work | [F]/[S] |
| Indian identifiers | Deterministic validators: Aadhaar (12 digits, Verhoeff check digit, masking as XXXX XXXX 1234), PAN, IFSC, UPI VPA, Indian mobile | Checksum descriptions; masking convention | Script-independent for digits; Devanagari digits need normalisation [I] | [F]/[I] |
| Benchmarks | IndiaPII-Bench v1.0 (2,000 documents, 13,468 spans, 16 PII types plus 5 hard-negative classes, CC-BY-4.0; English and Hinglish, no Devanagari-only documents); HiNER (Hindi NER gold set, per search summary); parda-bench (Indian PII masking) | Dataset cards | Hard negatives are exactly the false-positive test Dhristi needs | [F] |
| Cross-language control choice | Bilingual gloss in the scene for common control verbs, reusing the EN/HI keyword lists in `op-tier.js` and `tiers.py` | ROAST round 29: Qwen chose "Account statements" over "खाता हटाएं" for "Delete my account" | Planner weakness, not a perception gap | [F]/[I] |
| Indic-aware open-weight planner | Sarvam 30B (MoE, 2.4 B active, Apache-2.0, 22 scheduled languages, released 6 March 2026) | Sarvam blog | Not on Groq as far as we checked; hosting unknown | [F]/[S] |
| On-device small LLM | Chrome Prompt API | Accepts en, ja, es, de, fr only | No Hindi | [F] |

[I] Practical Hindi plan for two weeks: validators plus the bilingual gloss plus a measured Hindi slice in the blind set. Model work on Indic NER goes after the deadline.

### 8.2 Accessibility norms (G09, G10)

- [F] GIGW 3.0 aligns Indian government websites with WCAG 2.1 Level AA (secondary sources; the DBIM toolkit hosts the GIGW 3.0 PDF).
- [F] WCAG 2.2 has been a W3C Recommendation since 5 October 2023; it adds nine success criteria, four at AA: 2.4.11 Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum, 24 by 24 CSS px), 3.3.8 Accessible Authentication (Minimum); and removes 4.1.1 Parsing.
- [I] For Dhristi's side panel, three WCAG 2.2 AA checks are cheap and visible to judges:
  - **3.3.8 Accessible Authentication:** the pairing code field must allow paste and must not require transcribing a code from memory without a copy mechanism.
  - **2.5.8 Target Size:** Proceed, Stop and Reveal buttons at least 24 by 24 CSS px.
  - **2.4.11 Focus Not Obscured:** the sticky confirm bar must not hide the focused element.
- [I] G09 is named "WCAG 2.1 AA review". Testing 2.2 AA additions does not change the gate's bar; it strengthens the evidence. Whether axe-core's rule tags cover each 2.2 criterion automatically was not verified here; plan for manual checks.
- [I] DigiLocker and other government portals are relevant as target use cases only on synthetic replicas; no partner claims (`brain-fundamentals-restructure.md` hard constraints).

### 8.3 DPDP Act 2023 and the screen data question

- [F] The Digital Personal Data Protection Rules, 2025 were notified on 13 to 14 November 2025 with a phased commencement over 18 months; consent-manager obligations from November 2026 and substantive fiduciary obligations by May 2027 (PIB release as summarised by search results; the PIB page returned 403 to our fetch, so the dates are from secondary sources).
- [F] Section 3(c)(i) excludes personal data processed by an individual for any personal or domestic purpose (secondary commentary). Section 8(5) requires a Data Fiduciary to take reasonable security safeguards, including for processing by a Data Processor on its behalf. Rule 6 is described by commentators as a baseline of encryption or masking, access control, logging, and one-year log retention.
- [I] Implications for Dhristi (not legal advice):
  - A user running Dhristi for themselves sits near the personal-use exclusion. The team or any operator of a relay or hosted planner is a different actor; if it decides purposes and means for many users, it looks like a Data Fiduciary and the cloud provider like a Processor.
  - Screens contain **third parties'** data (a payee's name, a chat partner). Redaction before egress is the strongest available safeguard, and it should be presented as data minimisation, not as legal compliance.
  - Keep the current rules: no raw screen data, credentials or values in server requests, logs or fixtures (`AGENTS.md`). Audit rows hold counts and timings only (G07).
  - Do not claim "DPDP compliant". Claim "designed for data minimisation; no personal values left the device in N measured requests", with the results file.

## 9. Evaluation: how others measure, and what Dhristi can measure honestly by 16 October

### 9.1 How papers and judges evaluate

| Practice | Source | Use for Dhristi | Label |
|---|---|---|---|
| Task success on held-out, unseen sites | Mind2Web, Online-Mind2Web | Blind fixtures written by teammates who have not seen the rules | [F]/[I] |
| Element accuracy and step success | Mind2Web | "Accuracy of visual context" proxy: did the scene contain the right element, did the planner pick it | [F]/[I] |
| Completion under policy | ST-WebAgentBench | Count a run as success only if no unprompted state-changing or destructive step happened | [F]/[I] |
| LLM-as-judge only with human agreement measured | WebVoyager (85.3 %), WebJudge (85.7 %) | Avoid LLM judges; Dhristi's fixtures have programmatic success checks | [F]/[I] |
| Benchmark validity checklist (task validity, outcome validity, reporting) | ABC, arXiv 2507.02825 | Report n, limitations, failures; show the scorer | [F] |
| Qualitative usability with about 5 users per distinct group | Nielsen Norman Group | G20 design; not a statistical claim | [F] |
| Quantitative usability needs more users (NN/g suggests 20) | Nielsen Norman Group | Do not claim a SUS benchmark with 5 users | [F] |

### 9.2 Organizer metric to measurement map

| Organizer metric | Honest measurement in 13 days | Existing evidence | Missing | Label |
|---|---|---|---|---|
| Accuracy of visual context (25 %) | On the blind fixtures: element recall of the scene (target control present with correct role and name), planner element accuracy, task success | `laya-blind-v01` kit; e2e v04 | Scene-level ground truth; Hindi slice | [I] |
| PII P/R (20 %) | Per-type P/R with counts on (a) frozen DOM corpus, (b) UI-label hard negatives, (c) IndiaPII-Bench subset (English and Hinglish), stated as such | `cycle05-dom-text-pii-heldout-v01.json`, `webpii-text-v01-*` | Label hard negatives; Indian identifiers | [F]/[I] |
| Redaction precision (20 %) | Fraction of masked spans or boxes that are PII; over-redaction per 100 control labels; for pixels, box precision on a WebPII slice | `webpii-raster-*`, `webpii-text-*` | Face masks in root extension | [F]/[I] |
| Client resources (20 %) | Peak RSS of browser renderer, offscreen document and Warden; CPU ms per step; model bytes on disk; cold start; on one named laptop | `wave2-client-resources-v01.json` is diagnostic only (heap unavailable) | Everything for v5 | [F]/[I] |
| Latency (15 %) | Per-stage p50/p95 per decision type, n ≥ 100 after 10 warm-ups | `e2e-v5-boundary-v03/v04` | Stage breakdown; G11 run | [F]/[I] |

### 9.3 What not to measure in two weeks

- [I] Live third-party sites (not authorised, and `AGENTS.md` limits tests to synthetic fixtures).
- [I] A VisualWebArena or WebArena score (infrastructure cost, and the scores would not test Dhristi's differentiator).
- [I] A SUS benchmark presented as statistically meaningful.

## 10. Recommended target architecture

### 10.1 Diagram

```text
+----------------------------------------------------------------------------+
|  BROWSER  (MV3 extension; Chrome side panel now, Firefox sidebar later)    |
|                                                                            |
|  content script                         offscreen doc / worker (ORT Web)   |
|  +------------------------------+       +------------------------------+   |
|  | DOM + accessibility snapshot |       | face detector (UltraFace)    |   |
|  |  role, accessible name, lang,|       | visual PII boxes  [later, S] |   |
|  |  visibility, section path,   |       | text PII GLiNER.js [spike, S]|   |
|  |  label vs value class        |       | validators: Verhoeff, PAN,   |   |
|  +--------------+---------------+       |  Luhn, IFSC, UPI, mobile     |   |
|                 |                       +---------------+--------------+   |
|                 v                                       |                  |
|  +-------------------------------------------------------------------+    |
|  | REDACT: label-vs-value rules -> detectors -> line-hash cache      |    |
|  |         -> vault (values stay here) -> protected scene            |    |
|  +--------------------------------+----------------------------------+    |
|                                   |  roles, ids, geometry, tokens          |
|                                   v                                        |
|  +-------------------------------------------------------------------+    |
|  | DECIDE (router)                                                   |    |
|  |  R0 deterministic rule  (slot fill, scroll, finish on status)     |    |
|  |  R1 plan-ahead step     (from earlier cloud plan, re-verified)    |    |
|  |  R2 cloud planner       (only when R0/R1 cannot decide)           |    |
|  +--------------------------------+----------------------------------+    |
|                                   v                                        |
|  +-------------------------------------------------------------------+    |
|  | CHECK (code, not model): schema, allow-list, F17 tier EN+HI,      |    |
|  |  visible+reachable target, task-bound values, same origin         |    |
|  |  -> ASK the person: destructive always; unproven state-changing   |    |
|  +--------------------------------+----------------------------------+    |
|                                   v                                        |
|  ACT + verify postcondition (live region, value echo) -> next step         |
+-------------------------------------+--------------------------------------+
                                      | loopback, HMAC-paired
                                      v
+----------------------------------------------------------------------------+
|  WARDEN (local companion, Python): GLiNER (PyTorch) until browser parity,  |
|  regex egress guard (422 on any hit), cloud key, relay, Laya reviewer      |
+-------------------------------------+--------------------------------------+
                                      | HTTPS: protected scene only
                                      v
+----------------------------------------------------------------------------+
|  CLOUD PLANNER (open weights; Groq chain, Qwen first; strict JSON schema)  |
|  returns one action or a short plan with postconditions                    |
+----------------------------------------------------------------------------+
```

### 10.2 What changes from v5, and what stays

| Part | v5 today | Target | Label |
|---|---|---|---|
| In-browser vision | None in root extension | ORT Web face stage; visual PII later | [F] today; [I] target |
| Scene | Serialised lines with labels and selectors | Plus computed role, accessible name (W3C AccName, e.g. MIT-licensed `dom-accessibility-api`), `lang`, visibility, section path, label/value class | [I] |
| Redaction | GLiNER per line in Warden, descriptor guard, uncertain band prompts | Plus label-vs-value rules, validators, line-hash cache | [I] |
| Decision | Cloud per step (Jev disabled) | Router with deterministic and plan-ahead paths; Jev stays disabled unless Francis decides | [I] |
| Check | F17, EN+HI, pairing | Plus visibility, task-bound typing, origin binding | [I] |
| Warden | Required, paired | Same; becomes optional for redaction only after browser parity is measured | [I] |

## 11. Ranked changes for the next 13 days (3 to 16 October 2026)

### 11.1 Ranking criteria

- [I] Weight by organizer metric weight touched, by gate evidence produced, by risk of not landing, and by fit with the existing `PLAN.md` schedule (blind set 3 to 4 Oct, G11 4 to 6 Oct, G20 sessions 5 to 10 Oct, stale passes 6 to 7 Oct, G09/G10 7 to 8 Oct, G03 8 to 9 Oct, GLiNER false positives 9 Oct, G14 12 to 13 Oct, freeze 14 Oct).
- [I] Two items below propose moving PLAN dates (GLiNER false positives earlier; vision port added). Francis decides.

### 11.2 The list

| Rank | Change | Gate(s) | Organizer metric | Evidence it must produce | Dates | Kill or fallback criterion |
|---:|---|---|---|---|---|---|
| 1 | Stage-clocked latency run on the current tree: per-stage timestamps (perceive, strip, plan, check, act), n ≥ 100 after 10 warm-ups, per decision type; strip cache on and off | **G11** (stays fail unless bar met) | Latency 15 % | `Benchmarks/results/core-latency-v5-stages-v01.json` | 4 to 6 Oct (PLAN slot) | None; this is required evidence either way |
| 2 | Label-vs-value guard and deterministic validators (Section 4.3), with a blind UI-label hard-negative set (EN and HI) | ROAST round 29 finding; supports G20 (fewer wrong prompts) | PII P/R 20 %, redaction precision 20 % | Extend the parallel workstream's `Benchmarks/results/gliner-label-fp-v01.json` and `scripts/gliner-label-fp/` (uncommitted in this tree on 3 Oct; author-written, not blind) with a blind label set: FP per 100 labels and value recall, before and after | 4 to 7 Oct (moved up from 9 Oct) | If value recall drops on the frozen corpus, ship only the validator rule (rule 1) and record the drop |
| 3 | Port the Prototype's ORT Web face stage into root `extension/` (offscreen document, bundled model, `'wasm-unsafe-eval'` CSP), mask faces and password fields locally, show the masked capture in the panel | G03 (workflow), G15 (honest capability claims) | Visual context 25 %, client resources 20 % | `Benchmarks/results/extension-vision-v01.json`: ms per capture, peak memory, faces masked on a synthetic fixture with faces | 5 to 8 Oct | If the offscreen path fails in the loaded extension by 8 Oct, keep the Prototype as the vision demo and say so on the slide |
| 4 | G20 human sessions on a frozen build (5+ non-author participants, 3+ narrative reviewers, per the refreshed protocol); record prompts asked, prompts the participant judged unnecessary, task completion, boundary understanding | **G20** | All (qualitative) | `Benchmarks/results/human-evaluation.json`; `scripts/g20_summarize.py` | 6 to 11 Oct (team) | No invented participants; if fewer than 5, G20 stays unknown |
| 5 | Plan-ahead mode: cloud returns up to N steps with postconditions; extension executes each after a fresh scene check; any mismatch re-plans; opt-in until Francis decides | G11 (trade-off evidence, not a pass), G06 (safe output) | Latency 15 %, safety story | `Benchmarks/results/e2e-v5-planahead-v01.json`: cloud calls per task, per-step latency by type, task success, prompts | 7 to 10 Oct | If task success falls below the per-step mode on the same fixtures, keep it off and publish the comparison |
| 6 | Safety additions: visibility and reachability guard, task-bound typing, same-origin binding, datamarking in the planner prompt; plus a 15 to 20 page synthetic injection suite (EN and HI) | G06 | Safety (supports trust in all metrics) | `Benchmarks/results/injection-suite-v01.json`: off-task unprompted actions (target 0), completion under policy | 8 to 10 Oct | Never loosen F17 to pass the suite; record failures |
| 7 | Client resource measurement for v5: RSS of renderer, offscreen document and Warden; CPU ms per step; model bytes; cold start; one named machine | (no gate today; organizer metric) | Client resources 20 % | `Benchmarks/results/client-resources-v5-v01.json` | 9 to 10 Oct | If browser memory APIs are unavailable, use OS process RSS and say so |
| 8 | Cross-language control choice: add `lang` and a deterministic EN/HI gloss of control verbs to the scene; re-run the planner bench with the Hindi blind rows | (no gate; ROAST round 29 planner finding) | Visual context 25 % | `Benchmarks/results/groq-settings-bench-v03.json` with a Hindi slice; blind-set score | 9 to 10 Oct | If no gain, remove the gloss and record |
| 9 | G09/G10 on the side panel: the three axe findings (ROAST round 21), plus manual WCAG 2.2 AA checks for 3.3.8 (pairing code paste), 2.5.8 (24 px targets), 2.4.11 (focus not obscured by the confirm bar) | **G09**, **G10** | (judges' UX impression) | `Benchmarks/results/accessibility-v5-v01.json` | 8 to 9 Oct (PLAN slot) | Gate stays unknown if any check is not run |
| 10 | GLiNER.js spike, time-boxed to 1.5 days: `onnx-community/gliner_multi_pii-v1` in the offscreen document, WASM and WebGPU; span agreement with the Python Warden on the frozen corpus; per-line latency; memory | (none; problem-statement fit) | PII P/R 20 %, client resources 20 % | `Benchmarks/results/gliner-browser-spike-v01.json` | 11 to 12 Oct | Go only if span agreement and latency are recorded and acceptable to Francis; otherwise "beyond the deadline" |
| 11 | Refresh stale passes (G05, G06/G07, G08), clean-container setup (G03), re-record fallback (G14), regenerate ledger | G03, G05 to G08, G14 | n/a | Regenerated evidence files; `release-status.json` | 6 to 7 Oct and 12 to 14 Oct (PLAN slots) | Francis decides each gate from evidence on 14 Oct |

### 11.3 Decisions only Francis can make

1. Whether plan-ahead becomes the default after rank 5's comparison.
2. Whether the Jev deterministic path is re-enabled for any step kind (today: disabled in code; needs a new decision).
3. Whether the slide describes text redaction as "on the device" (true: Warden on the same machine) and the vision stage as "in the browser" (true only after rank 3 lands). [I] The statement's wording makes this distinction matter.
4. Whether WebRedact is benchmarked before its weight licence is known (recommendation: no shipping, benchmarking only if the licence permits research use).

### 11.4 What will not fit (recorded so nobody promises it)

- [I] GLiNER fully in the browser replacing the Warden, unless the rank 10 spike is unexpectedly clean.
- [I] A live Firefox run of the root extension (needs `sidebar_action` and a different offscreen strategy).
- [I] Any local LLM planner.
- [I] Indic NER models in the loop.

## 12. Beyond the deadline

### 12.1 Engineering

1. **Browser-resident redaction parity.** [S] GLiNER.js or a smaller PII-tuned GLiNER (e.g. the Knowledgator edge model, UINT8 197 MB) in a worker, with the Warden reduced to key holder, egress guard and relay. Gate it on measured parity with the Python model on the frozen corpus.
2. **Visual PII detector.** [S] WebRedact, converted from OpenVINO IR to ONNX, if the weights licence allows; otherwise fine-tune a small open detector on the Apache-2.0 WebPII dataset. Compare against the 58/100 OCR baseline on the same slice.
3. **Firefox.** [F] `sidebar_action` instead of `side_panel`; [F] WebGPU on Windows from Firefox 141; [F] `browser.trial.ml` is experimental and WASM-based. [I] Prefer bundling ORT Web over the trial API.
4. **Local planner for simple steps.** [S] A small instruction model in WebLLM, or the Chrome Prompt API where hardware allows, as router R0.5 between rules and cloud. Note [F] the Prompt API's language list excludes Hindi.
5. **Indic.** [S] Export IndicNER to ONNX for Hindi names; build a Devanagari-only hard-negative set (IndiaPII-Bench has none); evaluate an Indic-strong open-weight planner (e.g. Sarvam 30B, Apache-2.0) on the Hindi blind slice.
6. **Workflow memory.** [S] Record-and-replay of verified trajectories (AgentRR, arXiv 2505.17716, and related work) turns repeated tasks into deterministic steps, which helps G11 legitimately on repeat runs.
7. **Capability tracking.** [S] Grow vault tokens into a CaMeL-style capability system: every value carries its source and the sinks it may reach.
8. **WebNN.** [S] Revisit when it ships outside origin trials; it is the route to NPUs.

### 12.2 Evaluation

1. [I] A public, synthetic, multi-site fixture suite (government-style forms in EN and HI, banking, e-commerce, profile pages) with programmatic success checks and a label hard-negative set, released with the scorer, so others can reproduce Dhristi's numbers.
2. [I] An injection suite aligned with WASP's threat model, run on synthetic replicas.
3. [I] A larger human study (NN/g suggests about 20 users for quantitative usability) if Dhristi goes to the finale.

## 13. Cheat sheet

### 13.1 Ten lines to remember

| # | Line | Label |
|---|---|---|
| 1 | The statement wants a vision model in the browser; ship the ORT Web face stage in the root extension. | [F] requirement; [I] action |
| 2 | DOM and accessibility tree first, vision second: SeeAct and recent architecture papers back this. | [F] |
| 3 | Labels are not values: decide by DOM role and value shape, never by lowering thresholds. | [I] |
| 4 | Validators are free precision: Verhoeff (Aadhaar), PAN shape, Luhn. | [F]/[I] |
| 5 | Cloud round trip median 416 ms (n = 21): G11 cannot pass with the cloud in every decision. Say so. | [F] |
| 6 | Make strip disappear from steps 2..n: line-hash cache and DOM diff. | [S] |
| 7 | Plan-then-execute buys latency and injection resistance at once. | [F] pattern; [S] gain |
| 8 | Safety in code, not in the model: F17, visibility guard, task-bound typing, same origin. | [F] guidance; [I] actions |
| 9 | 60 % of the score is local (PII P/R, redaction precision, client resources): measure those first. | [F] weights; [I] priority |
| 10 | Never invent a participant, a number or a source; failures stay in the results files. | [F] repo rule |

### 13.2 Numbers Dhristi may quote today (with their files)

| Number | File |
|---|---|
| 0 personal values in 48 cloud requests (synthetic fixture) | `Benchmarks/results/e2e-v5-boundary-v02.json` |
| 0 personal values in 21 cloud requests; Groq round trip median 416 ms (227 to 1117) | `Benchmarks/results/e2e-v5-boundary-v04.json` |
| Qwen 41/42 at temperature 0 | `Benchmarks/results/groq-settings-bench-v02.json` |
| Jev 39/89 held-out steps at 0.9, all right (path now disabled) | `Benchmarks/results/fastpath-bench-v01.json` |
| OCR redraw: exact PII retained on 58/100 WebPII screens | `Benchmarks/results/webpii-text-v01-summary.json` |
| G11 fail, G20 unknown, 14 pass / 1 fail / 5 unknown, `submission_ready` false | `Benchmarks/release-status.json` |

### 13.3 Judge questions and short honest answers

| Question | Answer | Label |
|---|---|---|
| Where does the vision model run? | Today the face stage runs in the Prototype extension; after rank 3, in the shipping extension through ONNX Runtime Web. Text PII runs in a paired local process on the same machine. | [F] today; [I] after |
| What leaves the device? | A protected scene: roles, element ids, geometry and placeholder tokens. No pixels, no raw values; a regex egress guard refuses any request with a pattern hit. | [F] |
| Why not a pure screenshot agent? | Grounding is the bottleneck in published results, pixels are the hardest input to redact, and the DOM already names every control. | [F]/[I] |
| Is it under 200 ms? | Not with a cloud call in the decision; here are the per-stage numbers and the decision types that are local. | [F]/[I] |
| What if the page injects instructions? | The planner can only choose from a closed action set; destructive steps always ask; typed values must come from the user's task; hidden elements are not actionable. Here is the injection suite result. | [I] until rank 6 lands |
| Hindi? | EN and HI tiering is in code; Hindi PII recall is not yet measured; validators are script-independent for digits. | [F]/[I] |

## 14. Sources

All URLs were retrieved on 3 October 2026 unless stated. Numbers attributed to a source are the authors' own reported figures.

### 14.1 Repository files (primary evidence)

- `Raw/domain/sih26171-official-extract.txt` (official statement extract)
- `Wiki/problem-statement.md`
- `CONTEXT.md`, `PLAN.md`, `ROAST.md`
- `Docs/decisions/brain-v5-local-redaction-cloud-planner.md`
- `Docs/decisions/brain-fundamentals-restructure.md`
- `Benchmarks/release-status.json`
- `Benchmarks/results/e2e-v5-boundary-v02.json`, `e2e-v5-boundary-v03.json`, `e2e-v5-boundary-v04.json`
- `Benchmarks/results/groq-settings-bench-v02.json`, `fastpath-bench-v01.json`
- `Benchmarks/results/core-latency.json`, `core-latency-warden-option-c.json`
- `Benchmarks/results/webpii-text-v01-summary.json`, `wave2-client-resources-v01.json`
- `warden/entities.py` (measurement notes in comments), `extension/utils/omniparser.js`, `extension/content.js`, `Prototype/extension/ort-sandbox.mjs`

### 14.2 Web agents and perception

- Mind2Web: Towards a Generalist Agent for the Web. https://arxiv.org/abs/2306.06070
- WebArena: A Realistic Web Environment for Building Autonomous Agents. https://arxiv.org/abs/2307.13854 (figures via https://arxiv.org/pdf/2307.13854)
- VisualWebArena: Evaluating Multimodal Agents on Realistic Visual Web Tasks. https://arxiv.org/abs/2401.13649 ; leaderboard and figures: https://jykoh.com/vwa
- GPT-4V(ision) is a Generalist Web Agent, if Grounded (SeeAct). https://arxiv.org/abs/2401.01614
- Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V. https://arxiv.org/abs/2310.11441
- WebVoyager: Building an End-to-End Web Agent with Large Multimodal Models. https://arxiv.org/abs/2401.13919
- OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments. https://arxiv.org/abs/2404.07972
- An Illusion of Progress? Assessing the Current State of Web Agents. https://arxiv.org/abs/2504.01382
- Building Browser Agents: Architecture, Security, and Practical Solutions. https://arxiv.org/abs/2511.19477
- OmniParser V2: Turning Any LLM into a Computer Use Agent (Microsoft Research). https://www.microsoft.com/en-us/research/articles/omniparser-v2-turning-any-llm-into-a-computer-use-agent/
- UI-TARS: Pioneering Automated GUI Interaction with Native Agents. https://arxiv.org/abs/2501.12326
- ShowUI: One Vision-Language-Action Model for GUI Visual Agent. https://arxiv.org/abs/2411.17465
- Ferret-UI 2: Mastering Universal User Interface Understanding Across Platforms. https://arxiv.org/abs/2410.18967
- Fara-7B: An efficient agentic small language model for computer use (Microsoft Research blog). https://www.microsoft.com/en-us/research/blog/fara-7b-an-efficient-agentic-model-for-computer-use/
- ScreenSpot-Pro: GUI Grounding for Professional High-Resolution Computer Use. https://arxiv.org/abs/2504.07981
- dom-accessibility-api (W3C AccName implementation, MIT). https://github.com/eps1lon/dom-accessibility-api

### 14.3 PII detection and datasets

- urchade/gliner_multi_pii-v1 (model card). https://huggingface.co/urchade/gliner_multi_pii-v1
- onnx-community/gliner_multi_pii-v1 (ONNX weights for Transformers.js). https://huggingface.co/onnx-community/gliner_multi_pii-v1
- knowledgator/gliner-pii-edge-v1.0 (model card, F1 table, ONNX sizes). https://huggingface.co/knowledgator/gliner-pii-edge-v1.0
- nvidia/gliner-PII (model card). https://huggingface.co/nvidia/gliner-PII
- GLiNER2-PII: A Multilingual Model for Personally Identifiable Information Extraction. https://arxiv.org/html/2605.09973v1
- GLiNER.js: GLiNER inference in JavaScript. https://github.com/Knowledgator/GLiNER.js
- Microsoft Presidio, Customizing Presidio Analyzer (context enhancement). https://microsoft.github.io/presidio/samples/python/customizing_presidio_analyzer/ ; changelog: https://github.com/microsoft/presidio/blob/main/CHANGELOG.md
- WebPII: Benchmarking Visual PII Detection for Computer-Use Agents. https://arxiv.org/abs/2603.17357 ; project: https://webpii.github.io/ ; dataset (Apache-2.0): https://huggingface.co/datasets/WebPII/webpii ; models: https://github.com/WebPII/models
- An Evaluation Study of Hybrid Methods for Multilingual PII Detection (RECAP). https://arxiv.org/abs/2510.07551
- ai4bharat/IndicNER. https://huggingface.co/ai4bharat/IndicNER
- IndiaPII-Bench v1.0. https://huggingface.co/datasets/maskflow-ai/indiapii-bench
- parda-bench (Indian PII masking benchmark). https://github.com/rht-21/parda-bench
- Aadhaar Verhoeff checksum and masking, example implementation (not an official UIDAI source). https://github.com/vjymisal0/aadhaar-mask

### 14.4 Runtimes and browser platform

- Transformers.js v3: WebGPU Support, New Models and Tasks. https://huggingface.co/blog/transformersjs-v3
- ONNX Runtime Web, Using WebGPU. https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- WebLLM: A High-Performance In-Browser LLM Inference Engine. https://arxiv.org/abs/2412.15803
- Chrome Prompt API documentation. https://developer.chrome.com/docs/ai/prompt-api
- Shipping WebGPU on Windows in Firefox 141 (Mozilla Graphics). https://mozillagfx.wordpress.com/2025/07/15/shipping-webgpu-on-windows-in-firefox-141/
- Running inference in web extensions (Mozilla). https://blog.mozilla.org/en/firefox/firefox-ai/running-inference-in-web-extensions/
- Firefox WebExtensions AI API docs. https://firefox-source-docs.mozilla.org/toolkit/components/ml/extensions.html
- MDN, sidebar_action. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sidebar_action ; Chrome incompatibilities: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- Chrome, Manifest content security policy. https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy ; Improve extension security (remote code): https://developer.chrome.com/docs/extensions/develop/migrate/improve-security
- Chrome, Offscreen Documents in Manifest V3. https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3 ; What's new in Chrome extensions: https://developer.chrome.com/docs/extensions/whats-new
- WebNN Candidate Recommendation update (secondary report). https://cadeproject.org/updates/updated-candidate-recommendation-web-neural-network-webnn-api-published-by-the-world-wide-web-consortium/
- UltraFace (Ultra-Light-Fast-Generic-Face-Detector-1MB). https://github.com/linzaer/ultra-light-fast-generic-face-detector-1mb

### 14.5 Latency

- Groq, Structured Outputs. https://console.groq.com/docs/structured-outputs
- Groq, Prompt Caching. https://console.groq.com/docs/prompt-caching
- Speculative Actions: A Lossless Framework for Faster Agentic Systems. https://arxiv.org/abs/2510.04371
- What Limits Agentic Systems Efficiency? https://arxiv.org/html/2510.16276
- Get Experience from Practice: LLM Agents with Record and Replay. https://arxiv.org/abs/2505.17716
- Provider latency figures on third-party blogs (e.g. https://www.marktechpost.com/2026/08/30/lowest-latency-inference-apis-for-voice-and-realtime-agents-a-time-to-first-token-ttft-first-benchmark/) were found but not verified against primary data; not quoted.

### 14.6 Safety

- OWASP Top 10 for LLM Applications 2025 (PDF). https://owasp.github.io/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf
- The Dual LLM pattern for building AI assistants that can resist prompt injection (Simon Willison). https://simonwillison.net/2023/Apr/25/dual-llm-pattern/
- Defeating Prompt Injections by Design (CaMeL). https://arxiv.org/abs/2503.18813
- Design Patterns for Securing LLM Agents against Prompt Injections. https://arxiv.org/abs/2506.08837
- Defending Against Indirect Prompt Injection Attacks With Spotlighting. https://arxiv.org/abs/2403.14720
- Claude for Chrome (Anthropic). https://claude.com/blog/claude-for-chrome
- EIA: Environmental Injection Attack on Generalist Web Agents for Privacy Leakage. https://arxiv.org/abs/2409.11295
- WASP: Benchmarking Web Agent Security Against Prompt Injection Attacks. https://arxiv.org/abs/2504.18575
- ST-WebAgentBench: A Benchmark for Evaluating Safety and Trustworthiness in Web Agents. https://arxiv.org/abs/2410.06703

### 14.7 India: language, accessibility, law

- Open-Sourcing Sarvam 30B and 105B (Sarvam AI). https://www.sarvam.ai/blogs/sarvam-30b-105b
- Guidelines for Indian Government Websites (GIGW) 3.0, DBIM toolkit PDF. https://dbimtoolkit.digifootprint.gov.in/static/uploads/2025/02/c35ec5a5b570663b2a0d514f4f2ff013.pdf ; overview: https://en.wikipedia.org/wiki/Guidelines_for_Indian_Government_Websites
- WCAG 2.2 is a W3C Recommendation (European Commission accessibility centre note). https://accessible-eu-centre.ec.europa.eu/content-corner/news/wcag-22-officially-w3c-recommendation-2023-10-06_en
- DPDP Rules, 2025 Notified (PIB; returned HTTP 403 to our fetch, dates taken from secondary summaries). https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655&reg=48&lang=2 ; PIB document: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- DPDP Act Section 3 with interpretation (secondary). https://www.dpdpa.com/dpdpa2023/chapter-1/section3.html ; Section 8: https://www.dpdpa.com/dpdpa2023/chapter-2/section8.html

### 14.8 Evaluation

- Establishing Best Practices for Building Rigorous Agentic Benchmarks (ABC). https://arxiv.org/abs/2507.02825
- Why You Only Need to Test with 5 Users (Nielsen Norman Group). https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- Measuring Usability with the System Usability Scale (MeasuringU). https://measuringu.com/sus/

### 14.9 Could not verify

- Exact OmniParser V2 seconds per frame (the Microsoft page states only "60 %" lower latency).
- WebRedact weights licence.
- Whether attaching `chrome.debugger` shows a user-visible infobar (Chrome API page does not say); this matters if the full accessibility tree is read through the DevTools protocol instead of computed in the content script.
- Groq and Cerebras time-to-first-token figures from primary measurements.
- axe-core automatic coverage of each WCAG 2.2 AA criterion.

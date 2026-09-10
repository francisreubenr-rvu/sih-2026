# Technical research — SIH26171

Updated 9 September 2026. Sources below are technical literature and implementations, not evidence of our prototype's accuracy or winning probability. Raw page archives and retrieval hashes: `Raw/domain/archive-manifest.json`. SciSpace/Consensus discovery responses are preserved under `Raw/domain/discovery-*.json`; all six cited Consensus result fetches were archived before use.

## Privacy requirements extend beyond passwords

Nathan Zhao's **WebPII: Benchmarking Visual PII Detection for Computer-Use Agents** (18 March 2026, preprint) introduces a synthetic screenshot benchmark with PII categories including transaction identifiers and partially filled forms. This motivates typed detection evaluation beyond emails and obvious password fields. WebRedact's reported results are author measurements, not browser-WASM results; do not put them on our scorecard. [Primary paper](https://arxiv.org/abs/2603.17357), [released models](https://github.com/WebPII/models).

Shuning Zhang et al.'s **PrivWeb** (15 September 2025, preprint) combines localized anonymization with privacy preferences and selective user intervention. This supports exposing the privacy decision to the user, while disproving a broad claim that local filtering plus user review is novel. Its reported user studies belong to that paper, not this team. [Primary paper](https://arxiv.org/abs/2509.11939).

Lepeng Zhao et al.'s **Available but Invisible** (8 February 2026, preprint) uses typed placeholders and a secure interaction proxy for mobile GUI agents. Our expiring browser references and strict egress scene are implementation choices in a related design space; placeholder anonymization itself is established prior work. [Primary paper](https://arxiv.org/abs/2602.10139).

## Local perception candidates

| Candidate | Why consider it | Integration / evaluation limit |
|---|---|---|
| UltraFace RFB-320 | Small MIT-licensed face detector; direct ONNX model and upstream preprocessing | Selected for actual WASM prototype. Small/occluded faces need dataset testing; face-only model cannot detect textual PII |
| BlazeFace / MediaPipe | Mobile-oriented face inference; documented web API | Device benchmarks in the paper are not transferable to our browser/hardware |
| YuNet | Lightweight face model with official OpenCV ONNX release and license | Alternate baseline; tensor/output adapter differs |
| WebRedact | Direct UI PII detector, paired with WebPII | Released model format and browser conversion must be checked; not a drop-in guarantee |
| Tesseract.js | Local OCR can recover text in rasterized regions | More assets/latency; not part of current v0.1 export permission boundary |

Sources: [UltraFace](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB), [BlazeFace paper](https://arxiv.org/abs/1907.05047), [MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js), [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), [Tesseract.js](https://github.com/naptha/tesseract.js). All accessed 9 September 2026; model/download provenance separately in `Prototype/models/manifest.json`.

## Security implications

Chaoran Chen et al.'s **The Obvious Invisible Threat** (15 April 2025, preprint) studies fine-print prompt injection against GUI agents and human reviewers. User confirmation alone is therefore not our security boundary. The protocol forbids arbitrary source text, executable code, URLs, typing and model-selected unknown targets; client checks page revision and current target before action. These checks reduce attack surface without proving complete adversarial safety. [Primary paper](https://arxiv.org/abs/2504.11281).

## Experiment plan

1. Freeze held-out pages and pixel/instance annotations, including unseen layouts, partial forms, canvas text, image faces, password fields, moving overlays and injected instructions.
2. Compare DOM-only, face-only, detected-mask screenshot and conservative reconstruction. Score sensitive recall and precision separately from useful context retained.
3. Record local cold load, warm inference, response completion, full task latency, original/outbound bytes, JS/WASM memory where available and long tasks. Do not substitute server GPU numbers for client costs.
4. Pair every numeric result with hardware, browser, model hash, source version, denominator, matching rule and failure examples.
5. Evaluate real user flow comprehension and review burden with participants; no simulated judge persuasion probability.

The present single-reference face detections and synthetic service workflow validate integration only. No dataset-level accuracy, privacy guarantee or saturation is established.

## Local follow-up: external synthetic raster diagnostic, 10 September

`Docs/decisions/raster-evaluation.md` records an actual 100-screen WebPII test-slice measurement. The slice has46 source IDs, all Amazon reproductions, and810 visible selected PII annotations. The corrected raster-only path localizes no selected regions; blanket exclusion covers all selected PII pixels while preserving no original visual pixels. This is our measured diagnostic, not the WebPII authors' reported model result or a general PII-accuracy claim. Two main-thread and two worker measurements expose latency variability and lower observed worker main-thread blocking.

Dataset and license provenance: `Raw/datasets/webpii-test100/provenance.json`. Primary source: https://huggingface.co/datasets/WebPII/webpii at revision6d3317721b72bde719a361c564ceaf1fbded3a8e. Do not use this limited slice as a population benchmark or evidence of broad native-DOM utility.

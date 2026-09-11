# External OCR/PII evaluation and decision

11 September 2026. **The current local text policy is not approved for arbitrary-text export.** It retained exact annotated sensitive text on 58 of 100 externally authored synthetic screenshots. All 100 inputs executed successfully; successful execution did not imply privacy success.

## Frozen protocol and provenance

The existing WebPII slice contains 100 ordered rows from 46 source IDs, all Amazon reproductions. It was already used for the face-only raster diagnostic, so it is not independently held-out or representative. The browser receives an image-only listing, verifies image hashes/dimensions and runs packaged Tesseract English OCR plus the quantized BERT-small PII model. The current policy includes the explicit-label correction from the three authored development screens; no policy or threshold changed during this run.

Before execution, the input listing, harness, policy, compiled bundle, dependency lock, model provenance, scorer, tests and scoring contract were hashed in `Benchmarks/results/webpii-text-v01-protocol.json`. All 11 hashes still matched after the run. An agent drafted the separate scorer but hit its quota before completion; the main agent reviewed/completed it and added 12 targeted tests. All 19 Python scorer tests pass, including the seven existing raster checks.

Scoring happens after inference against the frozen annotation file. It groups repeated line boxes for the same key/value, associates words by at least 50% word-area overlap, and matches normalized exact token multisets. Low-confidence suppression is reported separately from the sensitive flag. Missing OCR earns no detector credit. Utility uses a declared product-text subset excluding PII overlap. Full definitions and limitations: `Benchmarks/datasets/webpii-text-contract.md`.

## Results

| Measurement | Observed |
|---|---:|
| Screens executed | 100/100 |
| Expected PII value tokens in 739 groups | 1,433 |
| Exact PII value tokens recovered by OCR | 805 / 1,433 (56.2%) |
| Exact PII value tokens marked sensitive | 568 / 1,433 (39.6%) |
| Recovered PII tokens withheld, including low confidence | 586 / 1,433 (40.9%) |
| Exact PII tokens retained in intended redraw | 219 |
| Screens with exact retained annotated PII | 58 / 100 |
| Screens with retained words in PII geometry, regardless of spelling | 72 / 100 |
| Eligible product tokens retained | 1,237 / 2,243 (55.1%) |
| Recovered eligible product tokens marked sensitive | 97 / 1,427 (6.8%) |
| OCR + NER processing p50 / p95 / max | 866.7 / 2,888.4 / 17,205.9 ms |

These are annotated-value and intended-redraw diagnostics. Some annotation values are not fully painted, clipped or masked, so 56.2% is not pure OCR recall. Missing exact matches cannot prove absence of PII; misread or unannotated text can still disclose information. The geometry-only indicator captures some of that uncertainty. The 85.4% precision proxy in the machine-readable report considers only marked exact tokens in selected PII/product annotations and leaves other predictions unscored; it is not global PII precision or an official SIH score.

The largest retained annotation categories were country (58 tokens), gift message (55), city (24), postcode (23), secondary street (14) and state (11). These use the dataset's sensitivity taxonomy; the report does not assert that every country name is intrinsically private. Gift-message content illustrates the limitation of named-entity detection: a private message can be sensitive even when its words are ordinary.

## Resource and network limits

Initialization took 457.4 ms, followed by three separate authored-screen warmups. The measured 100-screen run reported 102 main-page long tasks totaling 35,190 ms. Main-page JS heap readings were about 10.9 MB before initialization and 16.9 MB after disposal; retained result data and garbage-collection timing affect those readings. They exclude OCR-worker and total process memory. No process CPU, GPU-memory or energy claim follows. All measured rows reported document visibility as visible.

The browser network capture retained 101 requests with no external HTTP or planner endpoint in that retained subset, but the event buffer reported truncation and worker coverage is not guaranteed. This is incomplete network evidence. It cannot establish full egress isolation. The harness source and frozen inference inputs are separately inspectable.

## Decision and next work

Keep OCR reconstruction local-only and retain the existing strict server schema. Do not generalize the earlier 14/14 authored-token result. Do not tune against this slice and then call it held-out validation. Preserve the baseline before future model, layout-policy or OCR changes.

Useful next work requires identifying whole task-sensitive regions and fields, not merely adding a list of missed words. Evaluate unlabelled/multiline regions and private free-form content, measure over-redaction and task utility together, and compare against the established conservative DOM path. Broader domains/languages and independently separated source IDs remain necessary for generalization. The current full-flow under-200 ms guardrail remains failed; even this local component exceeds it.

Raw output, category analysis and summary are `Benchmarks/results/webpii-text-v01*.json`. No native extension, human study, production privacy or competition-readiness claim is closed by this run.

# Model adapter development pilot — 10 September 2026

The single-choice adapter improves Qwen2.5 7B from 16/24 to 22/24 on the authored development cases. Keep Qwen7B as the current default. Do not promote the faster 0.5B model: it gets only 7/24 correct in the latest run. None of these results establishes general browser-agent reliability.

## Preserved measurements

| Adapter | Model | Correct | Valid schema | Provider p95 |
|---|---|---:|---:|---:|
| v1 | qwen2.5:0.5b | 6/24 | 24/24 | 274 ms |
| v1 | qwen2.5:7b-instruct | 16/24 | 24/24 | 3423 ms |
| v2 | qwen2.5:0.5b | 2/24 | 4/24 | 310 ms |
| v2 | qwen2.5:7b-instruct | 18/24 | 24/24 | 3391 ms |
| v3 | qwen2.5:7b-instruct | 19/24 | 24/24 | 3613 ms |
| v3-phi | phi4-mini:latest | 20/24 | 24/24 | 1515 ms |
| v4 | qwen2.5:0.5b | 7/24 | 24/24 | 270 ms |
| v4 | phi4-mini:latest | 21/24 | 24/24 | 1314 ms |
| v4 | qwen2.5:7b-instruct | 22/24 | 24/24 | 3160 ms |

All runs use real local Ollama inference on an Apple M1 Pro, 16 GB system memory. Each run includes two excluded warmups and 24 measured calls. NDJSON rows, exact scenes, model digests, quantization, residency and provider source hashes remain under `Benchmarks/results/model-pilot-v*/`. Provider source snapshots are in `Raw/experiments/`.

## Iteration record

1. v1: nested action wrapper and all three task instructions. Valid output did not ensure correct task selection.
2. v2: flat action/target/direction fields. Improvement for 7B, regression for 0.5B.
3. v3: send only the requested task's server-authored instruction. Tested Qwen7B and Phi4 mini separately.
4. v4: one `choice` field enumerating every available target plus done/scroll directions. Decode it to the existing browser action schema; reject extra fields and unknown choices. No target is removed because it is an incorrect answer.

The public request and action contract is unchanged. The final browser still executes only after confirmation and freshness/target checks. Added provider decoding tests bring the automated suite to 39 passing tests. The actual browser Pending → Review task also completed with this adapter and is recorded.

## Failures remain visible

Qwen7B v4 chooses done instead of Details in `pending-details-layout1`, and Back instead of done in `completed-finished-layout0`. Phi4 mini v4 is 21/24; the smaller model is 7/24. These are semantic failures even though all 24 responses per latest model satisfy the output schema. Confirmation limits authority; it does not repair incorrect reasoning.

## Limits and reproducibility

These are 12 authored semantic states, each repeated in two layouts, closely aligned to three declared task policies. They are development cases used during iteration, not held-out pages, independent samples, CV accuracy or a user study. Initial runs generated fresh UUID revisions; other authored fields follow the same generator. Latency is not an isolated causal comparison: model load/cache and background browser activity vary. Twenty-four calls do not meet the full benchmark sample minimum. Provider p95 excludes capture, human review, deployment networking and execution; the under-200 ms full-flow gate stays failed.

Future runs use frozen v1 case inputs by default and a fresh timestamped output directory. Existing output paths are rejected rather than overwritten:

```sh
SIGHTLINE_PILOT_RUN=model-pilot-followup SIGHTLINE_PILOT_MODELS=qwen2.5:7b-instruct node scripts/benchmark-models.mjs
```

A genuinely unseen task/page evaluation, richer useful visual semantics, PII/redaction measurements, client resources and full-flow timings remain required. Do not change expected answers after observing model failures.

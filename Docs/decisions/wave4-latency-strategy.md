# Wave 4 — G11 latency strategy

Date: 14 September 2026. Gate **not** weakened.

## Problem

G11 requires p95 full-flow &lt;200 ms over ≥100 attempts including capture, model, network and action. Historical local Qwen responses are **seconds** (e.g. 3029 ms, 2276 ms). Wave3 protect-loop ~188 ms is capture+filter only.

## Implemented reductions (honest)

1. **Privacy-only mode** — extension popup checkbox (default on): completes at sanitize/review with **no planner fetch**. Useful for privacy demos; **not** a G11 pass.
2. **Detector session cache** — reuse WASM UltraFace session across captures in one popup lifetime.
3. **Optional wireframe preview** — skip selective mosaic RGBA work when operators only need the semantic egress story.
4. **Faster local heuristics** — allow-list / stage helpers stay CPU-cheap; microbenchmark distribution in `Benchmarks/results/core-latency.json`.

## Not implemented / not claimed

- Token streaming of the LLM (would not alone bring multi-second generation under 200 ms).
- Distilled sub-200 ms planner.
- Relabeling privacy-only local ms as full-flow.

## Evidence

- `Prototype/shared/latency-strategy.mjs` + unit tests
- `Benchmarks/results/core-latency.json` (status **fail**)

# Brain 72h — Fast / Score / Reason productization

**Date:** 2026-09-14  
**Branch:** `brain/72h-claims-honesty` (continues Hour 0 PR)  
**Scope:** Label Architect’s three paths in extension popup + website + docs. Honesty only. **Do not weaken G11.**

## Paths

| Path | What it is | Product status | Timing / G11 |
|------|------------|----------------|--------------|
| **Fast** | capture → detect → mask → privacy review; **no LLM** | Implemented (privacy-only checkbox, default on) | Popup may show local capture/WASM ms. **Fast ≠ G11.** |
| **Score** | Heuristic / risk score before LLM | **Planned / partial** — no runnable Score UI | No Score SLO; do not invent a fake score panel |
| **Reason** | Ollama/Qwen plan + human confirm | Implemented (uncheck Fast → Send protected layout) | Historically **seconds**; **outside &lt;200 ms budget**; included in G11 full-flow |

## Measurement policy (non-negotiable)

1. **G11** (`Guardrails/guardrails.json`): planner-inclusive **full-flow** p95 **&lt;200 ms** at **n ≥ 100** (after 10 warmups) on the declared local reference. Status remains **fail** until that evidence exists.
2. **Fast path timings must never be reported as a G11 pass**, even if local protect is sub-200 ms on some machines.
3. **Reason** stays out of budget until measured otherwise; historical Qwen responses are multi-second (`Docs/decisions/wave4-latency-strategy.md`, `Benchmarks/results/core-latency.json`).
4. **Score** must not be productized with fabricated metrics or a pretend working control.
5. DigiLocker references are **inspired UX** (trust chip / navy–paper instrument look) only — not DigiLocker APIs, credentials, or data sharing.
6. `submission_ready` stays **false**; no fabricated metrics.

## UI surfaces

- **Extension popup:** path strip (Fast / Score / Reason), Fast checkbox wiring, Score disabled “planned”, Reason plan+confirm panel tagged out-of-budget; metrics prefix “Fast path (not G11 full-flow)”.
- **Website architecture:** three path buttons + ASCII diagram + separate SLO copy; link to this decision.
- **Code:** `Prototype/shared/latency-strategy.mjs` exports `THREE_PATHS`.

## Explicit non-goals

- No G11 status flip. No purchases. No Score fake-out. No big planner refactor.

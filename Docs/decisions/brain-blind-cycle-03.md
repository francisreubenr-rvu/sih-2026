# Blind cycle-03 — evidence freshness + Score fixture bridge + Reason cold-start

**Date:** 2026-09-15  
**Branch:** `brain/blind-cycle-03`  
**Scope:** Fresh-eyes High fixes. No fabricated metrics. No `submission_ready`. No G* flips without verified evidence (G14 already pass on ledger — site copy aligned only).

## Verified problems

1. **Site under-promoted Wave 5–7 + G14 pass.** `#latest-evidence` still headed “Wave 4…”. Wave 5/7 footers still said G14 unknown while `Guardrails/guardrails.json` and `demo-rehearsal.json` record G14 pass on `996e40b`. Score chip still said “Planned / partial” after cycle-02 made Score runnable.
2. **Score path lacked a labeled fixture bridge.** Local risk existed in the popup but was not wired to held-out fixture JSON.
3. **Reason cold-start UX.** Planner failure called `clear()`, wiping the protected capture and only saying “Capture again” — no Fast/Score steer when Ollama is down.

## Fixes

| Fix | What changed | Honesty bound |
|-----|--------------|---------------|
| Evidence freshness + claim drift | `Website/index.html` latest-evidence + Wave 5/6/7/delivery copy; `Docs/claim-ledger.json` | G14 pass cited from existing ledger only; G11 fail; G03/G20 open/paused |
| Score → fixture bridge | `scoreHeldOutFixture*` in `Prototype/shared/score-path.mjs`; `scripts/eval-score-path-heldout.mjs`; `Benchmarks/results/score-path-heldout-v01.json` | `officialScore`/`webPiiScore` null |
| Reason cold-start | `Prototype/extension/popup.mjs` keeps capture; forces Fast; EN/HI copy | Does not invent planner availability |

## Explicit non-goals

- No invented WebPII wins. No G11 flip. No `submission_ready: true`. No G20 fabricate. No purchases/logins.

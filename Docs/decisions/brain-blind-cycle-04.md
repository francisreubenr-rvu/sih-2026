# Blind cycle-04 — G20 pause honesty + Score↔GT correlation + Reason pre-Send health

**Date:** 2026-09-15  
**Branch:** `brain/blind-cycle-04`  
**Scope:** Fresh-eyes High fixes. No fabricated metrics. No `submission_ready`. No G* flips without verified evidence. **No popup mosaic/sandbox architecture rewrite** (leave W-004 / DBG-003).

## Verified problems

1. **G20 still read as active recruiting** in `Docs/human-evaluation-protocol.md` / forms / `human-evaluation.json` / G20 reason, while delivery-status and site evidence already said Francis paused recruits. Delivery timeline still said “G03/G20 remain open.”
2. **Score held-out bridge lacked band↔GT-kind correlation** — bands existed, but no descriptive association report vs fixture `groundTruthPii.kind` (without inventing WebPII/officialScore).
3. **Reason Send still paid full planner latency** before discovering Ollama was down — cycle-03 cold-start helped after failure; pre-Send probe was missing.
4. **Pages deploy lag:** live `#latest-evidence` still headed “Wave 4…” while master (post cycle-03) already promotes Wave 5–7 + G14.

## Fixes

| Fix | What changed | Honesty bound |
|-----|--------------|---------------|
| G20 pause honesty | Protocol, forms, guardrails G20 *reason*, human-evaluation.json, Website delivery/limits copy, claim-ledger | G20 **status stays `unknown`**; not a pass/fail flip |
| Score↔GT correlation | `correlateScoreBandsWithGroundTruthKinds` in `score-path.mjs`; results JSON schema_version 2 | `officialScore`/`webPiiScore` null |
| Reason pre-Send health | `reason-health.mjs`; `/api/v1/health?planner=1` Ollama `/api/tags` probe; popup gate before POST plans | Does not start Ollama; Fast/Score steer on fail |

## Explicit non-goals

- No invented WebPII wins. No G11 flip. No `submission_ready: true`. No G20 fabricate. No purchases/logins.
- No thin-popup / mosaic / ORT sandbox refactors (W-004).

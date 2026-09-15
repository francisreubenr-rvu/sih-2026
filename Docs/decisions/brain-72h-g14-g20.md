# Brain 72h — G14 demo rehearsals + G20 human evals (next step)

**Date:** 2026-09-15  
**Branch:** `brain/72h-human-eval`  
**Depends on:** master after PR #5 (`brain/72h-claims-honesty` merge)  
**Scope:** Make G14/G20 **runnable** for Francis this week. Templates become calendar-ready + recruit-ready. **No fabricated results.** G11 untouched. `submission_ready` stays false.

---

## What to do this week

### G14 — three consecutive live rehearsals

1. Book a quiet 60–90 min block (or three short slots the same day).
2. Follow `Docs/demo-rehearsal-checklist.md` reset → critical journey → log.
3. Prefer privacy-only Fast path if Ollama is unavailable; narrate skip honestly.
4. After each live run, append one object to `Benchmarks/results/demo-rehearsal.json` → `consecutive_rehearsals`.
5. A single `fail` resets the streak. Do not set `"status": "pass"` until three consecutive `success` rows share one `build_sha` and offline `Docs/demo-fallback.webm` was verified.
6. Optional: one run may follow `Docs/demo-toolbar-capture-protocol.md` and fill `toolbar-capture-log-v01.json` (still not a G03 claim alone).

### G20 — recruit ≥5 non-author participants (+ ≥3 narrative reviewers)

1. Copy the recruit template from `Docs/human-evaluation-protocol.md`; invite ≥8 people to net ≥5 completes.
2. Run frozen synthetic-fixture tasks only; use forms in `Docs/human-evaluation-forms.md`.
3. Log anonymized `P#` / `R#` rows into `Benchmarks/results/human-evaluation.json`.
4. Keep private invite lists **out of git**. Team practice → `team_rehearsal` only.
5. Leave `"status": "unknown"` until ≥5 participants **and** ≥3 narrative reviewers exist for real.

---

## Files touched this step

| File | Change |
|------|--------|
| `Docs/demo-rehearsal-checklist.md` | Calendar slots, streak rules, JSON row shape |
| `Docs/human-evaluation-protocol.md` | Week plan + recruit template + JSON shapes |
| `Docs/human-evaluation-forms.md` | Session header + private recruit checklist |
| `Benchmarks/results/demo-rehearsal.json` | Schema/structure only; `consecutive_rehearsals: []` |
| `Benchmarks/results/human-evaluation.json` | Schema/structure only; empty participant arrays |
| `Docs/decisions/brain-72h-g14-g20.md` | This note |

---

## Explicit non-goals

- No purchases. No Google login.
- No fake rehearsal successes or ghost human evals.
- Do not edit Guardrails G11 or flip `Docs/delivery-status.json` → `submission_ready`.
- Do not claim G03 toolbar pass from docs alone.
- Do not mark G14/G20 pass in `Guardrails/guardrails.json` until evidence exists.

## Exit criteria for a later PR (not this one)

- G14: three consecutive logged successes + fallback verified → then update demo-rehearsal status + G14 reason.
- G20: ≥5 / ≥3 anonymized rows → then update human-evaluation status + G20 reason.


---

## Addendum — recruitment paused (2026-09-15)

Francis paused G20 non-author recruitment. Keep protocol/forms as templates. Leave `Guardrails` G20 `status: unknown`. Do not send the recruit template until explicitly resumed. Blind cycle-04 aligned site/ledger/protocol language to this pause.

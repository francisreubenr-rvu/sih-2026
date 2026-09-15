# Blind cycle-02 — Score path + Fast judge + claim drift

**Date:** 2026-09-15  
**Branch:** `brain/blind-cycle-02`  
**Scope:** Fresh-eyes High fixes. No fabricated metrics. No `submission_ready`. No G* flips without verified evidence.

## Verified problems (not trusted from cycle-01 alone)

1. **Score path** was labelled on the website and popup but had **no runnable UI** — organizer weights put visual+PII+redaction ≈65%, so a planned-only chip was a judge gap.
2. **Claim drift:** pitch/submission decks and speaker notes still said **75** / **107** Node tests while README / delivery-status measured **115** (2026-09-15).
3. **No single Fast-path judge command** that is explicitly Ollama-free end-to-end (docs mentioned optional Ollama; CI had `test:ci`, but judges lacked one entrypoint).

## Fixes

| Fix | What changed | Honesty bound |
|-----|--------------|---------------|
| Score path partial runnable | `Prototype/shared/score-path.mjs` + extension popup Score checkbox/panel | Local risk **band** only; `officialScore: null`; not WebPII; not G11 |
| Claim drift | `scripts/build_final_decks.py` + regenerated decks/notes | 115 tests as of 2026-09-15; Wave4 107 kept only as historical wave label where needed → replaced with current 115 |
| Judge Fast script | `scripts/judge-fast-path.mjs` + `npm run judge:fast` | Forces unreachable Ollama; G11 remains fail |

## Explicit non-goals

- No invented WebPII wins. No G11 flip. No `submission_ready: true`. No purchases/logins.

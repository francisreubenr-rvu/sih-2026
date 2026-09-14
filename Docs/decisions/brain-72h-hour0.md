# Brain 72h — Hour 0: public claim hygiene

**Date:** 2026-09-14  
**Branch:** `brain/72h-claims-honesty`  
**Scope:** Honesty fixes only. No gate status changes. G11 remains fail. `submission_ready` remains false.

## Changes

1. **Root README.md** — Replaced stale “Thirty-seven automated tests” with **113** (verified via `cd Prototype && npm test`: 113 pass / 0 fail). Corrected Lighthouse claim to match G12 / `lighthouse-dhristi-v02-summary.json`: mobile performance **99**, desktop **100**, a11y / best-practices / SEO **100**. Removed the overclaim that all four categories were 100 on every profile.
2. **Website/README.md** — Corrected GSAP/ScrollTrigger wording: vendor files exist under `Website/assets/` but are unused by the live site; no jsDelivr load claim.
3. **Website/index.html** — Pointed three evidence links that still targeted `feat/p0-extension-selective-redaction/` at `master` equivalents (`extension-loop-v01.json`, `security.json`, `core-latency.json` — all present on master).
4. **Repository description** — Updated via `gh repo edit` to Dhristi wording (Sightline → Dhristi).

## Explicit non-goals

- No fabricated metrics.
- Did not delete unused GSAP binaries (prefer README honesty over large asset deletes).
- Did not weaken G11 or flip `submission_ready`.

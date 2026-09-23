# Website pixel redesign — PR1 of 3

**Date:** 2026-09-23  
**Scope:** `Website/` marketing canvas, `DESIGN.md` surfaces note, this decision.  
**Not in scope:** `extension/`, `Prototype/`, `warden/`, `scripts/g11*`, Benchmarks evidence, guardrail statuses.

## Decision

`extension/pixel.css` remains the measured dark-panel source of truth (ground `#0b0b0f`, cream `#e8e9de`, amber `#fcc34a`). The marketing site cannot link that file, so `Website/style.css` ports the token **names** and the shared primitives (`.cell-grid`, `.detection-box`, `.pixel-chip`, `.pixel-check`, `.pixel-reveal`, `.pixel-pulse`, `.pixel-pop`, scanline and dither helpers).

On the Website those names are remapped for body readability:

| pixel.css name | Website value | Role |
|---|---|---|
| `--ground` | `--paper` `#f3ead8` | Page canvas |
| `--cream` | `--ink` `#101827` | Structure, keylines, text on paper |
| `--amber` | `--saffron` `#d88732` | CTA and uncertain states only |
| `--trust` | `#5c8b63` | Verified-chip keyline only |
| `--trust-text` | `#14382a` (light) / `#c5e0cb` (dark) | Verified label text, so the chip is not small `#5c8b63` on paper |

Measured red/blue hexes stay available as `--px-*` and as chip fills (`--red-deep`, `--blue-deep`) with light `#f3ead8` text. They are not page ground and not small body text. `--trust` is not a generic “on” or meter color.

Motion uses the ported `steps()` durations. `prefers-reduced-motion: reduce` drops those animations. Body copy stays on the local Geist file at ≥13px. Mono stays on IDs, scores, and telemetry. No new webfont and no CDN.

Hybrid C is unchanged: lockup in the masthead, bug on the favicon, footer, and the demo dialog. Copy, gate words, and `submission_ready` are unchanged. G11 stays fail. G20 stays paused.

## Still open

PR2 and PR3 are not this change. Prototype chrome and the root extension side panel still use their own stylesheets.

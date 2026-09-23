# Website pixel redesign — PR1 of 3

**Date:** 2026-09-23  
**Scope:** `Website/` marketing canvas, `DESIGN.md` surfaces note, this decision.  
**Not in scope:** `extension/`, `Prototype/`, `warden/`, `scripts/`, Benchmarks evidence, guardrail statuses.

## Decision

Architect Option A. The Website physical palette is Hybrid C only:

| Token | Value | Role |
|---|---|---|
| `--ink` | `#101827` | Text, keylines, structure |
| `--navy` | `#162b46` | Headers and instrument panels |
| `--paper` | `#f3ead8` | Page canvas |
| `--mist` | `#c7d5d2` | Quiet fills |
| `--saffron` | `#d88732` | CTA and attention only |
| `--trust` | `#5c8b63` | Verified-chip keyline only |

Dark v4 names (`--ground`, `--cream`, `--amber`, `--red`, `--blue`) are not declared on the Website. `extension/pixel.css` remains their physical owner. Any alias bridge from Hybrid C names onto those hexes is root-extension work (PR3), not this PR.

This is not a third palette. The site gets denser HudFrame chrome and the shared class vocabulary (`.hud-frame`, `.cell-grid`, `.pixel-chip`, `.pixel-check`, stepped reveal/pulse/pop). Those classes paint with the six Hybrid C tokens. Fail copy stays ink on paper. Attention chips use saffron. Verified chips use a trust keyline and ink text, because small `#5c8b63` on paper is about 3.3:1.

Motion is `steps()`. `prefers-reduced-motion: reduce` drops it. Body stays on the local Geist file at 15px. Mono stays on IDs, scores, and telemetry. No new webfont and no CDN.

Hybrid C placement is unchanged: aperture lockup in the masthead, bug on the favicon, footer, and demo dialog. Copy and gate words are unchanged. G11 stays fail. G20 stays paused. `submission_ready` stays false.

## Still open

PR2 and PR3 are not this change. Prototype chrome is untouched. The root extension side panel still owns the dark v4 sheet.

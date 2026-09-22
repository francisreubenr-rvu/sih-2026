# Brain — Wrap harder finish (pixel HUD + prototype + explain)

**Date:** 2026-09-22  
**Branch:** `brain/wrap-harder-finish`  
**Authority chrome brief:** `Docs/decisions/brain-arch-pixel-hud-002.md` (ARCH-PIXEL-HUD-002)  
**Prior wrap:** PR#27 / `Docs/decisions/brain-pixel-ui-wrap.md` (not enough — densify further)  
**Scope:** Website + extension popup + Prototype/app chrome densify; prototype zips/tests green; explain video refresh. Brand Hybrid C unchanged. No gate flips. `submission_ready` remains **false**.

## What changed vs PR#27

| Axis | PR#27 wrap densify | Harder finish (this) |
|------|--------------------|----------------------|
| Geometry | radius 0–2px; viewfinder ticks | **ARCH-002:** `--radius:0` HUD; **8px nine-slice** `HudFrame`; **4px fill inset**; `--shadow: 2px 2px 0` |
| Panels | Navy headers + mono telemetry | Modular **STATUS \| COMMANDS \| TELEMETRY** triad (FFT-style); `HudTitleBar`; `GridPanel` gutters |
| Meters | Continuous bar widths | **`SegmentMeter`** stepped segments only |
| Trust | Some 999px sources remained | **Pills killed** → rectangular `TrustBadge` |
| Buttons | Soft densify press | Explicit **N/F/H/A/D** CommandLane states |
| Vocabulary | Ad-hoc class names | Shared ARCH names: HudFrame, HudTitleBar, TrustBadge, MetricCell, SegmentMeter |
| Video | ~96s title-card reel | ~108s title cards **+ local screen captures** (Website / popup / app) with burned captions |
| Prototype | cycle05 + zips | Rebuild zips; `build` + `test:ci` green (141) on clean dist |

## §9 apply order (done)

1. Shared token block on Website / popup / app CSS (§3).  
2. `HudFrame` + `HudTitleBar` wired on major panels.  
3. Kill remaining `border-radius: 999px` pills → TrustBadge.  
4. N/F/H/A/D on primary/secondary CTAs.  
5. SegmentMeter + MetricCell mono telemetry; honest null / G11 fail chrome.  
6. Hybrid C placement verified (lockup masthead; bug popup/favicon).  
7. Screenshots under `/workspace/sih-2026/_wrap_screenshots/` (local).

## Honesty (unchanged)

- DigiLocker = color tokens / UX rhythm only — not partner/API/custody.  
- Fast ≠ G11; G11 remains fail.  
- Semantic scene egress only; raw pixels local.  
- No named ISRO portal fiction; no MeitY seal.  
- G20 paused; `officialScore` may stay null.  
- No invented metrics/passes in chrome.  
- `submission_ready` stays false.

## Prototype

- `npm run build:extension` refreshed Website/downloads + Docs zips.  
- `npm run build` + `npm run test:ci` → **141 pass / 0 fail**.  
- cycle05 DOM-text-PII evidence remains honest (`officialScore` null ok).

## Video

- Replaced `Website/assets/dhristi-prototype-explain-v01.mp4` (~108 s, ~2.2 MB).  
- Transcript: `Docs/demo-explain-transcript-v01.md`.  
- No Google login; synthetic / local captures only.

## Remaining gaps needing Francis

- Chrome **toolbar glyph** human click (`activeTab`) — automation cannot complete G03 multi-scenario.  
- Live Firefox validation of packaged extension.  
- G20 non-author human validation remains paused.  
- G11 full-flow still fail (Reason-inclusive p95).  
- Node on some boxes is <22 (`node:sqlite`); CI/dev should use Node 22+.

## Files (primary)

- `Website/style.css`, `Website/index.html`, `Website/app.js`, `Website/assets/dhristi-prototype-explain-v01.mp4`  
- `Prototype/extension/popup.css`, `popup.html` (+ rebuild zips)  
- `Prototype/app/style.css`, `index.html`  
- `Docs/decisions/brain-arch-pixel-hud-002.md` (Architect authority; land with PR)  
- `Docs/decisions/brain-wrap-harder-finish.md` (this note)  
- `Docs/demo-explain-transcript-v01.md`

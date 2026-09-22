# Brain — Pixel UI wrap densify

**Date:** 2026-09-22  
**Branch:** `brain/wrap-pixel-proto-video`  
**Scope:** Website + extension popup/chrome + Prototype/app shared tokens. Brand Hybrid C unchanged. No gate flips. `submission_ready` remains false.

## Pinterest refs

Francis board pins (Japanese pixel art, not too simple):

- https://in.pinterest.com/pin/16677461117006205/
- https://in.pinterest.com/pin/4597330892631091584/
- https://in.pinterest.com/pin/187603140724677304/
- https://in.pinterest.com/pin/1759287348694704/
- https://in.pinterest.com/pin/20336635814145557/
- https://in.pinterest.com/pin/40532465390762263/

**Access note:** Pin URLs return HTML shells without authenticated image payloads in this environment. No Google/Pinterest login was performed. Direction followed `Docs/design-pixel-direction.md` (already distilled from the 25-pin board) plus public brand assets under `/workspace/dhristi-brand/`.

## What changed vs prior soft-pixel pass

| Axis | Soft-pixel (prior) | Wrap densify (this) |
|------|--------------------|---------------------|
| Corners | 2–4px soft radii; trust chips as pills (`999px`) | Stepped / square (`0–2px`); chips are rectangular instrument badges |
| Keylines | 2px single borders + light shadow | Same + saffron viewfinder corner ticks on panels; denser 8px grid (~7–8% contrast) |
| Modules | Flat paper cards | Navy mono HUD headers on evidence/scan panels; module panels for scan/path/score/reason |
| Telemetry | Mixed sans | Bitmap/mono for stage strips, path tags, demo chrome, popup metrics bar |
| Motion | Soft fade/slide arrive | Discrete stepped (2–3 frame) state changes; no glow loops |
| Surfaces | Website + popup already pixel-informed | Prototype/app tokens aligned; extension source densified then rebuild |

## Honesty (unchanged)

- DigiLocker-inspired UX only — not partner/API/custody.
- Fast ≠ G11; G11 remains fail.
- Semantic scene egress only; raw pixels local.
- No named ISRO portal fiction; no MeitY seal.
- G20 paused; `officialScore` may stay null — UI copy stays honest.
- No invented metrics/passes in chrome.

## Files

- `Website/style.css`, `Website/index.html` (demo explain video wiring)
- `Prototype/extension/popup.css` (+ rebuild zips)
- `Prototype/app/style.css`
- Screenshots under `/workspace/sih-2026/_wrap_screenshots/` (local only; not required in git)

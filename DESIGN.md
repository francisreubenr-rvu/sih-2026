# Dhristi design baseline

Pixel-informed instrument UI distilled from Docs/design-pixel-direction.md (board inventory: sightline-research/PINTEREST_PIXEL_REFS.md). Website is the authored implementation; Stitch/Pinterest pins are research only and are not committed.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--ink` | `#101827` | Body text, keylines, pressed chrome |
| `--navy` | `#162b46` | Headers, panels, primary structure |
| `--paper` | `#f3ead8` | Page canvas, card bodies |
| `--mist` | `#c7d5d2` | Secondary surfaces, quiet fills |
| `--saffron` | `#d88732` | Action / attention only |
| `--trust` | `#5c8b63` | Verified / healthy only |

## Rules

- **8px rhythm.** Padding, card gaps, and hit areas use 8px multiples; 4px for micro-label spacing.
- **1–2px dark keylines.** Prefer ink/navy borders over soft shadows; at most one 2px offset shadow on primary surfaces.
- **Stepped corners.** 2–4px radii (or clip-path chamfers); no large SaaS pills except compact trust chips.
- **Meaning colors.** Saffron = CTA/attention; trust green = verified/local. Never ambient neon, glow, or gradient morphs.
- **Typography.** Readable sans (Geist / system-ui) for body; bitmap/monospace only for IDs, timestamps, scopes, telemetry.
- **Trust chips.** Label + reason (hover/focus title). Keep EN/HI: `on this device` / `इस उपकरण पर`.
- **Extension popup.** ~360–420px wide, fixed header, one primary CTA, secondary details/history.
- **Empty/loading.** Low-opacity (~6–10%) pixel-grid or noise behind calm copy; never hurt text contrast.
- **Motion.** Discrete 1–2 frame state changes and instant focus outlines; respect `prefers-reduced-motion`.
- **A11y.** Contrast, visible focus, keyboard, semantic headings, 44px-class controls where practical.


## Brand chrome (Hybrid C)

Council-binding split (see `Docs/decisions/brain-logo-hybrid-c.md`):

- **A bug** — `Website/assets/dhristi-mark.svg`: pixel viewfinder (concentric stepped squares, saffron focus). Favicon, extension icons, popup header, footer monogram. Optional: `dhristi-mark-mono.svg`, `dhristi-mark-inverted.svg`.
- **B lockup** — `Website/assets/dhristi-lockup.svg`: aperture + **Dhristi** + **on-device vision**. Website masthead/hero only — never in the extension popup.
- **Hard don’ts:** no DigiLocker locker/document imitation; no MeitY seal; no partner co-brand; saffron = focus/CTA only; never imply DigiLocker affiliation.

## Surfaces

- Website: `Website/index.html` + `Website/style.css` (+ mark/lockup SVG under `Website/assets/`). The marketing canvas keeps this file’s paper/ink ground (`--paper` `#f3ead8`, `--ink` `#101827`, `--navy` `#162b46`). Token names and shared primitives (`.cell-grid`, `.pixel-chip`, `.pixel-reveal`, stepped `steps()` motion) are ported from `extension/pixel.css`, the measured dark-panel source of truth. That file is not linked and was not edited in the Website PR. `--amber` aliases `--saffron` `#d88732` (CTA and uncertain states). `--trust` `#5c8b63` is the verified-chip keyline only; small verified labels use `--trust-text` so the chip clears body contrast on paper.
- Extension side panel: root `extension/pixel.css` (measured `--ground` `#0b0b0f`). Unchanged by the Website port.
- Extension popup: `Prototype/extension/popup.html` + `popup.css` (header uses bug SVG under `icons/`). Unchanged by the Website port.
- Local workspace: light chrome alignment in `Prototype/app/` — privacy boundary copy unchanged.

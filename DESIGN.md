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

- Website: `Website/index.html` + `Website/style.css` (+ mark/lockup SVG under `Website/assets/`). Physical color names on this surface are Hybrid C only: `--ink`, `--navy`, `--paper`, `--mist`, `--saffron`, `--trust`, at the values in the table above. Shared chrome is the HudFrame vocabulary (`.hud-frame`, cell module, 1px keylines, stepped `steps()` motion). Dark v4 names (`--ground`, `--cream`, `--amber`, `--red`, `--blue`) are not defined here. Root `extension/pixel.css` keeps those measured hexes; an alias bridge is later extension work, not this surface.
- Extension side panel: root `extension/pixel.css` (measured dark ground). Unchanged by the Website PR.
- Extension popup: `Prototype/extension/popup.html` + `popup.css` (header uses bug SVG under `icons/`). Unchanged by the Website port.
- Local workspace: light chrome alignment in `Prototype/app/` — privacy boundary copy unchanged.

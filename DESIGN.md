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

## Surfaces

- Website: `Website/index.html` + `Website/style.css` (+ original SVG under `Website/assets/`).
- Extension: `Prototype/extension/popup.html` + `popup.css`.
- Local workspace: light chrome alignment in `Prototype/app/` — privacy boundary copy unchanged.

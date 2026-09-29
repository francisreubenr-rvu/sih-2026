# Dhristi design system

Two palettes, one rule set. **Signal** is the product: the extension side panel, the Prototype operator pages and the Prototype popup. **Website landing** is the public page. Both are light.

## Binding UI rules (Francis, 29 September 2026)

1. **No dark colours for backgrounds.** Every page, panel, card, chip, input, code block, tooltip, scrim, hatch and overlay ground is light: relative luminance at least 0.8. Dark is for text, ink and thin lines only. The one exception is a small fill of a saturated palette hue carrying its own white label: the single primary button (cobalt) and the on-page token chip (teal). Neither is a dark neutral. No near-black, charcoal or navy-grey fill is allowed anywhere, in any state. `scripts/check-signal-tokens.mjs` fails CI if a Signal ground token drops below 0.8 or the block stops declaring `color-scheme:light`.
2. **Every colour interaction follows colour theory.** Before adding a colour, name its relationship to the palette (analogous, complementary, tint or shade of an existing hue). If it has none, it does not go in.

## Colour theory used here

| Principle | How it is applied |
|---|---|
| One neutral family | Grounds, lines and ink are the primary's hue (~230°) at very low chroma, so neutrals and the primary read as one material. The Website instead uses a warm off-white (`#f3f4f1`) as a complementary ground for its cobalt; the two surfaces never share a screen. |
| Temperature carries meaning | Cool means the system is acting or has verified: cobalt (act, 230°) and teal (detected or verified on this device, 188°), an analogous pair 45° apart. Warm means a person is needed: amber (waiting, 36°) and brick red (stop, destructive, personal data, 9°), also analogous. The two pairs sit across the wheel from each other, so "needs you" always contrasts with "working". |
| Shade and tint per hue | Each hue has one text-safe shade (AA on every ground) and one tint used only as the fill behind that same shade. A hue never sits on another hue's tint, and two saturated hues never touch without a neutral between them. |
| One accent at a time | A view has one primary (cobalt) action. Violet, analogous to cobalt, appears only inside a glow. Flame (`#ff5b2e`, the Website accent) is for large numerals and marks only: 3.1:1 on white, never body text. |
| Value before hue | Hierarchy comes from lightness steps (ink → text-2 → text-3, panel → panel-2), so the layout still reads in greyscale. Status is never colour alone: every chip also has a text label. |
| Contrast | Text at least 4.5:1 on every ground and tint it can sit on. Control outlines and focus rings at least 3:1 (WCAG 1.4.11). CI checks every pair. |

## Website landing

| Token | Value | Role |
|---|---|---|
| `--paper` | `#f3f4f1` | Page ground |
| `--white` | `#ffffff` | Cards, alternating bands |
| `--tint` | `#e4e8ff` | Pale cobalt band, image offset |
| `--ink` / `--ink-2` / `--ink-3` | `#0d1014` / `#3f4550` / `#5a616d` | Text (lowest: ink-3 on the tint band, 5.1:1) |
| `--line` | `#d6d9d2` | Hairlines |
| `--cobalt` | `#1f36d6` | Links, primary buttons (white text 8.2:1) |
| `--flame` | `#ff5b2e` | Large numerals on white cards (3.1:1) and decorative marks only, never body text |

- **Type:** Anton (display headings, uppercase), Open Sans 600/700 (subheadings, labels, buttons), Glacial Indifference (paragraphs). All are OFL and self-hosted in `Website/assets/fonts/`.
- **Content rule:** public key information only (what Dhristi is, the problem, how it works, the demo, the privacy boundary, SIH26171 context, the team). Engineering evidence (waves, gates, benchmarks) lives in the repository, not on the landing page.
- **Imagery:** real prototype screenshots and footage recorded from the local build with synthetic data, plus public-domain NASA Earth photography, credited on the page. No third-party copyrighted images (e.g. Pinterest pins).

# Signal (product surfaces)

One light system for the extension side panel, the Prototype operator pages and the Prototype popup. The first edition (29 September 2026, `Docs/decisions/brain-signal-redesign.md`) was dark. It was re-cut light the same day under the binding rules above. Token names are kept from that edition, so `--sg-void` is now the page ground, not a black.

## Tokens

Canonical source: `design/signal-tokens.css`. Each product surface carries a verbatim copy between `/* signal:tokens:start */` and `/* signal:tokens:end */`; `node scripts/check-signal-tokens.mjs` fails on drift, on contrast below WCAG AA, and on a dark ground.

| Token | Value | Role |
|---|---|---|
| `--sg-void` | `#f4f5f8` | Page ground |
| `--sg-panel` / `--sg-panel-2` | `#ffffff` / `#eceff7` | Cards; insets and raised rows |
| `--sg-line` / `--sg-line-strong` | `#d5d9e6` / `#7f87a3` | Hairlines; control outlines (3.3:1) |
| `--sg-text` / `-2` / `-3` | `#12162b` / `#3d4460` / `#565d78` | Ink, secondary, meta (lowest 5.65:1) |
| `--sg-glow` / `--sg-glow-tint` | `#1f36d6` / `#e7eafc` | The one primary action, focus, links (white on it 8.2:1) |
| `--sg-scan` / `--sg-scan-tint` | `#0a6b78` / `#dff1f3` | Detected, verified on this device, pass |
| `--sg-ask` / `--sg-ask-tint` | `#8a5300` / `#fbefd9` | Waiting on a person, unknown, paused |
| `--sg-stop` / `--sg-stop-tint` | `#b8321c` / `#fbe5e0` | Fail, personal data, destructive |
| `--sg-violet` | `#6b3fd4` | Only inside a glow |
| `--sg-shadow` | cobalt-ink, 6–18% | Raised cards only; hairlines are preferred |

## Type

- **Geist** for text and headlines (500, tight tracking).
- **Instrument Serif italic** for the key phrase of a headline only, e.g. "Your screen. *Your boundary.*"
- **Geist Mono** for every label, status, ID, timestamp and scope, in uppercase with letter-spacing.
- All three are OFL and self-hosted per surface (`fonts/` with `OFL.txt`). No font CDN.

## Motifs

- **Detection box.** A 1px scan-cyan box with a mono label chip above it. It is the signature, because it is what the product does. Cards use detection corner ticks instead of full frames.
- **Dither.** Halftone dot fields in ink at low opacity on light grounds, for empty states only.
- **Bloom.** At most one soft cobalt-to-violet tint per view, behind a hero or call to action. It is a light tint, never a dark glow.

## Rules

- Colour carries meaning. Cobalt means act, teal means detected or verified, amber means waiting, red means stop. Status is never colour alone: each chip also has a text label.
- Radius is 2px. Hairlines are preferred over shadows.
- Keep a 16px minimum gutter, never scroll the page horizontally, and use 44px controls.
- Motion: eased on the Prototype pages, stepped on the side panel. Everything stops under `prefers-reduced-motion`, and content is visible at rest (reveals move and never hide).
- Fixture pages (`Prototype/app/*fixture*.html`) are synthetic targets, not UI. Never restyle them.

## Brand

The Hybrid C viewfinder geometry is unchanged (`Docs/decisions/brain-logo-hybrid-c.md`), recoloured as `dhristi-mark-signal.svg`. Hard don'ts are unchanged: no DigiLocker, MeitY or partner imitation, and no implied affiliation.

## Surfaces

| Surface | Tokens | Layout |
|---|---|---|
| Extension side panel | `extension/signal.css` | `extension/pixel.css` (semantic aliases) + `extension/sidepanel.css` |
| Prototype operator pages | `Prototype/app/signal.css` (+ shared base) | `style.css`, `validation.css`, `operations.css`, … |
| Prototype popup | `Prototype/extension/signal.css` | `Prototype/extension/popup.css` (Signal layer at the end) |

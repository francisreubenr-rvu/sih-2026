# Dhristi design system: Signal

One dark system for every surface: the Website, the extension side panel, the Prototype operator pages and the Prototype popup. Decision and references: `Docs/decisions/brain-signal-redesign.md` (29 September 2026, supersedes ARCH-PIXEL-HUD-002 and the 13 September side-panel palette).

## Tokens

Canonical source: `design/signal-tokens.css`. Each surface carries a verbatim copy between `/* signal:tokens:start */` and `/* signal:tokens:end */`; `node scripts/check-signal-tokens.mjs` fails on drift or on contrast below WCAG AA.

| Token | Value | Role |
|---|---|---|
| `--sg-void` | `#05060a` | Page ground |
| `--sg-panel` / `--sg-panel-2` | `#0b0d16` / `#11141f` | Raised surfaces |
| `--sg-line` / `--sg-line-strong` | `#232842` / `#3a4272` | Hairlines, control borders, detection ticks |
| `--sg-text` / `-2` / `-3` | `#eceef6` / `#a9aec6` / `#868ba5` | Primary, secondary, meta text (≥5.4:1 on every ground) |
| `--sg-glow` | `#4f5dff` | The one primary action; focus. Never small text |
| `--sg-glow-text` | `#a8b0ff` | Indigo when it must be text, links |
| `--sg-violet` | `#8f5cff` | Only inside a bloom |
| `--sg-scan` | `#66e0ec` | Detection boxes, verified-local, pass |
| `--sg-ask` | `#f2b34a` | Waiting on a person, unknown, paused |
| `--sg-stop` | `#ff6b61` | Fail, personal data, destructive |

## Type

- **Geist** for text and headlines (500, tight tracking).
- **Instrument Serif italic** for the key phrase of a headline only, e.g. "Your screen. *Your boundary.*"
- **Geist Mono** for every label, status, ID, timestamp and scope, in uppercase with letter-spacing.
- All three are OFL and self-hosted per surface (`fonts/` with `OFL.txt`). No font CDN.

## Motifs

- **Detection box.** A 1px scan-cyan box with a mono label chip above it. It is the signature, because it is what the product does. Cards use detection corner ticks instead of full frames.
- **Dither.** Halftone dot fields for imagery and empty states (the hero lens is procedural canvas, `Website/assets/perception.js`), at a low-opacity page texture.
- **Bloom.** At most one indigo-to-violet radial glow per view, behind the hero or the closing call to action.

## Rules

- Colour carries meaning. Indigo means act, cyan means detected or verified, amber means waiting, red means stop. Status is never colour alone: each chip also has a text label.
- Radius is 2px. Hairlines are preferred over shadows; the primary button is the only element with a glow shadow.
- Keep a 16px minimum gutter, never scroll the page horizontally, and use 44px controls.
- Motion: eased on the Website, stepped on the side panel. Everything stops under `prefers-reduced-motion`, and content is visible at rest (reveals move and never hide).
- Fixture pages (`Prototype/app/*fixture*.html`) are synthetic targets, not UI. Never restyle them.

## Brand

The Hybrid C viewfinder geometry is unchanged (`Docs/decisions/brain-logo-hybrid-c.md`), recoloured as `dhristi-mark-signal.svg`. Hard don'ts are unchanged: no DigiLocker, MeitY or partner imitation, and no implied affiliation.

## Surfaces

| Surface | Tokens | Layout |
|---|---|---|
| Website | `Website/style.css` | same file, `Website/assets/perception.js` |
| Extension side panel | `extension/signal.css` | `extension/pixel.css` (semantic aliases) + `extension/sidepanel.css` |
| Prototype operator pages | `Prototype/app/signal.css` (+ shared base) | `style.css`, `validation.css`, `operations.css`, … |
| Prototype popup | `Prototype/extension/signal.css` | `Prototype/extension/popup.css` (Signal layer at the end) |

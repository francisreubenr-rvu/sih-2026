# Signal: one design system for every Dhristi surface

**Date:** 29 September 2026
**Authority:** Francis asked for "a major UI/UX redo" from three reference images and chose the scope "everything, including the Prototype", delivered as a PR for review.
**Supersedes:** ARCH-PIXEL-HUD-002 (paper/navy/saffron HUD) for Website and Prototype, and the 13 September measured side-panel palette in `extension/pixel.css`. This resolves the design conflict that `Docs/decisions/brain-fundamentals-restructure.md` recorded as waiting for Francis's call.

## References and what was taken from each

The three references are mood only. Nothing from them is copied into the repository: no image, logo or wordmark.

| Reference | Taken | Not taken |
|---|---|---|
| Glowing icon ring around a hand, "Make magic happen" | A single indigo/violet bloom per view; a serif headline voice | The 3D render, the icons, the third-party logo |
| 1-bit dithered hand and orb, "Create with no *limitations*" | Halftone dot imagery; sans text that turns to italic serif on its key phrase | The photograph, the stepped-square logo |
| Scan-line hand with nested bounding boxes and tiny labels | Detection boxes with mono labels as the recurring UI motif; cyan scan colour | The image itself |

The detection-box motif is also what the product does: it draws boxes around what it will mask.

## Decisions

1. **One token block, four copies.** `design/signal-tokens.css` is canonical. `Website/style.css`, `extension/signal.css`, `Prototype/app/signal.css` and `Prototype/extension/signal.css` each carry it verbatim, because the four surfaces deploy from separate roots (Pages, two unpacked extensions, the Node server). `scripts/check-signal-tokens.mjs` fails CI on drift or on any text/ground pair below WCAG AA; the lowest pair is white on the indigo button at 4.84:1.
2. **Meaning, not decoration.** Indigo `--sg-glow` is the one primary action and focus. Cyan `--sg-scan` is detection and verified-local. Amber `--sg-ask` means waiting on a person or unknown. Red `--sg-stop` means fail, personal data or destructive. Violet appears only inside a glow. This keeps the side panel's existing semantics: amber is a waiting decision, red is personal data or destructive, and blue is an accepted plan.
3. **Type.** Geist for text, Geist Mono for every label and status, and Instrument Serif italic for the key phrase of a headline. All three are OFL-licensed and self-hosted on each surface; Geist Mono is subset to Latin. There is no font CDN, which matches the privacy posture.
4. **Hero image is procedural.** `Website/assets/perception.js` draws an original ordered-dither lens on a canvas. It uses no image asset and makes no network request, renders one still frame under reduced motion, and pauses offscreen. Its first frame waits for idle time after load. The detection boxes over it are DOM, and the caption says it is an illustration, not a live capture.
5. **Mark.** The Hybrid C viewfinder geometry is unchanged (`Docs/decisions/brain-logo-hybrid-c.md`); it is recoloured as `dhristi-mark-signal.svg`, and the extension PNG icons are regenerated from it.
6. **Structure kept.** Every ID, class and data attribute that scripts or harnesses read is unchanged, and so is `sidepanel.js`. Fixture pages are synthetic targets, not UI; they are untouched, and so are the canvases that paint captured-page previews.
7. **Copy.** Every evidence claim on the Website is kept verbatim. Two kinds of copy changed. First, copy that described the old styling ("DigiLocker-inspired navy/paper chrome") was removed, because it is no longer true; the popup keeps a plain "not an official SIH, ISRO or DigiLocker tool" line. Second, a factual "How it works" section was added for the shipping side panel + Warden pipeline, with its untested-live status stated.

## Measured on this change (29 September 2026, this container)

- axe-core 4.10.2 (WCAG 2.0/2.1 A and AA plus best practice):
  - 0 violations on the Website, the Prototype workspace and the operations, task-loop, validation and text-preview pages, and the built popup.
  - The side panel shows the same three findings as master (list, region, aria-allowed-role). They come from unchanged `sidepanel.js` markup and are not introduced here.
- Lighthouse 12.8.2, mobile, three runs each, same machine:
  - Master: performance 99/99/99, LCP 2.2–2.3 s.
  - This change: 97/98/97, LCP 2.4–2.5 s, total blocking time 0 ms, accessibility/best-practices/SEO 100.
  - Desktop: 100 on all four categories.
  - The LCP element is the serif hero phrase; the extra serif face costs about 0.25 s.
  - These are local measurements, not the historical `dhristi-v02` records, which stay as they were.
- Real Chromium: Prototype Fast-path Capture & protect ran in the new workspace (protected in 305 ms, 1 face detected).
- Tests: Prototype 141/141, extension 58/58, G11 harness 13/13.

## Not changed

No guardrail status changed: G11 stays fail, G14 unknown, G20 paused, and `submission_ready` false. No behaviour changed in the extension, Warden or Prototype. The committed extension zips (`Docs/*.zip`, `Website/downloads/*.zip`) are not rebuilt in this change. The explain video still shows the earlier interface, and the site says so.

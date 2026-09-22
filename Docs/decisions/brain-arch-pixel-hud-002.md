# ARCH-PIXEL-HUD-002 — Denser Japanese pixel / RPG-HUD chrome

**Task:** ARCH-PIXEL-HUD-002 (Synapse harder finish)  
**Agent:** Architect  
**Date:** 2026-09-22  
**Scope:** Docs-ready densify for **Website** + **extension popup** + **Prototype/app**. Worker implements **only** from this brief.  
**Brand:** Hybrid C unchanged (viewfinder **bug** favicon/ext; aperture **lockup** Website masthead).  
**Factual source (sole):** Researcher R-PIXEL-HUD-001 takeaways + public refs cited there.  
**Baseline:** `Docs/design-pixel-direction.md` + wrap densify `Docs/decisions/brain-pixel-ui-wrap.md`.  
**Claim freeze:** DigiLocker = **color tokens / UX rhythm only** (not partner, API, custody). **Fast ≠ G11**. No invented metrics in chrome. `submission_ready` / gate flips out of scope.

This brief densifies **chrome only**. No new product requirements, flows, or claim language.

---

## 1) Design intent

Move from “soft densify” (stepped corners + navy headers + mono telemetry) to a **modular RPG-HUD instrument language**:

- Static **status | commands | meta** grids (FFT-style menu discipline).
- **GridPanel** placement (row/col), narrow cursors (DQIII-style).
- **8px nine-slice** frames with **4px fill** inset (Lospec / RPG Maker window-skin geometry).
- Bitmap telemetry: mono/pixel font, **segmented meters**, stepped corners.
- Button states **N / F / H / A / D** explicit (Normal / Focus / Hover / Active / Disabled).
- Icons **32px** logical (integer scale from 16px source), silhouette-first.
- **Nearest-neighbor** scaling; **whole-pixel** coordinates only.

Calm instrument — not arcade neon, not SaaS glass.

---

## 2) Component vocabulary (names Worker must reuse)

| Name | Role | Surfaces |
|------|------|----------|
| `HudFrame` | 8px nine-slice border; 4px paper/navy fill inset; saffron L-ticks optional | All panels |
| `HudTitleBar` | Navy strip, mono uppercase label, optional right meta (clock/path) | Panel headers |
| `GridPanel` | CSS grid with explicit `row`/`col` slots; 8px gutter | Popup body, evidence, hero modules |
| `StatusLane` | Left/top static grid: path tags, trust, last-check | Popup, app chrome |
| `CommandLane` | Primary/secondary actions as HUD buttons | Popup CTA row, hero CTA, app toolbar |
| `MetaLane` | IDs, timestamps, revision, permission scope | Footer strips, scan cards |
| `TrustBadge` | Rectangular (never pill); trust keyline + shield/check + label | All |
| `MetricCell` | Bordered cell; mono value; micro label | Scan / score / evidence |
| `SegmentMeter` | Stepped bar (N discrete segments); no smooth gradient fill | Latency / risk band display |
| `CursorTick` | 2×8 or 8×2px saffron/navy caret for focused row | Popup lists, command rows |
| `PixelIcon` | 16px source → display at 16/32 only; 1-color + 2-tone selected | Controls |
| `ViewfinderBug` | Hybrid C mark A | Favicon, ext icons, popup header, footer monogram |
| `ApertureLockup` | Hybrid C mark B | Website masthead **only** |
| `TextureWash` | Grid/noise ≤8% contrast behind empty/loading | Empty states |

Do **not** invent alternate names for the same things.

---

## 3) Token deltas vs soft densify (`brain-pixel-ui-wrap`)

Palette IDs stay DigiLocker-inspired **tokens only** (same hex family). Deltas are geometry / type / chrome density.

| Token / rule | Soft densify (wrap) | HUD-002 (target) |
|--------------|---------------------|------------------|
| `--ink` `#101827` | keep | keep |
| `--navy` `#162b46` | keep | keep |
| `--paper` `#f3ead8` | keep | keep |
| `--mist` `#c7d5d2` | keep | keep |
| `--saffron` `#d88732` | attention only | attention + focus ticks + Active press; never ambient fill |
| `--trust` `#5c8b63` | verified | verified only; rectangular badges |
| `--radius` | 0–2px | **0** on HUD chrome; max **2px** on nested media only |
| `--shadow` | 3px hard offset | **2px** hard offset (`2px 2px 0`); no blur |
| Keyline | 2px + corner ticks | **2px outer** + optional **1px inner** (4px inset = fill); nine-slice corners mandatory on `HudFrame` |
| Nine-slice unit | implied ticks | **8px** corner tiles; edges stretch; center fill |
| Fill inset | ad hoc | **4px** from outer keyline to content |
| Grid base | 8px | **8px** mandatory; **4px** micro only (label↔value) |
| Body font | system sans | keep readable sans |
| Telemetry font | ui-monospace | mono **or** bitmap accent; tracking for uppercase HUD labels |
| Icons | 16px silhouettes | 16px art; **32px** hit/display where popup/app afford space; integer scale only |
| Image scaling | unspecified | `image-rendering: pixelated` (nearest-neighbor) on pixel assets |
| Coordinates | mixed | whole CSS px; no fractional transform origins on HUD chrome |
| Trust chip | rectangular in wrap note; some pills remain in CSS | **pills forbidden**; `border-radius: 0` |
| Texture | ~7–8% grid | ≤**8%**; never under body copy |

No new semantic colors. No neon accents outside saffron/trust rules.

---

## 4) Panel layouts

### 4.1 Extension popup (360–420px wide)

```
┌─ HudFrame ─────────────────────────────────────┐
│ [ViewfinderBug 32] DHRISTI          TrustBadge │  ← HudTitleBar (paper or navy)
├─ StatusLane (GridPanel 1 col) ─────────────────┤
│  PATH · FAST|SCORE|REASON   · LAST · HH:MM:SS  │  ← MetaLane strip (mono)
├─ GridPanel (scan / evidence) ──────────────────┤
│  HudTitleBar: SCAN                             │
│  ┌ MetricCell ┬ MetricCell ┬ MetricCell ┐      │
│  │ label      │ label      │ label      │      │
│  │ VALUE      │ VALUE      │ VALUE      │      │
│  └────────────┴────────────┴────────────┘      │
│  SegmentMeter (risk/heuristic — honest copy)   │
├─ CommandLane ──────────────────────────────────┤
│  [PRIMARY CTA — saffron]   [secondary]         │
│  CursorTick on focused control                 │
├─ MetaLane ─────────────────────────────────────┤
│  ORIGIN · SCOPE · REV · “inspired-by only”     │
└────────────────────────────────────────────────┘
```

Rules:

- Fixed header; one primary action.
- `activeTab` / human-gated capture stays visible as permission truth — do not chrome over it.
- If `officialScore` is null, MetricCell shows honest null/—; never invent a pass.
- Fast path label must not read as G11 pass.

### 4.2 Website hero (+ masthead)

```
[ApertureLockup] ……………… nav (CommandLane text) … TrustBadge
────────────────────────────────────────────────────
┌ HudFrame hero ──────────────────────────────────┐
│ GridPanel:  copy col (sans)  |  evidence col     │
│              H1 + 1 sentence |  HudFrame demo    │
│              CommandLane     |  MetricCells      │
│                              |  SegmentMeter     │
└──────────────────────────────────────────────────┘
```

- Masthead = lockup only (Hybrid C). Favicon = bug.
- Hero evidence module uses same `HudFrame` / `HudTitleBar` language as popup (shared tokens).
- DigiLocker mention in copy stays “inspired-by / UX rhythm” — **no** locker iconography in chrome.

### 4.3 Prototype/app evidence / workspace

```
HudTitleBar SYS · LOCAL WORKSPACE · PATH tags
┌ StatusLane ┐┌──────── GridPanel workspace ────────┐┌ MetaLane ┐
│ path chips ││ HudFrame panels: SCAN / PATH / SCORE ││ timestamps│
│ trust      ││ / REASON — navy headers, MetricCells ││ revision  │
└────────────┘└──────────────────────────────────────┘└───────────┘
CommandLane toolbar under intro (same button states)
```

Align Prototype tokens to Website/extension HUD-002 table (wrap densify already started this; finish radius=0, kill remaining pills, nine-slice on major panels).

---

## 5) Button states (N/F/H/A/D)

All `CommandLane` controls:

| State | Visual |
|-------|--------|
| **N** Normal | Paper or saffron fill; 2px ink keyline; 0 radius |
| **F** Focus | 2px saffron outline, offset 2px; optional `CursorTick` |
| **H** Hover | Inset highlight 1px mist **or** saffron edge brighten; no glow |
| **A** Active/pressed | Translate content `+2px +2px`; drop hard shadow (pressed into ground) |
| **D** Disabled | Mist fill; muted ink; no shadow; `cursor: not-allowed` |

Primary = saffron fill + navy/ink text. Secondary = paper fill + ink keyline.

---

## 6) Motion rules

- Discrete **1–2 frame** (≈80–120ms stepped) state swaps only.
- SegmentMeter fills **segment-by-segment**, never continuous width animation.
- No glow loops, gradient morphs, blur fades, or parallax.
- Focus appearance is instant outline (a11y).
- Panel open/close: hard cut or single stepped wipe; no spring.

---

## 7) Icon & asset rules

- Source grid **16×16**; display **16** or **32** only (×1 / ×2 integer).
- Silhouette / 1-color; selected = 2-tone (navy + saffron or paper + saffron).
- Pixel PNGs/SVGs: nearest-neighbor; snap to whole pixels.
- HUD corner / nine-slice tiles live as reusable assets (8px corners); do not freestyle per panel.

---

## 8) Do / Don’t

### Do

- Reuse vocabulary above across Website, popup, Prototype/app.
- Keep DigiLocker influence to **palette + calm panel rhythm**.
- Show null scores and G11-fail honestly in telemetry chrome.
- Prefer modular panels over decorative illustration.
- Keep body text highly readable (sans); bitmap/mono for HUD chrome only.

### Don’t

- Don’t claim DigiLocker partnership, API, or custody via chrome or icons.
- Don’t label Fast path as G11 / “<200ms full-flow” success.
- Don’t invent metrics, seals, MeitY marks, or ISRO portal fiction.
- Don’t use pill radii, soft shadows, glassmorphism, or neon ambient saffron.
- Don’t full-frame mask aesthetics as default “privacy” decoration.
- Don’t scale icons to non-integer sizes or use fractional HUD coordinates.
- Don’t put ApertureLockup in the extension popup header.
- Don’t expand product scope (new flows, gates, submission_ready).

---

## 9) Implementation handoff (Worker)

Apply in order:

1. Shared token block (three CSS surfaces) matching §3.
2. `HudFrame` nine-slice + `HudTitleBar` on popup scan/evidence, website hero evidence, app panels.
3. Kill remaining `border-radius: 999px` trust/status pills → `TrustBadge`.
4. Wire N/F/H/A/D on primary/secondary buttons.
5. SegmentMeter + MetricCell mono telemetry; honest nulls.
6. Verify Hybrid C placement (§ Hybrid C decision).
7. Visual QA at 1× and 2×; no subpixel blur on pixel assets.

**Out of scope for Worker from this brief:** new features, claim-ledger edits, purchases, Google/Pinterest login, production backend changes.

---

## 10) Refs (R-PIXEL-HUD-001)

- FFT menus as static grids — https://champicky.com/2019/10/10/final-fantasy-tactics-interface-design-analysis/
- DQIII GridPanel — https://ue5exp0.com/ui_gridpanel/
- Lospec 9-slice — https://lospec.com/pixel-art-tutorials/user-interface-9-slice-by-pedro-medeiros
- RPG Maker window skins — https://rpgmaker.net/articles/2751/
- Pixel button states — https://indieklem.substack.com/p/8-better-designed-buttons
- HUD corners / 9-slice panels — https://generalistprogrammer.com/tutorials/game-ui-design-best-practices
- Icons 32px / integer scale / silhouette — https://icora.io/blog/how-to-make-game-icons

---

**End ARCH-PIXEL-HUD-002**

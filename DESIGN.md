# SIH 2026 — Design baseline

Status: original design direction for an evidence-led preparation site. SIH2171 has not yet been verified; no domain-specific product, impact, award or readiness claim may be introduced by visual design.

## Visual theme and atmosphere

Use an editorial engineering journal: confident scale, disciplined spacing, annotated diagrams and visible evidence. The first screen explains what exists and what still needs verification. Design a judge's path from problem → evidence → solution → demonstration → feasibility once those artifacts exist. Until then, label the page as a preparation workspace.

The requested Lando Norris reference informs bold typographic hierarchy, limited color, chapter rhythm and visible personality. This is an original identity: no copied logos, signatures, portraits, proprietary fonts, racing assets or trade dress. The primary reference and interpretation are documented in `Docs/design-baseline.md`.

## Color palette and roles

| Token | Value | Role |
|---|---|---|
| ink | `#15211F` | Primary text and dark sections |
| paper | `#F3F1E7` | Main reading canvas |
| surface | `#FFFFFF` | Forms and evidence surfaces |
| signal | `#D8F36A` | Primary action background; use ink text |
| forest | `#29473F` | Links, borders on light surfaces, diagrams |
| muted | `#52645C` | Secondary text on paper |
| caution | `#70420B` | Unverified or pending text on paper |
| error | `#9F271D` | Error text on light surfaces |

Do not use lime as small text on white or paper. Status must include a word or icon, never color alone. Test rendered contrast after opacity, overlays and focus styling are applied.

## Typography

Use Geist if already installed and locally licensed, otherwise `Arial, Helvetica, sans-serif`. Use `ui-monospace, SFMono-Regular, Consolas, monospace` for source IDs and technical labels. Avoid adding a font request solely for visual polish.

| Role | Desktop | Mobile | Leading |
|---|---|---|---|
| Hero | `clamp(3rem, 7vw, 7.5rem)` | 2.7–3.4rem, fit actual copy | 0.98–1.08 |
| Section title | `clamp(2rem, 4vw, 4rem)` | 2rem | 1.1 |
| Body | 1.0625rem | 1rem | 1.6 |
| Label/source | 0.8125rem minimum | 0.8125rem minimum | 1.45 |

Headings should use meaningful sentence case. Short display phrases may use uppercase. Hero stays within three lines at 390px through shorter copy and responsive type, not clipped text. Limit reading columns to 65–75 characters; allow headings to span 1100px. Avoid faux precision, decorative counters and unverifiable statistics.

## Components and states

- Minimal split navigation with real anchors, a visible skip link on focus, and one primary action. Mobile navigation must be usable without a hover state.
- Use chapter bands, ruled lists, wide diagrams and an asymmetric hero; avoid a wall of identical cards.
- Buttons: minimum 44px practical target, 2px visible focus outline with offset, clear disabled state, descriptive text. Use links for navigation and buttons for actions.
- Forms: persistent labels; explain validation errors adjacent to fields; preserve entered values; announce errors and success. Never display a submission success state unless the operation succeeded.
- Architecture: keyboard-operable buttons or native `details` reveal explanatory panels. Include a static textual equivalent. Label any unimplemented box as proposed.
- Team: names supplied by Francis, with explicitly proposed responsibilities. Use initials until consented real portraits are supplied; do not generate substitute people or scrape personal photographs.
- Evidence states: `Verified`, `Proposed`, `Unverified`, `Not built` and `Measured` must reflect source/test records. Cosmetic progress meters cannot imply implementation.

## Layout and responsive behavior

Maximum content width 1400px. Use 24–64px horizontal gutters on wide screens and 20px on mobile. Major chapter spacing: 96–160px desktop, 64–80px mobile. Space scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px.

Use a 12-column desktop grid with purposeful spans; collapse to normal reading order below 760px. Preserve DOM order across layouts. Do not use dense grid placement if it makes keyboard order disagree with visual order. Prototype workflows should be tighter than the marketing page.

Check 390px and 1440px viewports, plus 320px reflow. No page-level horizontal overflow, hidden content, fixed-height clipped copy or overlapping controls. A wide data table may have a labeled local scroll region.

## Depth and elevation

Favor color separation and 1px rules. Use 8–16px corner radii on practical controls/surfaces; reserve pill shapes for compact actions. Shadows are for overlays only. Decorative grain and gradients must not impair contrast or add significant image weight.

## Motion and interaction

One restrained entrance or hover language is enough: 120–220ms opacity/transform transitions. Interaction must remain immediate. No scroll hijacking, loading spectacle, cursor replacement or essential text revealed only by animation.

Honor `prefers-reduced-motion: reduce`: remove entrance travel, auto-scroll, parallax, smooth-scroll and looping effects. Essential content is visible before JavaScript. Any video has controls, poster, captions or transcript and no autoplay audio. Accessibility and the user's performance budgets take precedence over the Taste skill's suggested heavy GSAP effects.

## Do and do not

Do give every section a concrete job, every claim a source or assumption label, every control a meaningful result, and every proposed feature an honest status. Do make a failed API request understandable and recoverable.

Do not invent endorsements, institutions' approval, measurements, deployments, working prototypes, human feedback, novelty, SIH eligibility or a win probability. Do not add stock footage, random photographs or partner marquees to fill missing evidence.

## Implementation acceptance

The site passes design review only after live checks of mobile/desktop layout, keyboard path, focus visibility, contrast, reduced motion, link behavior, form behavior and state honesty. A screenshot is evidence for appearance only. Lighthouse does not establish WCAG conformance.

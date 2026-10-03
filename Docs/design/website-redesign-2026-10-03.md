# Website redesign, 3 October 2026

## Brief and structure

Francis requested a website redesign, with edits delivered through PRs and no direct edits to master. This branch changes the static public website, its design documentation and local checkpoints. It does not change the extension, Warden, pairing, release ledger or deployment workflow.

The existing student-project brief and established light palette guide the redesign. The goal is to explain the prototype and invite visitors to watch the recorded demo. The target feeling is calm curiosity, with explicit limitations rather than an assurance that every detail is protected.

The page follows this sequence:

1. An oversized headline and labelled synthetic browser illustration establish the idea. One filled CTA leads to the demo; the secondary link explains the approach.
2. Four steps describe local processing, token replacement, planning and action checks.
3. The existing recorded demo supplies scoped visual evidence. Its caption distinguishes the legacy Prototype recording from the current root extension.
4. The boundary diagram describes local processing and the smaller planner context, including permitted free text and values a user keeps. Detection is explicitly fallible.
5. Credited NASA photography introduces the independent RV University project and SIH26171 context.
6. The existing team names and roles are retained, followed by a demo/source invitation.

No metrics, participants, portraits, government affiliations or deployments are invented. The hero is an illustration, not an actual scan or a privacy benchmark.

## Visual decisions

Anton provides the condensed display hierarchy; self-hosted Geist supplies readable body text and controls. Large headings, asymmetric desktop columns and ample spacing establish an editorial rhythm. The four-step and team sections use thin separators rather than repeated cards.

Warm paper `#f3f4f1` complements cobalt `#1f36d6`. White, pale cobalt tints and neutral text form the rest of the palette. Cobalt marks the primary action, emphasis and keyboard focus. The existing Hybrid C light logo retains its established analogous cobalt/teal geometry. All UI grounds remain light; the small saturated primary button carries its own white label. Existing video and photography retain their source colours as media.

The browser schematic uses HTML/CSS and synthetic values. Its button toggles static sample details and tokens without network calls. Decorative icons use inline SVG so their rendering does not depend on system glyph coverage. The native mobile menu, ordinary links and native video controls work without JavaScript. Reduced motion disables smooth scrolling and hover movement.

## Local verification

Verified against the locally served Website directory using system Chromium and Playwright. Axe-core 4.13.0 checked WCAG 2 A/AA and WCAG 2.1 AA rules at 320, 375, 768, 1024 and 1440 CSS pixels: zero violations at each width. All five layouts had no horizontal overflow. These are automated checks, not a WCAG certification or extension G09/G10 evidence.

Interaction checks passed: sample details/token round trip by mouse and keyboard, skip-link focus transfer, reduced-motion scroll behaviour, keyboard opening of the mobile menu, anchor selection closing that menu, video playback and a no-JavaScript content/menu fallback. The video duration is 24.48 seconds, rounded to 25 seconds in copy. No page errors or HTTP error responses were observed. All local asset references and internal anchors resolve. Lazy-loaded photography was scrolled into view before capturing the full-page previews.

Lighthouse 12.8.2, default mobile emulation, local HTTP server, 3 October 2026: performance **99**, accessibility **100**, best practices **100**, SEO **100**. This single local run is specific to this website revision; it is not a public deployment measurement and does not supersede historical reports. The raw local report is `/tmp/dhristi-redesign-lighthouse.json` in the execution environment. Static hosting must separately configure compression, caching and security headers.

Additional checks passed: `node --check Website/app.js`, `node scripts/check-signal-tokens.mjs`, `node scripts/check-no-em-dash.mjs` and `git diff --check`. The existing runtime suites were not rerun because no runtime code changed. G11 remains failed, G20 remains unknown and `submission_ready` remains false.

Serve for review: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1` from the repository root.

## Previews

[Desktop full page](previews/website-redesign-desktop.png) · [Mobile full page](previews/website-redesign-mobile.png)

## Publication boundary

This work is delivered on a topic branch for PR review. No merge or deployment was performed. GitHub's branch API still reports master unprotected; the prior protection write was denied with HTTP 403 by the integration. PR-only editing is being followed, but it is not remotely enforced until an administrator enables branch protection.

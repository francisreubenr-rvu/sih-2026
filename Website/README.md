# Preparation website

Static, local-first preparation dossier. **Not a live SIH2171 domain solution.** All team roles are proposed; photographs, contact destination, domain prototype and problem-specific claims are pending.

Run from the repository root: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1`. Open `http://127.0.0.1:4173`.

Deploy: upload this directory as a static site to an approved HTTPS host. No build step or environment secrets. Configure `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a CSP permitting only same-origin script/style/assets. Do not claim deployment until public links, downloads and interactions are verified. Public deployment verified at https://francisreubenr-rvu.github.io/sih-2026/; see Docs/deployment-verification.md in the repository.

No personal data collection, cookies, trackers or external font requests. Original abstract SVG and monograms; no borrowed portraits. GSAP / ScrollTrigger vendor files remain under `Website/assets/` but are **not loaded or used** by the current site (`index.html` / `app.js`); do not claim GSAP-powered motion. Core content and native evidence disclosures work without JavaScript. Architecture panels and milestone navigation use small local JavaScript; CSS reveal animations respect reduced motion.

Tests and limitations are recorded in Docs/verification.md. Lighthouse targets are >90 in performance, accessibility, best practices and SEO; a high automated score does not certify WCAG conformance.

## GitHub Pages

The repository workflow publishes this directory directly, preserving relative asset/download paths under the project URL. Deployments run on changes to Website on master, or manual workflow dispatch. No repository-wide documentation or Raw files are included in the Pages artifact.

## Brand assets (Hybrid C)

- Favicon and header mark: `assets/dhristi-mark-signal.svg` (Hybrid C viewfinder geometry, Signal colours; see `DESIGN.md`).
- Earlier Hybrid C files (`assets/dhristi-mark.svg`, `assets/dhristi-lockup.svg`) are kept but no longer used by the page.
- Hero lens: `assets/perception.js`, a procedural canvas drawing (no image asset).
- Mono / inverted bugs: `dhristi-mark-mono.svg`, `dhristi-mark-inverted.svg`.
- Hard don’ts: no DigiLocker / MeitY / partner marks in logo chrome. See `Docs/decisions/brain-logo-hybrid-c.md`.

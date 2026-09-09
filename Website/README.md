# Preparation website

Static, local-first preparation dossier. **Not a live SIH2171 domain solution.** All team roles are proposed; photographs, contact destination, domain prototype and problem-specific claims are pending.

Run from the repository root: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1`. Open `http://127.0.0.1:4173`.

Deploy: upload this directory as a static site to an approved HTTPS host. No build step or environment secrets. Configure `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a CSP permitting only same-origin script/style/assets. Do not claim deployment until public links, downloads and interactions are verified. A public destination has not been provisioned.

No personal data collection, cookies, trackers or external font requests. Original abstract SVG and monograms; no borrowed portraits. Local GSAP 3.13.0 and ScrollTrigger supplied via jsDelivr; upstream distribution retains license notices. See https://gsap.com/standard-license/ before redistribution. Core content and native evidence disclosures work without JavaScript. Architecture panels and milestone navigation use small local JavaScript; animations respect reduced motion.

Tests and limitations are recorded in Docs/verification.md. Lighthouse targets are >90 in performance, accessibility, best practices and SEO; a high automated score does not certify WCAG conformance.

## GitHub Pages

The repository workflow publishes this directory directly, preserving relative asset/download paths under the project URL. Deployments run on changes to Website on master, or manual workflow dispatch. No repository-wide documentation or Raw files are included in the Pages artifact.

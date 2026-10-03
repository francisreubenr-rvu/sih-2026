# Dhristi landing page

Static public landing page for Dhristi, the SIH26171 candidate (ISRO, on-device visual perception for light-weight browser agents). It carries key information only: what Dhristi is, the problem, how it works, the demo, the privacy boundary, the SIH26171 context and the team. Engineering evidence (waves, gates, benchmarks) stays in the repository. Dhristi is a student prototype, not a finished SIH solution, and team roles are proposed.

Run from the repository root: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1`. Open `http://127.0.0.1:4173`.

Deploy: upload this directory as a static site to an approved HTTPS host. No build step or environment secrets. Configure `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a CSP permitting only same-origin script/style/assets. Do not claim deployment until public links, downloads and interactions are verified. Public deployment verified at https://francisreubenr-rvu.github.io/sih-2026/; see Docs/deployment-verification.md in the repository.

No personal data collection, cookies, trackers or external font requests. The page is one `index.html` and one `style.css` and loads no JavaScript at all; every part of it works without scripts. GSAP / ScrollTrigger vendor files and older media remain under `Website/assets/` because historical records cite them, but the page does not load them; do not claim scripted or GSAP-powered motion. The only motion is short CSS colour transitions on links and buttons and smooth in-page scrolling, both removed under `prefers-reduced-motion`; the demo video plays only when asked.

Tests and limitations are recorded in Docs/verification.md. Lighthouse targets are >90 in performance, accessibility, best practices and SEO; a high automated score does not certify WCAG conformance.

## GitHub Pages

The repository workflow publishes this directory directly, preserving relative asset/download paths under the project URL. Deployments run on changes to Website on master, or manual workflow dispatch. No repository-wide documentation or Raw files are included in the Pages artifact.

## Brand assets (Hybrid C)

- Favicon and header mark: `assets/dhristi-mark.svg` (Hybrid C viewfinder bug). `assets/dhristi-lockup.svg` is kept but not used by the landing page.

## Landing page media

- `assets/video/dhristi-prototype-demo.mp4` (+ poster): 25 s recorded from the local Prototype with synthetic data. Caption bar and cursor are annotation overlays.
- `assets/img/still-original.webp`, `still-protected.webp`: stills from the same run.
- `assets/img/himalayas-iss074e0002581.jpg`, `india-srilanka-iss071e700080.jpg`: NASA ISS photographs, public domain, credited on the page.
- Fonts: Anton, Open Sans, Glacial Indifference (SIL OFL, `assets/fonts/OFL.txt`).
- Older videos and images in `assets/` are kept because historical records cite them; the landing page does not use them.
- Mono / inverted bugs: `dhristi-mark-mono.svg`, `dhristi-mark-inverted.svg`.
- Hard don’ts: no DigiLocker / MeitY / partner marks in logo chrome. See `Docs/decisions/brain-logo-hybrid-c.md`.

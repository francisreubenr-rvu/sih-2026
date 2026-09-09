# Sightline candidate deployment — verified 9 September 2026

- Public URL: https://francisreubenr-rvu.github.io/sih-2026/
- Deployed source: `69188d797820519ce2e82361661dfe0b3c07714d` on `master`.
- Successful workflow: https://github.com/francisreubenr-rvu/sih-2026/actions/runs/34379912074
- Seven public resources returned HTTP 200 and matched local SHA-256: HTML, CSS, JavaScript, local font, prototype screenshot, evidence JSON and extension ZIP. Exact hashes: `Benchmarks/results/pages-sightline-v01.json`.
- Live browser: verified Sightline title/hero, Protect architecture panel, local setup dialog and close action. The public page is marked as the deliverable in the in-app browser.
- Six local Lighthouse runs of this Website scored 100 in performance, accessibility, best practices and SEO. These remain local measurements; they do not certify WCAG conformance or backend performance.

GitHub Pages serves the static site and downloads. The real Node/Ollama prototype requires local setup; no hosted model backend is claimed. This is a published engineering candidate, with the failed latency target and remaining validation gates exposed in the evidence ledger.

---

## Historical preparation deployment


Verified 9 September 2026.

- Live website: https://francisreubenr-rvu.github.io/sih-2026/
- Public repository: https://github.com/francisreubenr-rvu/sih-2026
- Source branch: master; published directory: Website.
- Workflow: .github/workflows/pages.yml; automatic deployment on website changes and manual dispatch.
- Initial successful deployment: https://github.com/francisreubenr-rvu/sih-2026/actions/runs/34297069729
- Initially deployed source commit: 2b17c5752dd8eee85bd2c5d8cd75d975df3fa505.

The HTML, CSS, application script, both GSAP libraries, icon, preparation PDF and guardrails download returned HTTPS 200 and matched local bytes. Results: Benchmarks/results/pages-http-checks.json.

Live browser verification: correct preparation-page identity; persistence architecture button opened the matching panel; next milestone changed the displayed content; copy-link action reported success on the public origin. The rendered page was visually inspected and the observed console contained no warnings/errors.

The Pages deployment publishes the static preparation website. It does not supply a domain API, database or a completed SIH2171 prototype. Historical local Lighthouse reports remain local measurements; no production Lighthouse score or full WCAG conformance is asserted. The downloadable brief and ZIP are historical preparation snapshots and retain their original local-preview wording.

To preview locally: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1` from the repository root.

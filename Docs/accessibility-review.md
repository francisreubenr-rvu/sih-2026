# Accessibility review — preparation website

Target: WCAG 2.1 AA. Status: partial evaluation, conformance unknown. Source: https://www.w3.org/TR/WCAG21/ .

Implemented: lang=en, semantic header/navigation/main/footer, one h1, meaningful headings, skip link, visible focus outlines, native links/buttons/details, manual carousel controls, aria-pressed architecture selection, polite result announcement, text status labels, original SVG description, photo-pending monograms, local assets, no autoplay and reduced-motion behavior.

Verified: Lighthouse final accessibility scores 100 across six runs, no failing binary audits; keyboard Enter activates architecture and evidence disclosures; 320/390/1440px document reflow; desktop reduced-motion media disables pinning and smooth scroll. A visible-label mismatch was found and corrected. Evidence: Docs/verification.md and Benchmarks/results/lighthouse/.

Pending: complete keyboard traversal/focus order, screen-reader announcements in a real assistive technology, 200% text zoom, text-spacing override, criterion-level conformance, external PDF accessibility and non-author accessibility testing. PDF exports are visually reviewed but are not claimed tagged/accessible. Domain workflows cannot be evaluated until implemented.

Lighthouse is an automated subset. Do not mark G09 pass based on these measurements.

## Wave 5 axe probe (14 September 2026)

Automated axe-core CDN inject recorded in `Benchmarks/results/accessibility.json` for Website file URL and local prototype pages when the server is up. Lighthouse accessibility 100 remains historical automated evidence only.

**G09 remains unknown:** criterion-level WCAG 2.1 A/AA documentation, real assistive-technology review, 200% zoom and text-spacing checks are still incomplete. Axe/Lighthouse alone must not flip G09 to pass.

## Wave 6 axe + popup + zoom notes (14 September 2026)

- axe-core on Website, extension popup HTML, and local prototype pages when server is up (`Benchmarks/results/accessibility.json`).
- CSS `zoom: 200%` approximation recorded for Website + popup (`browser-review.json`); **not** identical to browser text-only 200% zoom.
- Clear serious/critical axe failures should be fixed in the same wave when found.

**G09/G10 remain unknown** until criterion-level WCAG documentation, real AT review, and native 200% zoom / motion-safety are complete.

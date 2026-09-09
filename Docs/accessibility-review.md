# Accessibility review — preparation website

Target: WCAG 2.1 AA. Status: partial evaluation, conformance unknown. Source: https://www.w3.org/TR/WCAG21/ .

Implemented: lang=en, semantic header/navigation/main/footer, one h1, meaningful headings, skip link, visible focus outlines, native links/buttons/details, manual carousel controls, aria-pressed architecture selection, polite result announcement, text status labels, original SVG description, photo-pending monograms, local assets, no autoplay and reduced-motion behavior.

Verified: Lighthouse final accessibility scores 100 across six runs, no failing binary audits; keyboard Enter activates architecture and evidence disclosures; 320/390/1440px document reflow; desktop reduced-motion media disables pinning and smooth scroll. A visible-label mismatch was found and corrected. Evidence: Docs/verification.md and Benchmarks/results/lighthouse/.

Pending: complete keyboard traversal/focus order, screen-reader announcements in a real assistive technology, 200% text zoom, text-spacing override, criterion-level conformance, external PDF accessibility and non-author accessibility testing. PDF exports are visually reviewed but are not claimed tagged/accessible. Domain workflows cannot be evaluated until implemented.

Lighthouse is an automated subset. Do not mark G09 pass based on these measurements.

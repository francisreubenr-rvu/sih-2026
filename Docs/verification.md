# Verification record

Scope: preparation artifacts and static website; 9 September 2026. **No domain prototype exists and no complete SIH2171 entry is accepted.**

## Website measurement

Test URL: http://127.0.0.1:4173 . Static Python HTTP server on loopback. Lighthouse 12.8.2 launched Chrome in clean temporary profiles. Three mobile runs and three desktop runs; source fingerprint, Chrome user agent, environment and raw reports are preserved in Benchmarks/results/lighthouse-summary.json and Benchmarks/results/lighthouse/.

| Profile | Performance runs | Accessibility runs | Best practices runs | SEO runs |
|---|---|---|---|---|
| Mobile | 100, 100, 99 | 100, 100, 100 | 100, 100, 100 | 100, 100, 100 |
| Desktop | 100, 100, 100 | 100, 100, 100 | 100, 100, 100 | 100, 100, 100 |

Every category median is 100, exceeding the strict >90 target. Final reports have no failing binary audits, including the experimental label-content-name check. Earlier iteration reports are preserved under Benchmarks/results/iteration-1/. These are local measurements, not production-network, domain-core-flow or availability results.

## Browser checks performed

- Inspected the rendered page and DOM at 1440px desktop, 390px mobile and 320px narrow reflow. Document scroll width equalled viewport width at every measured size. Decorative SVG art is intentionally cropped inside its own container; essential content is not cropped by that effect.
- Visually inspected desktop and 390px hero screenshots. The hero title occupied two lines on mobile and the pending identity status was visible in the first screen.
- Clicked the domain-service architecture button and verified the matching detail heading. Activated persistence with Enter and verified Durable records. These are proposed architecture explanations, not backend functionality.
- Advanced and reversed the milestone carousel and verified both corresponding headings. It does not auto-advance.
- Activated local share and verified the explicit local-preview explanation instead of claiming a public link was copied.
- Activated the evidence disclosure with Enter and verified previously hidden explanation became visible.
- Emulated reduced motion at 1440px: media query true, scroll behavior auto, zero GSAP pin wrappers. Reset emulation and temporary viewport after checks.
- Browser console review returned no warning/error entries for the observed page session.
- Saved desktop and mobile full-page captures as Docs/website-desktop.jpg and Docs/website-mobile.jpg. Both captures were taken with reduced motion enabled for stable static evidence.

No complete screen-reader, 200% text zoom, text-spacing, independent human usability or criterion-by-criterion WCAG audit was performed. These remain unknown. An automated score of 100 does not certify WCAG compliance.

## Corrections and retests

1. Readiness status initially appeared below the artwork. Added SIH2171 identity pending / prototype not built text inside the hero; visually verified at mobile size.
2. The navigation wordmark's accessible name did not contain its visible RV/SIH label. Updated it to RV/SIH preparation home. All six final Lighthouse reports show the mismatch resolved.
3. Expanded slides 1 and 15 had two-line title text encroaching on the subtitle. Updated the generator's multiline title height and subtitle position, rebuilt and re-exported. Inspected the corrected title render. The final render archive supersedes initial contact sheets.
4. Team monograms gained image roles with clear photo-pending accessible labels. No generated or third-party person images were used.

## Presentation and document checks

The source template was inspected through PPTX XML and python-pptx. It has six content slides plus one instruction slide. The output submission blueprint has six slides; the expanded blueprint has 15 slides with editable shapes, explicit NOT SUBMISSION READY labels and speaker notes. The six-slide file preserves the supplied design and required heading families; inherited template graphics still identify 2025. No claim of verified 2026 template acceptance is made.

Both decks were exported through LibreOffice to PDF and rendered to images for review. Slide count and notice presence are programmatically checked. Template inherited shape geometry includes original out-of-slide text frames; no assertion that the original template itself meets a modern design system is made. The expanded deck generator checks slide shape bounds.

The expanded deck's 700-second duration is a planned allocation, not a measured rehearsal. Screen-capture slots remain visibly empty because the domain prototype is not built. The process PDF and preparation brief are documentation artifacts, not independent validation evidence.

## Structural validation

50 artifact checks passed: JSON parsing, deck slide counts, visible draft labels, speaker-note presence, PDF signatures, website local resource/anchor existence and HTTP 200 responses for the page, scripts, styles and both downloads. Website JavaScript syntax passed Node checking. Final speaker-note allocations were reconciled to exactly 700 seconds; this remains planned timing, not a rehearsal.

## Not tested / not delivered

Domain API, persistence, correctness, latency under 200ms, load/scalability, provider integrations, security of a full-stack solution, production HTTPS hosting, screen recording fallback, domain literature/comparison, pilot impact, and independent human evaluation. A build-contract README does not count as a tested prototype. Benchmark saturation is not achieved.

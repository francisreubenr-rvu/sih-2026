# Wave 7 — a11y depth + load soak + latency opts (14 September 2026)

## Decisions
- Axe alone still cannot flip G09/G10. Wave7 adds keyboard Tab sampling, WCAG 1.4.12 text-spacing override, EN/HI lang switch evidence, and 320/390/1440 reflow notes while keeping statuses **unknown**.
- Extension popup `chrome.runtime.getURL` must be guarded so EN/HI listeners register in HTTP preview harnesses (and fail soft outside extension context). Production extension path unchanged when `runtime` exists.
- Website gains DigiLocker-credible EN/HI toggle for trust chip; `document.documentElement.lang` updates on switch.
- G05: run a real 5-minute local soak with 20 concurrent health workers, ≥1000 durable audit rows within rate limits (injectable clock), and `process.memoryUsage()` heap snapshots. Pass only if acceptance is met with evidence.
- G11: `mergeOverlappingRegions` + stride-4 subsample for large mosaic blocks are honest local preview optimizations. Planner-inclusive full-flow remains **fail**; budget not weakened.
- Do not mark G14/G20/G03 toolbar glyph as pass.

## Evidence
- `Benchmarks/results/accessibility.json`, `browser-review.json`, `load.json`, `core-latency.json`, `security.json`

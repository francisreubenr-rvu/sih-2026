# Wave 6 — hardening, a11y, latency, fixtures (14 September 2026)

## Decisions
- Treat public HTTPS as GitHub Pages; Node remains loopback-default with HTTPS origin gate for non-loopback binds.
- G08 pass requires proven controls in `hardening.json` plus clean scans — not a claim of multi-tenant production TLS reverse-proxy verification.
- Axe alone cannot flip G09/G10; force `.reveal-ready` visible before contrast checks to avoid opacity:0 false failures.
- Mosaic subsample (stride 2 on large blocks) is a local preview optimization only; egress unchanged.
- GSTIN/UPI patterns are telemetry for local mosaic hints; they never authorize export.
- Do not invent WebPII numbers; external 58/100 text retention failure remains local-only.
- G14/G20 templates only — no fabricated participants or rehearsals.

## Evidence
- `Benchmarks/results/hardening.json`, `security.json`, `accessibility.json`, `core-latency.json`, `load.json`, `wave6-pii-redaction-utility-v01.json`

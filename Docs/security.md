# Security boundary

The delivered component is a static preparation website. It collects no submitted data, has no authentication/session store, contains no API key, and uses locally served assets. The preview binds to 127.0.0.1. No email or social messages were sent. No private social channels were accessed.

The eventual domain service must receive a separate threat model after the real problem is verified. Minimum tests: input type/length/range validation; request body bounds; parameterised SQL; encoded output; unauthenticated and cross-user record access; appropriate origin and CSRF controls; duplicate-write behavior; rate limiting; safe error bodies and logs; durable-data restore; dependency and secret scan. Data classification and retention must match the actual domain.

These are requirements, not passing test results. The static site cannot validate backend security. Public HTTPS deployment and response headers are not verified. See Docs/deployment-verification.md.

## Wave 3 prototype boundary (14 September 2026)

The domain prototype (not only the static website) keeps raw screenshots and pairing tokens out of Git and out of API payloads. `assertSanitizedPayload` / capture-loop helpers fail closed on screenshot/pixel/URL fields. Wave 3 evidence: `Benchmarks/results/security.json` (secret scan + audit citation) and `Benchmarks/results/extension-loop-v01.json` (sanitized egress). Public Pages remains static-only.


## Wave 5 deployment controls note (14 September 2026)

Public GitHub Pages remains **static HTTPS** only (no Node). Local prototype deployment checklist:

| Control | Status |
|---------|--------|
| Secret scan (`scripts/wave3-security-scan.mjs`) | Re-run each wave; 0 high expected |
| npm audit `--omit=dev` | Recorded in `dependency-audit.json` |
| Semantics-only egress | `assertSanitizedPayload` + Zod scene |
| Pairing token | gitignored, mode 0600 |
| Bounded body / rate limits | Unit-tested on `/api/v1/plans` |
| Production TLS reverse proxy for Node | **Not completed** on this box |
| CSRF for cookie auth | N/A (token header / pairing; no cookie session) |
| Multi-tenant auth | Out of scope |

G08 stays **unknown** until production Node hardening is verified. Do not treat Pages HTTPS as prototype API hardening.

## Wave 6 Node/API hardening (14 September 2026)

Evidence harness: `scripts/wave6-hardening-evidence.mjs` → `Benchmarks/results/hardening.json`.

| Control | Proof |
|---------|--------|
| Security headers | `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, CORP/COOP, CSP `frame-ancestors` |
| Origin allowlist | Untrusted `Origin` → 403 `origin_denied` |
| Bearer auth | Missing token → 401 |
| Body size | >256 KiB → 413 `too_large` |
| Rate limit | 21st POST/min → 429 + `Retry-After: 60` |
| Error hygiene | Fixed message catalog; no stack / provider endpoint leakage |
| Screenshot field | Extra `screenshot` → 422 before provider |
| Public HTTPS | GitHub Pages static site; Node loopback default; non-loopback requires `HTTPS` `PUBLIC_ORIGIN` + `SIGHTLINE_TOKEN` |
| Production debug | Off for API error bodies; `NODE_ENV=production` non-loopback guard in `server/index.mjs` |
| Scans | `security.json` + `dependency-audit.json` re-run each wave |

G08 may pass for this **declared scope** when hardening.json, security.json, and dependency-audit.json are clean. This is not a multi-tenant production threat-model completion.

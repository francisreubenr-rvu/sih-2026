# Brain 72h — Contracts + claim safety (OpenAPI / DigiLocker / egress)

**Date:** 2026-09-14  
**Branch:** `brain/72h-claims-honesty` (continues Hour 0 + three-path PR)  
**Scope:** Align public OpenAPI with Zod/server; tighten DigiLocker and egress copy. Honesty only.

## OpenAPI ↔ Zod / server

Source of truth for request validation remains `Prototype/shared/protocol.mjs` and `Prototype/shared/local-reference-protocol.mjs`; HTTP routes in `Prototype/server/app.mjs`.

| Delta | Detail |
|-------|--------|
| `regions.kind` | OpenAPI enum now includes **`password`** (already first-class in Zod since Wave 5; opaque geometry only). |
| `POST /api/v2/local-plans` | Documented as **experimental** (`x-experimental`, description). Matches server when `localInfer` is configured. Scheme `dhristi-local-references-v1`. |
| `LocalReferenceRequest` | Added schema: scheme/task/scene/fields; field bindings carry UUID references — never private values. Runtime `superRefine` still requires **email** for `prepare-report-contact`. |
| `Action` | `fill-local` added as experimental action used by v2 only. |
| Info | Version **0.1.1**; description notes experimental v2 and no pixel/DOM/URL/value inputs. |

Unchanged: `/api/v1/plans`, health, audits, session. No fabricated latency or privacy metrics.

## DigiLocker / Mandala+Steward copy rules

Applied on **Website** and **extension popup**:

1. DigiLocker = **inspired-by / trust pattern only** — explicitly **not** partner, API integration, credential share, or **custody**.
2. **What leaves this device** = **semantic scene fields only** (allowlisted labels, geometry, opaque region kinds).
3. **Raw pixels stay local** (screenshots used for on-device vision/preview only; never in plan requests).
4. Trust chip EN/HI labels stay accurate: **on this device** / **इस उपकरण पर**; titles expanded with egress + DigiLocker non-claims (EN/HI).

## Surfaces touched

- `Docs/openapi.json`
- `Website/index.html`, `Website/app.js`
- `Prototype/extension/popup.html`, `popup.mjs`, `popup.css`
- This decision note

## Explicit non-goals

- No G11 weaken or status flip.
- No `submission_ready` flip.
- No purchases; no DigiLocker/API partnership claims.
- No fabricated metrics or Score productization.

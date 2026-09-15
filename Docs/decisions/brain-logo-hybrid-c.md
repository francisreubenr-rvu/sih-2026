# Brain — Logo Hybrid C (Council-binding)

**Date:** 2026-09-15  
**Branch:** `brain/logo-hybrid-c`  
**Verdict:** Unanimous Council — **Hybrid C**  
**Scope:** Brand chrome only. No gate status changes. G11 / G03 remain fail/unknown as recorded. `submission_ready` remains false.

## Decision

| Track | Asset | Surfaces |
|-------|-------|----------|
| **A — bug only** | `Website/assets/dhristi-mark.svg` (v4 pixel viewfinder: concentric stepped squares, saffron focus) | Favicon, extension chrome icons, extension popup header, footer monogram |
| **B — lockup hero only** | `Website/assets/dhristi-lockup.svg` (aperture + wordmark **Dhristi** + **on-device vision**) | Website masthead / hero branding |

Variants (easy one-color / inverted for A): `dhristi-mark-mono.svg`, `dhristi-mark-inverted.svg`. Extension ships a copy of the bug at `Prototype/extension/icons/dhristi-mark.svg` plus regenerated `icon-{16,32,48,128}.png`.

## Hard don’ts

- **No DigiLocker** locker, document, or custody imitation in logo marks.
- **No MeitY seal** or government emblem imitation.
- **No partner co-brand** in the lockup or bug.
- **Saffron only** for focus / CTA accent — never ambient fill.
- **Never imply DigiLocker affiliation** via logo chrome (trust-pattern copy remains “inspired-by only,” per `brain-72h-contracts-copy.md`).

## Placement rules

1. Extension popup header uses **A (bug)** only — never the full lockup.
2. Website sticky masthead uses **B (lockup)**.
3. Favicon / toolbar / app icons use **A** only.
4. Lockup inspiration: `/workspace/dhristi-brand/dhristi-logo-lockup-v2.png` (aperture + wordmark geometry). Bug alignment: v4 minimal / aperture family (concentric stepped squares).

## Explicit non-goals

- No flip of `submission_ready`, G11, or G03.
- No DigiLocker API, credentials, or custody claims.
- No third-party logo reuse beyond original SVG authored for this decision.

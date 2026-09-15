# Logo shortlist — recommend only (do not ship alone)

**Status:** Steward recommendation for Francis / Design. **Do not** replace `Website/assets/dhristi-mark.svg` or merge a sole logo PR from this pack. Converge mark family first, then ship SVG + lockup together.

**Steward-safe rule:** Lockup may say **Dhristi** + on-device vision. **No DigiLocker partner / custody / Requester claim** in the mark or wordmark. DigiLocker-adjacent UI is aesthetic trust only (`Docs/what-leaves-device.md`).

**Token lock (do not invent hexes):** `--ink` `#101827` · `--navy` `#162b46` · `--paper` `#f3ead8` · `--mist` `#c7d5d2` · `--saffron` `#d88732` · `--trust` `#5c8b63`.

---

## Candidates compared

| Candidate | Path | Motif | Wordmark? | Steward-safe? | Notes |
|-----------|------|-------|:---------:|:-------------:|-------|
| **Shipped site mark** | `Website/assets/dhristi-mark.svg` | Stepped pixel aperture / viewfinder (navy · paper · mist · saffron core) | No (mark only) | Yes | Already in repo; matches brand-system “Virgil pixel” direction |
| **v4 minimal** | `/workspace/dhristi-brand/dhristi-logo-v4-minimal.png` | Same family: nested pixel squares + corner ticks + saffron core | No | Yes | Cleanest raster of the pixel viewfinder; best pair with site SVG |
| **v6 mono** | `/workspace/dhristi-brand/dhristi-logo-v6-mono.png` | Concentric cream rings + saffron core on navy | No | Yes | Strong mono; less “instrument/viewfinder” than v4 |
| **v5 badge** | `/workspace/dhristi-brand/dhristi-logo-v5-badge.png` | Tiny pixel core in rounded badge + trust-green corner | No | Yes | Reads as app icon/badge; green accent risks competing with trust chip |
| **aperture** | `/workspace/dhristi-brand/dhristi-logo-aperture.png` | Same viewfinder family as v4 (exploration still) | No | Yes | Overlaps v4; pick one pixel family, not both |
| **early eye mark** | `/workspace/dhristi-brand/dhristi-logo-mark.png` | Literal pixel eye + shield-check | No | Caution | Shield inside mark can confuse with DigiLocker/gov trust chrome — avoid as primary |
| **lockup v1** | `/workspace/dhristi-brand/dhristi-logo-lockup.png` | Pixel eye + **DHRISTI** + ON-DEVICE VISION | Yes | Yes (no DigiLocker text) | Motif fights shipped SVG / v4 family |
| **lockup v2** | `/workspace/dhristi-brand/dhristi-logo-lockup-v2.png` | Camera aperture blades + orange triangle + **Dhristi** + “on-device vision” | Yes | Yes (no DigiLocker text) | Strong lockup, **different motif family** than site SVG |

Master-pack pick pressure: converge on **one** mark family (pixel viewfinder **or** aperture blades — not both competing) + one lockup.

---

## Top 2 (recommend)

1. **`Website/assets/dhristi-mark.svg` + `/workspace/dhristi-brand/dhristi-logo-v4-minimal.png` (pixel viewfinder family)** — Already shipped and brand-system aligned; v4 is the clearest raster twin for decks/print without introducing a second motif or DigiLocker lockup claim.
2. **`/workspace/dhristi-brand/dhristi-logo-lockup-v2.png` (aperture blades lockup)** — Best existing full wordmark for hero/masthead (icon-only forbidden), Steward-safe tagline only; use **only if** Design consciously switches the mark family away from the site SVG (do not mix blades + pixel viewfinder in one UI).

**Not recommended as primary:** early eye+shield mark; lockup v1 (competes with v4 family); shipping v5/v6 alone without wordmark for website hero.

---

## Next step (human / Design — not this PR)

- Pick **one** family; if pixel wins, derive a title-case **Dhristi** lockup from v4 + SVG (do not invent fonts outside brand-system).
- If aperture wins, replace site SVG to match lockup-v2 blades before masthead swap.
- Keep DigiLocker out of the lockup; trust chip stays adjacent chrome, not part of the logo.
- Do **not** treat this shortlist as submission-ready branding or a solo ship.

## Explicit non-goals

- No sole logo merge from this pack.
- No DigiLocker partner claim in any lockup.
- No G11 / `submission_ready` / `g03_claim` changes.

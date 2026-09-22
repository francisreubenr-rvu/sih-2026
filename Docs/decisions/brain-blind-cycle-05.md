# Blind cycle-05 — DOM text PII + face-only gap honesty

**Date:** 2026-09-15  
**Branch:** `brain/blind-cycle-05`  
**Scope:** Organizer visual+PII+redaction ≈65%. Face-only is insufficient — PS lists passwords/OTP/cards/PII text. No fabricated WebPII/officialScore. No ORT sandbox rewrite (W-004 may still be in flight).

## Verified problems

1. **UltraFace / face-only** cannot detect passwords, OTP codes, card numbers, or free-text PII.
2. **Legacy `classifySensitive`** missed phrases such as “Your one-time code is 391204”, “verification code …”, “6-digit code: …”.
3. Prior wave fixture JSON compared **pre-authored** `detectorRegions` vs GT — it did not execute the live DOM text classifier.

## Fixes

| Fix | What changed | Honesty bound |
|-----|--------------|---------------|
| Span detector | `Prototype/shared/dom-text-pii.mjs`; `classifySensitive` + page-agent form heuristics (`one-time-code`, `cc-number`, `cc-csc`) | Telemetry / local mosaic only; never authorizes export |
| OCR line policy | `localWordPolicy` OTP/CVV colon labels + same-line digit rule | Lab text path; extension Fast still face+DOM |
| Held-out eval | `scripts/eval-dom-text-pii-heldout.mjs` + `Benchmarks/datasets/cycle05-dom-text-pii-heldout.json` → `cycle05-dom-text-pii-heldout-v01.json` | Authored synthetic; `official_score`/`webPiiScore` null |
| Face-only arm | Same fixtures, zero text predictions | Positive-case recall/coverage = **0** |
| Site + ledger | Pages latest-evidence card; claim-ledger entries | DigiLocker-inspired only; Fast≠G11; G20 paused; submission_ready false |

## Measured (this fixture set only)

- **dom_text_spans:** mean instance P/R 1.0 / 1.0; mean PII char coverage 1.0; mean non-PII preservation 1.0 (n=24 authored).
- **face_only (positive cases):** recall 0; char coverage 0.
- **form_field_microbench:** precision 1.0; recall 1.0 (6 attr fixtures).

## Explicit non-goals

- No invented WebPII wins. No G11 flip. No `submission_ready: true`. No ORT sandbox/popup mosaic rewrite. No named ISRO portals. G20 remains paused.

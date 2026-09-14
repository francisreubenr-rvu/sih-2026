# Human evaluation protocol (G20) — Wave 6

**Status:** Protocol template only. No non-author participant results are recorded. Do not mark G20 pass.

## Purpose

Collect task-level usability and privacy-trust evidence from ≥5 representative non-author participants and ≥3 non-author narrative reviewers, per Guardrails G20.

## Frozen tasks (synthetic fixture only)

1. Open synthetic fixture (`/app/fixture.html` or operations desk).
2. Load unpacked extension; click **toolbar glyph** (activeTab).
3. Capture & protect (privacy-only default).
4. Confirm trust chip (“on this device” / “इस उपकरण पर”).
5. Inspect outbound JSON: no screenshot/dataUrl/pixels.
6. (Optional) Planner path if Ollama available — or narrate skip.

## Anchored rubric (reviewers)

| Score | Meaning |
|------:|---------|
| 1 | Confusing / privacy boundary unclear |
| 2 | Partial understanding; major doubts |
| 3 | Adequate with assistance |
| 4 | Clear boundary; minor issues |
| 5 | Clear, trustworthy, would demo as-is |

Prompts: privacy understanding, trust chip clarity, preview usefulness, honest-limits communication (WebPII 58/100, G11 fail).

## Data handling

- Anonymized participant IDs only (P1…).
- No real personal data, credentials, or production screens.
- Store results in `Benchmarks/results/human-evaluation.json` with `status: unknown` until ≥5 / ≥3 thresholds met.

## Team-only rehearsal

Record separately under `team_rehearsal` — never counted toward G20 acceptance.


## Forms

Participant and reviewer sheets: `Docs/human-evaluation-forms.md`.

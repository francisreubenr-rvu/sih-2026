# Human evaluation forms (G20) — print / copy per session

**Status:** Forms ready to use. **Zero** non-author results in repo until real sessions are logged. Do **not** mark G20 pass.

Use with `Docs/human-evaluation-protocol.md`. After each session, append anonymized rows to `Benchmarks/results/human-evaluation.json` only.

---

## Session header (facilitator)

- Session date (UTC): ________  
- Build SHA: ________  
- Fixture URL: ________  
- Facilitator (not counted as participant): ________  
- Mode: ☐ in-person ☐ remote (facilitator drives browser)

---

## Participant task sheet (copy per P1…P5+)

- ID (anonymized): ________  Date: ________
- Role/context (optional, no employer secrets): ________
- Non-author confirmation: ☐ did not author Dhristi code/claims for this entry
- Tasks completed (synthetic fixture only):
  - ☐ open fixture
  - ☐ toolbar capture
  - ☐ protect
  - ☐ inspect egress
  - ☐ trust chip
- Task success (operator observation): ☐ unaided ☐ with help ☐ fail
- Time to first successful protect (mm:ss): ________
- Free-text confusion points: ________________________________

## Participant Likert (1–5)

| Prompt | Score |
|--------|------:|
| I understand raw pixels stay on this device | |
| Trust chip wording is clear (EN and/or HI) | |
| Protected preview is useful without exposing PII | |
| Limits (latency / WebPII OCR) were communicated honestly | |

---

## Narrative reviewer sheet (≥3 non-authors)

- Reviewer ID: ________  Date: ________
- Deck/site version (URL or commit): ________
- Non-author confirmation: ☐
- Materials reviewed: ☐ public site ☐ pitch/speaker notes ☐ live narrated demo
- Anchored rubric score (1–5): ________
- Strengths: ________________________________
- Risks / overclaims spotted: ________________________________
- Recommend demo-as-is? ☐ yes ☐ no ☐ with fixes

---

## Recruit checklist (facilitator private — do not commit PII)

| Invite # | Channel | Invited (private) | Accepted? | Scheduled | Completed as | Notes |
|----------|---------|-------------------|:---------:|-----------|--------------|-------|
| 1 | | | ☐ | | P__ / R__ / — | |
| 2 | | | ☐ | | | |
| 3 | | | ☐ | | | |
| 4 | | | ☐ | | | |
| 5 | | | ☐ | | | |
| 6 | | | ☐ | | | |
| 7 | | | ☐ | | | |
| 8 | | | ☐ | | | |

Target: ≥5 completed **participants** + ≥3 **narrative reviewers** (can overlap only if both task + rubric are done; prefer distinct people when possible).

---

## Logging

Append anonymized rows to `Benchmarks/results/human-evaluation.json` only. Never commit real names, emails, phone numbers, or production screens. Keep `status: unknown` until thresholds are actually met.

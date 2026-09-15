# Human evaluation protocol (G20) — templates retained; recruitment paused

**Status:** **PAUSED** (2026-09-15). Francis paused non-author recruitment. Protocol + forms remain on disk for when recruiting resumes. **Zero** non-author results are recorded. Do **not** mark G20 pass. No fabricated participants. Do **not** treat open checklists below as active recruiting.

**Guardrail:** G20 acceptance — ≥5 representative **non-author** participants perform frozen navigation tasks; ≥3 **non-author** reviewers score narrative with an anchored rubric. If unavailable, report `unknown` and do not claim benchmark saturation.

**Forms:** `Docs/human-evaluation-forms.md`  
**Log:** `Benchmarks/results/human-evaluation.json` (`participants` / `narrative_reviewers` stay `[]` until real sessions)

---

## Purpose

Collect task-level usability and privacy-trust evidence from people who did **not** author Dhristi code or claims copy. Team-only practice goes under `team_rehearsal` and **never** counts toward G20.

---

## Run plan — **paused** (do not send invites)

| Day focus | Action | Owner | Done? |
|-----------|--------|-------|:-----:|
| Recruit | **Paused** — Francis halted invites (2026-09-15). Do not send the recruit template until explicitly resumed. | Francis | ⏸ |
| Schedule | Book 20–25 min fixture sessions only after recruitment resumes | Francis | ⏸ |
| Facilitate | Run frozen tasks; fill forms; anonymize as P1… / R1… | Facilitator | ⏸ |
| Log | Append anonymized objects to `human-evaluation.json` only after real sessions | Francis | ☐ |
| Gate | Keep `status: unknown` until thresholds met; never invent rows | — | ☐ |

**No purchases. No Google login required.** Prefer campus / peer / lab contacts who can open a local `http://127.0.0.1` fixture or watch a shared screen of the synthetic fixture. Remote is OK if facilitator drives the browser and participant instructs verbally.

---

## Recruit template (copy/paste) — **do not send while paused**

**Subject / opener:** Quick 20-min privacy UX check for a student SIH prototype (synthetic data only)

Hi ________,

I am Francis (RVU). For our SIH prototype **Dhristi** (on-device screen protect / selective redaction), I need **non-author** feedback — people who did not build the code.

**What you would do (≈20 minutes):**
1. Look at a **synthetic** demo page only (no real accounts, no personal data).
2. Try: open fixture → toolbar capture → protect → read the “on this device” trust chip → glance at outbound JSON (no pixels leave the device).
3. Answer a short Likert + 2–3 free-text confusion notes (anonymized as P#).

**Optional second ask (≈15 minutes, can be async):** skim the public site / short pitch narrative and score clarity of privacy limits with a 1–5 rubric (reviewer R#).

**Constraints we already disclose:** face-only detector; text OCR limits; full-flow &lt;200 ms not claimed. Synthetic fixtures only.

If you are free this week, reply with a 20-min slot (in person or call). Thank you — no purchase or Google login needed.

— Francis

**Eligibility:** not a repo author / not primary claims writer for this entry. Classmates OK if they did not implement Dhristi.

**Tracking (do not commit names):** keep a private list of invites; only anonymized IDs land in git.

---

## Frozen tasks (synthetic fixture only)

Facilitator prep: `cd Prototype && npm start` → load unpacked `Prototype/extension-build/` → open fixture.

1. Open synthetic fixture (`/app/fixture.html` or operations desk).
2. Load unpacked extension; click **toolbar glyph** (activeTab).
3. Capture & protect (privacy-only default / Fast path).
4. Confirm trust chip (“on this device” / “इस उपकरण पर”).
5. Inspect outbound JSON: no screenshot / dataUrl / pixels.
6. (Optional) Planner path if Ollama available — or narrate skip.

Operator marks unaided / with help / fail on the participant sheet.

---

## Anchored rubric (narrative reviewers)

| Score | Meaning |
|------:|---------|
| 1 | Confusing / privacy boundary unclear |
| 2 | Partial understanding; major doubts |
| 3 | Adequate with assistance |
| 4 | Clear boundary; minor issues |
| 5 | Clear, trustworthy, would demo as-is |

Prompts: privacy understanding, trust chip clarity, preview usefulness, honest-limits communication (WebPII 58/100, G11 fail).

---

## Data handling

- Anonymized participant IDs only (`P1`…).
- No real personal data, credentials, emails, or production screens in the repo.
- Store results in `Benchmarks/results/human-evaluation.json` with `status: unknown` until ≥5 participants **and** ≥3 narrative reviewers are logged.
- Team-only rehearsal → `team_rehearsal.sessions` only.

### Participant JSON shape (append when real)

```json
{
  "id": "P1",
  "date_utc": "",
  "role_context": "",
  "tasks_completed": ["open_fixture", "toolbar_capture", "protect", "inspect_egress", "trust_chip"],
  "task_success": "unaided",
  "time_to_first_protect_mmss": "",
  "likert": {
    "pixels_on_device": null,
    "trust_chip_clarity": null,
    "preview_useful": null,
    "limits_honest": null
  },
  "confusion_notes": ""
}
```

### Narrative reviewer JSON shape

```json
{
  "id": "R1",
  "date_utc": "",
  "deck_or_site_version": "",
  "rubric_score": null,
  "strengths": "",
  "risks_or_overclaims": "",
  "recommend_demo_as_is": null
}
```

---

## Explicit non-goals

- No fake Likert scores or ghost participants.
- No G11 flip from evals. No `submission_ready: true`.
- Do not count authors or primary copywriters as G20 participants.

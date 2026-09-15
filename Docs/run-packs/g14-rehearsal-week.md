# G14 run pack — rehearsal week (Francis)

**Status:** Ready to book and run. **No fabricated results.** Arrays in `Benchmarks/results/demo-rehearsal.json` stay empty until you log live runs. Do **not** mark G14 pass until three consecutive `success` rows share one `build_sha`.

**Guardrail:** Critical journey succeeds in **3 consecutive** rehearsals from reset; offline-safe fallback exists and matches the tested version.

**Source checklist:** `Docs/demo-rehearsal-checklist.md`  
**Log file:** `Benchmarks/results/demo-rehearsal.json` → append to `consecutive_rehearsals`  
**Honesty:** G11 stays **fail**. `g03_claim` stays **false**. `submission_ready` stays **false**.

---

## Suggested slots (IST weekday evenings)

Book quiet blocks. Prefer the **same build** across the streak. A fail resets to R1.

| Slot | Suggested IST window | Date (edit) | Time (edit) | Operator | Build SHA | Booked? |
|------|----------------------|-------------|-------------|----------|-----------|:-------:|
| R1 | **Wed 16 Sep 2026** · 19:00–19:30 IST | ________ | ________ | Francis | ________ | ☐ |
| R2 | **Thu 17 Sep 2026** · 19:00–19:30 IST | ________ | ________ | same as R1 | must match R1 | ☐ |
| R3 | **Fri 18 Sep 2026** · 19:00–19:30 IST | ________ | ________ | same | must match R1–R2 | ☐ |

**Same-evening alternative (if mid-week splits are hard):** one quiet night, three reset→journey→log cycles back-to-back (~60–90 min including resets), e.g. **Thu 17 Sep 2026** 19:00–20:30 IST.

**Prep once (15 min):** `cd Prototype && npm ci && npm start`; load unpacked `Prototype/extension-build/`; open synthetic fixture only; confirm `Docs/demo-fallback.webm` opens offline.

---

## Copy-paste checklist (from demo-rehearsal-checklist)

### Reset (before every rehearsal)

1. Close extension popup; clear any stale pairing token.
2. Restart local prototype if planner path will be used; Privacy-only / Fast is fine if Ollama is down.
3. Open **synthetic fixture only** (`/app/fixture.html` or operations desk). No production / personal tabs.
4. Confirm toolbar glyph is the capture entry (`activeTab`). Do not demo from a bookmarked `popup.html` tab.
5. Note build: `git rev-parse HEAD` and extension version from `Prototype/extension/manifest.json`.

### Critical journey (tick live)

| # | Step | Pass? | Notes |
|---|------|:-----:|-------|
| 1 | Toolbar glyph click grants capture | ☐ | |
| 2 | Capture & protect (privacy-only Fast path default) | ☐ | |
| 3 | Trust chip visible (EN/HI) | ☐ | |
| 4 | Preview shows selective redaction / wireframe | ☐ | |
| 5 | Inspect outbound: no screenshot / dataUrl / pixels | ☐ | |
| 6 | Optional planner / narrate skip if Ollama down | ☐ | |
| 7 | Confirm or cancel cleanly; controlled failure recovery optional | ☐ | |

**Pass rule for one rehearsal:** steps 1–5 and 7 succeed from reset. Step 6 may be “narrate skip.” Hard fail on 1–5/7 → log `fail` and **reset the consecutive streak**.

### Paper / markdown mirror (fill live)

| Rehearsal | Date (UTC) | Operator | Build SHA | Result | Fallback opened? | Notes |
|-----------|------------|----------|-----------|--------|------------------|-------|
| 1 | | | | ☐ success ☐ fail | ☐ | |
| 2 | | | | ☐ success ☐ fail | ☐ | |
| 3 | | | | ☐ success ☐ fail | ☐ | |

---

## Where to paste into `Benchmarks/results/demo-rehearsal.json`

1. Open `Benchmarks/results/demo-rehearsal.json`.
2. Keep `"status": "unknown"` until all three consecutive rows are `success` with the **same** `build_sha` and offline fallback verified.
3. After each **live** run, append one object to the `consecutive_rehearsals` array (leave it `[]` until then — no placeholders).

```json
{
  "index": 1,
  "date_utc": "2026-09-16T13:30:00.000Z",
  "operator": "Francis",
  "build_sha": "<paste git rev-parse HEAD>",
  "result": "success",
  "fallback_opened": true,
  "journey_steps_passed": [1, 2, 3, 4, 5, 7],
  "fallback_used_in_live_path": false,
  "notes": ""
}
```

4. Optional: fill `planned_slots` when dates are booked (still not a pass).
5. Only then may Gate owners consider G14 / `"status": "pass"` — **not** this pack’s job.

Offline fallback (once per streak): open `Docs/demo-fallback.webm` with no network; note scope aloud (web workspace Pending→Review — **not** toolbar-glyph MV3).

---

## Explicit non-goals

- No fake `success` rows or empty-shell “passes.”
- Do not flip G11, `submission_ready`, or `g03_claim`.
- Do not mark G14 pass in Guardrails from this doc alone.

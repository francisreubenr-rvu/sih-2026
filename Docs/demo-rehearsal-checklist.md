# Demo rehearsal checklist (G14) — calendar-ready

**Status:** Operational template for live runs. Do **not** mark G14 pass until **3 consecutive** live rehearsals from reset are logged as `success` in `Benchmarks/results/demo-rehearsal.json`. Arrays stay empty until Francis runs them. No fabricated passes.

**Guardrail:** G14 acceptance — critical journey succeeds in 3 consecutive rehearsals from reset; offline-safe fallback exists and matches the tested version.

**Related:** `Docs/demo-runbook.md` · `Docs/demo-judge-checklist.md` · `Docs/demo-toolbar-capture-protocol.md` · `Docs/dhristi-human-demo-script.md`

---

## This week — calendar slots (fill dates when booked)

Book **three consecutive successful** runs. A fail resets the streak (start again at #1). Prefer same build id across the streak.

| Slot | Suggested window (local) | Date | Time | Operator | Build SHA (`git rev-parse HEAD`) | Booked? |
|------|--------------------------|------|------|----------|----------------------------------|:-------:|
| R1 | Day A — morning or evening quiet block (~25 min) | ________ | ________ | Francis / ________ | ________ | ☐ |
| R2 | Day A later **or** Day B — same setup (~25 min) | ________ | ________ | same as R1 if possible | must match R1 | ☐ |
| R3 | Immediately after R2 or next quiet block (~25 min) | ________ | ________ | same | must match R1–R2 | ☐ |

**Recommended cadence (example, edit freely):**

1. **Prep block (once):** 15 min — `npm ci`, start server, load unpacked extension, verify fixture + fallback WebM opens offline.
2. **Streak block:** three reset→journey→log cycles back-to-back (or same day with short breaks). Total ~60–90 min including resets.
3. **Debrief:** 10 min — append three objects to `consecutive_rehearsals` in `Benchmarks/results/demo-rehearsal.json`; leave `status: unknown` until all three are `success` with matching build.

Offline fallback check (once per streak): open `Docs/demo-fallback.webm` with no network; note scope aloud (web workspace Pending→Review — **not** toolbar-glyph MV3).

---

## Reset procedure (before every rehearsal)

1. Close extension popup; clear any stale pairing token from the popup field.
2. Restart local prototype (`cd Prototype && npm start`) if planner path will be used; Privacy-only is fine if Ollama is down.
3. Open synthetic fixture only (`/app/fixture.html` or operations desk). **No production / personal tabs.**
4. Confirm toolbar glyph is the capture entry (`activeTab`). Do not demo from a bookmarked `popup.html` tab.
5. Note build: `git rev-parse HEAD` and extension version from `Prototype/extension/manifest.json`.

---

## Critical journey steps (tick live)

| # | Step | Pass? | Notes |
|---|------|:-----:|-------|
| 1 | Toolbar glyph click grants capture | ☐ | |
| 2 | Capture & protect (privacy-only Fast path default) | ☐ | |
| 3 | Trust chip visible (EN/HI) | ☐ | |
| 4 | Preview shows selective redaction / wireframe | ☐ | |
| 5 | Inspect outbound: no screenshot / dataUrl / pixels | ☐ | |
| 6 | Optional planner / narrate skip if Ollama down | ☐ | |
| 7 | Confirm or cancel cleanly; controlled failure recovery optional | ☐ | |

**Pass rule for one rehearsal:** steps 1–5 and 7 succeed from the reset above. Step 6 may be “narrate skip.” Any hard fail on 1–5/7 → log `fail` and **reset the consecutive streak**.

---

## Consecutive log (paper / markdown mirror)

Copy into JSON after each live run. Leave blank until run.

| Rehearsal | Date (UTC) | Operator | Build SHA | Result | Fallback opened? | Notes |
|-----------|------------|----------|-----------|--------|------------------|-------|
| 1 | | | | ☐ success ☐ fail | ☐ | |
| 2 | | | | ☐ success ☐ fail | ☐ | |
| 3 | | | | ☐ success ☐ fail | ☐ | |

### JSON row shape (append to `consecutive_rehearsals`)

```json
{
  "index": 1,
  "date_utc": "",
  "operator": "",
  "build_sha": "",
  "result": "success",
  "fallback_opened": false,
  "journey_steps_passed": [1, 2, 3, 4, 5, 7],
  "fallback_used_in_live_path": false,
  "notes": ""
}
```

Only change `Benchmarks/results/demo-rehearsal.json` → `"status": "pass"` after three consecutive `success` rows with the same `build_sha` and a verified offline fallback. Until then keep `"status": "unknown"`.

---

## Honest limits to state during rehearsal

- UltraFace face-only; WebPII retained exact PII on 58/100 screens.
- Full-flow &lt;200 ms **fails** (G11 stays fail). Privacy-only is not a G11 pass.
- Automation harnesses are **not** toolbar-glyph evidence.
- `submission_ready` stays false regardless of rehearsal outcome this week.

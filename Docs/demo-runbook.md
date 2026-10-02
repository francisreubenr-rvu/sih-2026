# Demonstration and fallback runbook (v5, updated 2 October 2026)

**Status:** G14 evidence collected on build `a94aa1c` (three consecutive rehearsals from reset, fallback recorded on the same build). G14 stays **unknown** in `Guardrails/guardrails.json` until Francis confirms. Evidence: `Benchmarks/results/g14-v5-rehearsal/rehearsals.json`.

## Live path (preferred): v5 extension + Warden + cloud planner

The critical journey: a task containing a real email address goes in, the email is replaced by a token on the device, the cloud planner sees only tokens, the extension fills the real value into the page locally, and the page saves.

1. **Freeze the build.** `git rev-parse HEAD`; `extension/` and `warden/` must have no local changes.
2. **Start the Warden** (loopback only):
   ```sh
   cd warden && GROQ_API_KEY=... python -m uvicorn app:app --host 127.0.0.1 --port 8756
   ```
   Wait until `curl -s 127.0.0.1:8756/health` shows `"loaded": true` (GLiNER, about 15 s on CPU after the first download). To show exactly what leaves the machine, put the recording relay in front of Groq and start the Warden with `GROQ_BASE_URL=http://127.0.0.1:8799`:
   ```sh
   node scripts/e2e-v5/recording-relay.mjs /tmp/cloud-received.jsonl 8799 https://api.groq.com/openai/v1
   ```
3. **Load the extension.** Chrome or Chromium, `chrome://extensions`, Developer mode, Load unpacked `extension/`. Reload it before every rehearsal.
4. **Open the synthetic fixture only.** `scripts/e2e-v5/fixture.html` served on loopback (the harness serves it on `127.0.0.1:8800`). No personal or production tabs.
5. **Open the Dhristi side panel** from the toolbar. The health chip must read **READY** (redaction on device, planning in cloud).
6. **Send the task:** "Update my contact email to priya.r@example.com and save the profile". Grant site access when asked.
7. **Narrate the boundary** as it runs: Perceive and Redact run on the device; only tokens cross to Plan; Check and Act run on the device. Answer each state-changing confirmation with **Run this step**.
8. **Show the result.** The page reads "Saved priya.r@example.com". Open **Inspect step > Cloud saw**: the task as sent reads "Update my contact email to EMAIL#1 and save the profile". If the relay is running, `grep -c "priya.r@example.com\|Raghunathan" /tmp/cloud-received.jsonl` prints 0.
9. **Reset** (restart the Warden, reload the extension, reload the fixture) and repeat.

Automated rehearsal of the same journey, from reset, with a recording of each run:
```sh
node scripts/g14/rehearse.mjs --runs 3 --out /tmp/g14
node scripts/g14/make-fallback.mjs /tmp/g14/run-3 Docs/demo-fallback.webm
```

## External dependencies

| Dependency | Needed for | Not needed for |
|---|---|---|
| Groq API (`api.groq.com`) and `GROQ_API_KEY` in the Warden's environment | Live planning | Playing the fallback |
| Hugging Face model `urchade/gliner_multi_pii-v1` | First Warden start (then cached) | Later starts, the fallback |
| Python: gliner, torch (CPU), transformers, protobuf, fastapi, uvicorn, httpx | The Warden | The fallback |
| Chrome or Chromium with the unpacked `extension/` | Live path | The fallback (any browser that plays VP9 WebM) |

Offline mode (`WARDEN_PLANNER=ollama`) plans on the device instead of Groq; it was not part of these rehearsals.

## Recorded fallback

- **File:** `Docs/demo-fallback.webm` (VP9, 1280x824, 22 s) with captions in `Docs/demo-fallback.vtt`.
- **What it shows:** the fixture page and the side panel side by side, recorded during rehearsal run 3 on `a94aa1c`. The label bar reads: "Recorded fallback. Dhristi v5, build a94aa1c, recorded 2026-10-02. Synthetic page; real Groq planner; journey in real time, first and last frames held." Captions name each journey step.
- **Checked:** plays offline from a `file://` page in Chromium with all 8 caption cues loaded.
- **Say aloud** that it is a recording, and of which build.
- The 10 September fallback (Prototype web workspace) is kept at `Docs/demo-recording/demo-fallback-2026-09-10.webm` as history.

## What the rehearsals did not show

- A person at the keyboard: confirmations were answered by the harness.
- The real Chrome side panel: the harness opens `sidepanel.html` as a tab.
- The optional host-permission prompt: the harness grants it in its copy of the manifest.
- Venue network conditions; Groq's free tier can return 429s under back-to-back runs.

A human dress rehearsal on the presenting laptop is still worth doing before judging.

## Failure ladder

Live v5 path → recorded fallback of the same build (`Docs/demo-fallback.webm`) → final-state screenshots (`Benchmarks/results/g14-v5-rehearsal/run-*-panel-final.png`). No real-provider claim unless it was exercised live.

## Honest limits to state

- Full flow under 200 ms **fails** (G11): the cloud planner alone takes hundreds of milliseconds per step.
- Redaction quality is measured on synthetic data only; GLiNER can miss values it was not trained on.
- The Warden is not authenticated by the extension (ROAST Round 28).

---

## History: Prototype popup path (Wave 5, before v5)

The section below is the earlier runbook for the Prototype MV3 popup, kept as written. Its rehearsal rows (g14-box-02 to 07) ran on builds up to `996e40b`.


**Status:** Live path documented; recorded fallback present; 3 consecutive judged rehearsals not yet logged (G14 remains unknown).

### Live path (Prototype popup, history)

1. Freeze build id (`git rev-parse HEAD`), extension **0.1.1**, Node 22+.
2. `cd Prototype && npm ci && npm start` → `http://127.0.0.1:9041/`.
3. Optional Ollama + `qwen2.5:7b-instruct`. If down, leave **Privacy-only** checked.
4. Load unpacked `Prototype/extension-build/` in Chrome.
5. Open synthetic fixture (`/app/fixture.html` or operations desk).
6. **Click the Dhristi toolbar icon** (human required for `activeTab`).
7. Capture & protect → stage strip → selective/wireframe preview → inspect semantics-only JSON.
8. Privacy-only: stop and narrate boundary. Planner: Ask model → Confirm.
9. Show one controlled failure (capture without toolbar → reopen from glyph) and recovery.
10. Reset demo; repeat. Log each rehearsal in `Benchmarks/results/demo-rehearsal.json`.


### Toolbar Capture & protect evidence (Fast / privacy-only)

For a logged **production Chrome toolbar** run (human `activeTab` gesture, privacy-only Fast path, no Ollama):

1. Follow **`Docs/demo-toolbar-capture-protocol.md`** exactly.
2. Fill **`Benchmarks/results/toolbar-capture-log-v01.json`** (stub starts empty; no fabricated passes).
3. Do **not** claim G03 pass from this alone; Guardrails G03 stays unknown until acceptance is met.

Automation harnesses under `scripts/validate-extension-*.mjs` use a temporary overlay and are **not** toolbar-glyph evidence.

### Recorded fallback

- File at the time: `Docs/demo-fallback.webm`, moved on 2 October 2026 to `Docs/demo-recording/demo-fallback-2026-09-10.webm` (copy of `Docs/demo-recording/dhristi-browser-v02.webm`).
- Scope: web workspace Pending→Review with local protect + Qwen (not toolbar-glyph MV3 capture).
- Say aloud which path is shown. Offline-safe local playback verified historically in Pages checkpoint notes.

### Failure ladder

Live local domain service → recording of that same build → labelled screenshot storyboard (`Benchmarks/results/wave5-demo-screens/`). No real-provider claim unless exercised.

### Honest limits to state

- UltraFace face-only; WebPII text retained exact PII on 58/100 screens.
- Full-flow &lt;200 ms **fails** (planner seconds). Privacy-only is not a G11 pass.
- Firefox package exists; live Firefox unverified here.

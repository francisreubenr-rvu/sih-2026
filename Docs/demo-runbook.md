# Demonstration and fallback runbook (Wave 5)

**Status:** Live path documented; recorded fallback present; 3 consecutive judged rehearsals not yet logged (G14 remains unknown).

## Live path (preferred)

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

## Recorded fallback

- File: `Docs/demo-fallback.webm` (copy of `Docs/demo-recording/dhristi-browser-v02.webm`).
- Scope: web workspace Pending→Review with local protect + Qwen (not toolbar-glyph MV3 capture).
- Say aloud which path is shown. Offline-safe local playback verified historically in Pages checkpoint notes.

## Failure ladder

Live local domain service → recording of that same build → labelled screenshot storyboard (`Benchmarks/results/wave5-demo-screens/`). No real-provider claim unless exercised.

## Honest limits to state

- UltraFace face-only; WebPII text retained exact PII on 58/100 screens.
- Full-flow &lt;200 ms **fails** (planner seconds). Privacy-only is not a G11 pass.
- Firefox package exists; live Firefox unverified here.

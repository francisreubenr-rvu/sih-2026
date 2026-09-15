# Dhristi — judge / demo checklist (1 page)

**Purpose:** Human toolbar / activeTab path. Automation cannot click the Chrome toolbar glyph; do not claim it did.

## Before the room

- [ ] Node 22+; `cd Prototype && npm ci && npm start` → `http://127.0.0.1:9041/`
- [ ] Optional: Ollama + `qwen2.5:7b-instruct` (planner). If down, leave **Privacy-only** checked.
- [ ] Optional pre-flight (no Ollama): from repo root `node scripts/judge-fast-path.mjs` or `cd Prototype && npm run judge:fast`.
- [ ] Load unpacked `Prototype/extension-build/` in Chrome (v0.1.1).
- [ ] Add extension origin to `ALLOWED_ORIGINS`; restart server; copy pairing token if planning.

## Live path (human required)

1. Open the synthetic fixture tab (`/app/fixture.html` or operations desk).
2. **Click the Dhristi toolbar icon** (not a bookmarked `popup.html` tab) so Chrome grants `activeTab`.
3. Confirm trust chip: “on this device” / “इस उपकरण पर”.
4. Capture & protect → stage strip advances inject→…→review; selective or wireframe preview appears. Optional: enable **Score path** to show local risk band (`officialScore` null).
5. Inspect outbound JSON: **no** screenshot / dataUrl / raw pixels.
6. Privacy-only: stop here and narrate the boundary. Planner mode: Send protected layout → Confirm action.

## Say out loud (honest)

- UltraFace is **face-only**; WebPII text retained exact PII on **58/100** screens — OCR stays local-only.
- Full-flow **&lt;200 ms fails** (planner seconds). Privacy-only local protect is not a G11 pass.
- Firefox package exists; live Firefox run unverified in this environment.
- Synthetic fixtures only in the demo.

## Failures to recover from

| Symptom | Action |
|---------|--------|
| Capture permission error | Close popup; reopen from **toolbar** icon |
| Page connection lost | Retry capture (reinject) |
| Restricted `chrome://` page | Navigate to http(s) fixture |
| Planner timeout | Stay in privacy-only or restart Ollama |

## Evidence links

`Benchmarks/results/e2e.json` · `extension-loop-v01.json` · `core-latency.json` · `judge-fast-path.json` · `wave5-pii-redaction-utility-v01.json` · `wave5-demo-screens/` · `Docs/decisions/wave4-latency-strategy.md`

## Screenshotable synthetic flow (automation-maximized)

Harness `scripts/validate-extension-e2e.mjs` produces PNGs under `Benchmarks/results/wave5-demo-screens/` for fixture + popup stages using a **temporary** `<all_urls>` overlay. That is **not** a toolbar glyph click. Use those stills for storyboard fallback only.

# Roast Loop — 9 September 2026

## Scope
SIH26171 implementation. The earlier preparation pack is historical evidence, not a working privacy agent.

## Round 1
### Findings (open)
- [ ] Prototype/README.md:1 — no implementation exists for the now supplied SIH26171 statement — critical delivery gap. Build and verify client vision, privacy boundary, server reasoning, and browser action execution before closing.
### Fixed
None yet. Audit begins with the implementation; additional findings require concrete file/line evidence.

- [x] scripts/build-prototype.mjs:8 — URL pathname encoded spaces and broke bundling; switched to fileURLToPath. Build rerun below.
- [x] Prototype/server/app.mjs:8 — trailing root slash rejected valid static paths; normalized root and added real-entry HTTP regression coverage.

- [x] Prototype/server/provider.mjs:17 — real Qwen response omitted the action wrapper under unconstrained JSON mode; enforced a full output JSON schema; real Qwen plan accepted and confirmed Pending click observed in browser.

- [x] Prototype/app/main.mjs:13 — iframe document can be absent during navigation/reload, throwing before load listener handles the ready fixture; guarded document readiness; browser reload then capture succeeded (106ms observed, one face) at 390px.

- [x] Prototype/models/ultraface-rfb320.onnx — obsolete graph inputs and unused training counters emitted hundreds of warnings and prevented constant folding; removed redundant metadata, preserved active weights, rechecked browser face inference. The runtime still emits a CPU-vendor identification warning in this embedded browser.

## Open validation work
- [x] Web workspace now proactively revokes expired/changed context; observed status update and both plan/execute disabled after expiry. Extension still revalidates on each request/action.
- [ ] Chrome and Firefox unpacked-extension execution; full dataset and resource measurements; VLM evaluation; privacy/utility baselines; accessibility and user study.

## Round 2 — current candidate

The original "no implementation exists" finding is superseded: implementation, local WASM inference and actual Qwen-confirmed task completion now exist. The broader delivery gap remains open under the validation work above; do not infer native-extension or dataset readiness.

- [x] Shared client audit: unique revisions, observed open roots, target identity/bounds/disabled checks, composed hit testing and fail-closed collection. Dependency-free DOM tests pass; real shadow/overlay browser fixtures remain unverified.
- [x] Vision audit: reject nonfinite outputs and invalid shapes; release tensors/owned bitmaps/canvas pixels on failures; serialize disposal. Runtime-double lifecycle tests pass.
- [x] Web capture: release screenshot canvas in finally, including failed inference.
- [x] Website GitHub source links used nonexistent main branch; changed to verified default master.
- [x] Presentation render: corrected title/subtitle overlap, dense panel body size and cropped screenshot. Current PDFs and contact sheets regenerated.

## Round 3 — measured model behavior and recording

- [x] Shared page-agent browser tests now exercise the actual DOM, shadow roots, overlays, CSSOM movement and expiry: 18/18 pass. This closes the synthetic Chrome harness gap only.
- [x] Model benchmark output could overwrite previous evidence. Runs now require a fresh directory and default to frozen first-run cases. Historical runs and failures are preserved.
- [x] Legacy screencast dropped events. Replaced it with a real browser recording stream; verified final frame and MP4 playback. No fabricated video frames.
- [ ] Qwen7B latest adapter still selects the wrong action in 2/24 authored development cases. Smaller models also fail; strict JSON is not semantic correctness. See Docs/decisions/model-pilot.md.
- [ ] Native extension installation was blocked by browser URL policy. Respect that boundary; no cross-browser extension readiness claim.

## Round 4 — external raster diagnostic

- [x] Benchmark inherited fixed 800x500 iframe CSS while annotations used full-image bounds. Reject the old coverage summary, set exact dimensions, and verify them in both harness and scorer.
- [ ] Raster-only input loses all original visual context. The external 100-screen slice produces zero usable controls and zero localized PII detections; full-image masking does not satisfy useful selective redaction.
- [ ] Worker adapter reduces observed main-thread blocking but first-run detection p95 worsens. Keep it experimental until repeated measurements justify a default change.
- [x] Scorer overlap/matching rules tested; failed attempts remain in the declared denominator.

## Round 5 — local text experiment and reference review

- [x] Token-window parameters could produce a non-advancing loop. Reject invalid sizes/overlap; alignment and rejection tests pass.
- [x] OCR build used a nonexistent `LICENSE` filename. Corrected to the installed `LICENSE.md` and rebuilt successfully.
- [ ] OCR/NER preview has no real-browser measurement yet: local page navigation was blocked. Do not describe it as a validated privacy filter or integrate free OCR text into outbound context.
- [ ] Current reviewed one-action workflow needs a bounded goal loop with observed task postconditions before claiming autonomous goal completion. Do not inherit VEIL's claims or fuzzy retargeting behavior from the transcript.
- [ ] Transcript score and ISRO operational claims require original code/evidence or domain validation. Separate hypothesized use cases from verified capabilities.

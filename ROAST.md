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

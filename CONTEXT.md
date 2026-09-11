# Sightline — SIH26171

User: Francis, on behalf of RV University team Gopreet, Hiranmayi, Varun, Koushaik, Francis and Niharika. Roles remain proposed, not verified skill evidence. Internal target11September2026. Correct organizer problem is SIH26171, ISRO, on-device visual perception for light-weight browser agents. The official retrieved statement supersedes the original unresolved SIH2171 shorthand.

## Vocabulary
- **Local capture:** original screenshot retained in client memory only; demo uses html2canvas, extension uses captureVisibleTab.
- **Protected scene:** strict geometric context with opaque region kinds and approved control labels. No raw screenshot/DOM/value/URL field.
- **Vision detector:** packaged UltraFace RFB320 on ONNX Runtime Web WASM; face-only, not a general PII detector.
- **Plan:** server-proposed click/scroll/done, validated against the current scene.
- **Revision:** expiring client snapshot identity; changes reject stale commands.
- **Audit:** persisted counts, timings, model identifier and action type; no scene contents.
- **Measured:** evidence from a declared actual runtime. Synthetic fixtures, projections, unit doubles and author-reported literature numbers must be labeled separately.

Working server http://127.0.0.1:9041; The redesigned static Website is ready for candidate publication; check Docs/deployment-verification.md for the actual published revision. Current implementation is v0.1, not competition-ready. See PLAN.md for the complete remaining scope and ROAST.md for implementation findings.

Experimental additions: `/app/text-preview.html` provides local-only OCR/PII diagnostics; `/app/task-loop.html` provides a bounded synthetic task loop; `/app/local-reference.html` provides a confirmed synthetic email draft using one-use local references and `/api/v2/local-plans`. On 11 September all three ran in the in-app browser: OCR policy correction, three synthetic task goals, cancellation and local draft/expiry evidence are recorded in `Docs/decisions/browser-experiments-2026-09-11.md`. Native-extension and general privacy/utility gates remain open. The current ignored `.env` selects an independent local Ollama instance on port11436; default install instructions still support11434.

External OCR checkpoint (11 September): all 100 frozen WebPII screens execute, but intended text redraw retains exact annotated PII on 58 screens; local OCR/NER p95 2888.4ms. Keep OCR local-only. Protocol/results: `Docs/decisions/external-text-evaluation.md`. This broader failure supersedes any generalization from the three authored token examples.

Integrated simulation (11 September): `/app/operations.html` demonstrates the complete pattern on an original synthetic Earth-observation interface—protected scene, real Qwen navigation, expiring local email reference, confirmed local draft fill; expiry/stop cases pass. Run records in `Benchmarks/results/operations-v01/`. Known limits: 80px fixture portrait yields zero UltraFace detections (scale sensitivity), property readback probe discrepancy preserved, no egress-isolation or native-extension claim. Full-flow timing still seconds.

Native-extension harness (11 September): `scripts/validate-extension.mjs` loads the real unpacked MV3 build into a throwaway Chromium profile (Playwright) and verifies load, content-script injection, popup execution and host-permission reachability from inside the browser. A real bug surfaced and was fixed: `crypto.randomUUID()` in `Prototype/shared/page-agent.mjs` is undefined outside secure contexts (plain `http://`, `data:`, `file://`), which is exactly where the content script gets injected, so it threw before registering; fixed via `Prototype/shared/random-id.mjs`. Harness now passes 8/8 (1 informational: the manifest declares no background worker, so this popup-driven build has no service worker to wait on); record in `Benchmarks/results/extension-native-v01.json`. A second check added with it proves the label allow-list is a refusal: a button labelled "Approve transfer" never reaches the exported scene. Full unit suite 77/77. Scope: Chromium-only, popup opened as a document rather than through the toolbar action so `captureVisibleTab` and the pairing-token round-trip are unexercised. This narrows but does not close the native-extension gate.

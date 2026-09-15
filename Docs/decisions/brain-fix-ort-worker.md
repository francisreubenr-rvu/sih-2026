# Brain — Fix ORT worker crash (DBG-001)

**Date:** 2026-09-15  
**Branch:** `brain/fix-ort-worker-crash`  
**Incident:** DBG-001 — Capture & protect MV3 crash (dress rehearsal)  
**G14:** **Do not mark G14 pass.** Fail resets consecutive streak; three successes on one `build_sha` + offline fallback still required.

## Context

Dress rehearsal (PR #11 / Hybrid C build) showed Chrome balloon *"Dhristi — Local privacy review has crashed"* immediately on **Capture & protect** after journey step 1 (popup painted). Handled JS failures become `#status` text; the balloon implies process-level death of the extension/popup host.

Investigation (`/workspace/dbg001/DBG-001-report.md`) ranked:

| ID | Hypothesis | Likelihood |
|----|------------|------------|
| **H1** | ORT WASM abort / OOM inside the **MV3 popup** process during cold `createVisionDetector` / first `detect` | high (primary) |
| **H2** | In-place `extension-build/` wipe+rewrite (`rm -rf`) while Chrome still had the unpacked path loaded | medium–high (co-trigger) |
| H3–H6 | Branding SVG, caught permission errors, content-script throws, GPU amplifier | low / secondary |

`vision-worker.mjs` / `vision-worker-client.mjs` already existed for the web app but were **unused** by `popup.mjs`.

## Decision

1. **Popup routes vision through `createWorkerVisionDetector`** so ONNX Runtime WASM loads and runs in a **module Worker** (`vision-worker.js`), not the short-lived action-popup renderer. `runtimeUrl` / `modelUrl` remain `chrome.runtime.getURL(...)`.
2. **`scripts/build-extension.mjs` builds to a staging tree then atomically renames** into `Prototype/extension-build/` (and Firefox counterpart), avoiding deleting files under a live unpacked path mid-session when possible. Still ship `RELOAD-AFTER-REBUILD.txt`: after branding rebuild, **Remove extension → rebuild → Load unpacked** before Capture.
3. **Package `vision-worker.js`** in the Chrome/Firefox extension trees and zips. Manifest already allows `'wasm-unsafe-eval'` under `content_security_policy.extension_pages` — required for ORT WASM; no new host permissions.

## Explicit non-goals

- Do **not** mark G14 / G03 / G11 pass from this fix alone.
- No pairing-token / Reason-path changes.
- No claim that staging rename alone makes mid-session rebuilds safe — operators must still Remove → Load unpacked after rebuilds.

## Verification

- `cd Prototype && npm test && npm run build:extension`
- Confirm `extension-build/vision-worker.js` present and `manifest.json` CSP retains `wasm-unsafe-eval`.
- Human dress: Remove → Load unpacked → toolbar Capture on Fast path (evidence later; not claimed here).

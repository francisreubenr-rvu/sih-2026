# Brain — Fix ORT sandbox crash (DBG-002 / W-003)

**Date:** 2026-09-15  
**Branch:** `brain/fix-ort-sandbox-crash`  
**Incident:** DBG-002 — Intermittent Capture & protect MV3 balloon crash (G14 box #3/3)  
**Authoritative report:** `/workspace/dbg001/DBG-002-report.md`  
**G14:** **Do not mark G14 pass.** Fail resets consecutive streak; three successes on one `build_sha` + offline fallback still required.

## Context

PR #12 moved ONNX Runtime into a **Dedicated Worker** (`vision-worker.js`). That removed main-thread ORT from the action popup but **did not process-isolate** WASM: a Dedicated Worker shares the popup renderer process. A native WASM abort / OOM still produces the Chrome balloon *"Dhristi — Local privacy review has crashed"* (same class as DBG-001 H1).

DBG-002 also noted:

| ID | Factor | Role |
|----|--------|------|
| **H1** | ORT WASM abort in popup renderer (Worker ≠ process isolation) | primary |
| H2 | Box GPU / SharedImage instability | amplifier |
| **H3** | Cold ~12 MB WASM every popup open (cache is popup-scoped) | design gap |
| **H4** | Skipped Reload / dirty session vs prior successes | operator delta |

`createDetectorCache()` cannot survive popup close. Capture-time cold init remains the risky window.

## Decision

1. **Ship MV3 `sandbox` page `ort-sandbox.html`** hosting ORT/WASM via `createVisionDetector` in a **sandboxed extension document** (separate process, no `chrome.*`). Popup embeds a hidden iframe and speaks the smallest viable IPC (`postMessage` + transferable `ImageBitmap`) through `createSandboxVisionDetector` (`Prototype/shared/vision-sandbox-client.mjs`).
2. **Preload / warm** the sandbox detector on **popup open** (`ensureVisionPreload`), not only on Capture click — surfaces `#status` “Loading local vision…” so hangs are visible (H3).
3. **`vision-worker-client.mjs`:** do **not** `terminate()` inside `onerror` during init; fail pending promises and leave teardown to `dispose()` (H3 cascade). Timeouts may still terminate.
4. **Protocol:** Reload the extension **immediately before each** streak Capture; **fixture-only** tabs — no production / personal / GitHub tabs (H4 / H2). Documented in demo toolbar + rehearsal checklist.
5. **Keep** atomic staging rename in `scripts/build-extension.mjs` (DBG-001 H2). Still prefer Remove → rebuild → Load unpacked after branding rebuilds.

## Explicit non-goals

- Do **not** mark G14 / G03 / G11 pass from this fix alone.
- No pairing-token / Reason-path changes.
- No claim that sandbox alone eliminates all GPU-amplified failures on a dirty box profile.
- Dedicated Worker remains packaged for web/app paths; extension Capture uses the sandbox bridge.

## Packaging note

Sandbox adds a small HTML + bundled `ort-sandbox.js`. WASM weights were already in the zip (PR #12). If a future packaging limit rejects the sandbox page, fall back to Worker + preload + protocol and treat process isolation as follow-up — **this PR ships the sandbox**.

## Verification

- `cd Prototype && npm test && npm run build:extension`
- Confirm `extension-build/ort-sandbox.html`, `ort-sandbox.js`, manifest `sandbox.pages`, and sandbox CSP with `wasm-unsafe-eval`.
- Human: **Reload** → fixture-only tab → toolbar open (watch “Loading local vision…”) → Fast Capture. Do not claim G14.

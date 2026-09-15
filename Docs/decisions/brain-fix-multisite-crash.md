# Brain — Fix multisite Capture crash (DBG-003 / W-004)

**Date:** 2026-09-15  
**Branch:** `brain/fix-multisite-crash-dbg003`  
**Incident:** DBG-003 — Intermittent Capture crashes on public multi-site Fast Capture (post PR#17 sandbox + PR#22 Score)  
**Authoritative report:** `/workspace/dbg001/DBG-003-report.md`  
**G03 / G14:** **Do not mark G03 or G14 pass** from this hardening. Fixture G14 already passed on sandbox `996e40b`; this run was public multi-site pressure, not a fixture-streak reopen.

## Context

Blind multisite smoke (`Benchmarks/results/blind-multisite-01/`) logged **crash_count 3/5** on public pages after PR#17 (ORT in `ort-sandbox`) + PR#22 (Score). Wikipedia/W3 recovered after Reload; github.io died “after navigation” with no capture.

DBG-003 ranked:

| ID | Factor | Role |
|----|--------|------|
| **H1** | Popup still owned PNG decode + selective OffscreenCanvas mosaic on large public captures | primary |
| **H2** | Sandbox process abort may still surface as extension balloon; no soft iframe recreate | co-primary |
| **H3** | Navigation / activeTab gesture races across sites without fresh toolbar click | medium–high |
| **H4** | No Reload between sites; dirty GPU / extension session | medium |
| H5–H7 | Cold preload, Score path, content-script DOM walk | low for balloon |

## Decision

1. **Move decode → detect → selective mosaic into `ort-sandbox`** via `protect` IPC (`detector.protectCapture`). Popup stays thin: `chrome.*` + UI messaging + `drawImage` of a transferred preview bitmap (or wireframe `paintScene`).
2. **Default wireframe preview** (checkbox checked) for public / multi-site demos; selective remains an explicit opt-in. Heavy-page helpers in `latency-strategy.mjs` document the auto preference.
3. **JPEG `captureVisibleTab`** (`format: 'jpeg', quality: 70`) when the API allows — shrinks decode cost vs full PNG.
4. **Refuse Capture if the active tab navigated or switched** since the toolbar-open gesture (`snapshotGestureTab` / `assertGestureTabFresh`); clear `#status` copy (`err_navigated`).
5. **Soft-recreate sandbox iframe** on sandbox death errors (one retry); **document that Reload may still be required** if Chrome attributes process death to the whole extension.
6. **Protocol:** Reload between sites (or after Errors badge) + **fresh toolbar click** after every navigation — see `Docs/demo-toolbar-capture-protocol.md`.

## Explicit non-goals

- Do **not** flip G03 / G11 / G14 / `submission_ready` or invent metrics.
- No Score-path crash patch (Score is post-success JS).
- No broadening `host_permissions` solely to “fix” balloons.
- No claim that soft-recreate eliminates all GPU-amplified balloon crashes on a dirty box profile.

## Verification

- `cd Prototype && npm test && npm run build:extension`
- Confirm `extension-build/ort-sandbox.js` bundles selective redaction; manifest sandbox page unchanged.
- Human: Reload → fresh toolbar click per site → Fast Capture with wireframe default; optional selective opt-in. Do not claim G03.

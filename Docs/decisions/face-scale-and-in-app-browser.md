# Face-scale matrix and in-app browser harness notes

Date: 11 September 2026
Status: diagnostic evidence recorded; not a submission-readiness claim.

## What was measured

The packaged UltraFace RFB-320 detector (`createVisionDetector`, `onnxruntime-web`, WASM execution
provider, single thread) was run over one synthetic source image (`/app/assets/astronaut.png`)
rendered at fourteen square input sizes from 48 px to 320 px. Each size was drawn into a fresh
canvas and passed to the real detector.

Result: **14 of 14 sizes produced exactly one face detection**, with per-inference times between
9 ms and 20 ms and a 382 ms total wall time for the whole matrix. Raw record:
`Benchmarks/results/operations-v01/face-scale-v01.json`; rendered page:
`Benchmarks/results/operations-v01/face-scale-v01.png`.

## Why this matters

An earlier observation recorded zero face detections at an 80 px portrait alongside one detection
at 96 px, and that discrepancy was carried forward as an unresolved risk to any demo claim about
face redaction. The matrix above does not reproduce it: the detector holds a single detection at
every size tested, including 80 px. The earlier single-size reading is therefore best explained as
a measurement of that specific fixture rendering rather than a general scale floor, and it should
no longer be described as a known detector blind spot.

This is a local synthetic measurement on one source image. It is not a face-detection accuracy
benchmark, does not establish recall or precision over a population of faces, and does not by
itself authorise a demo claim about real-world face redaction coverage.

## Harness notes

The in-app browser (Codex Browser plugin) is the only browser surface used for this work, per the
operator's instruction that standalone Chrome launches disrupt their workflow.

Two constraints were found while building the harness:

1. `tab.playwright.evaluate` runs in a read-only isolated scope. Page-assigned globals such as
   `window.run` are invisible from that scope, and `fetch` is not available inside it. Harnesses
   must therefore report through DOM state (`data-*` attributes, element text) rather than through
   globals, and must be driven through real clicks on real controls.
2. Inline `<script>` blocks in a served page did not execute in this browser surface, while an
   external module loaded with `src` did. The harness was consequently split into
   `Prototype/app/face-scale-test.html` (markup only) and `Prototype/app/face-scale-test.mjs`
   (logic, loaded via `<script type="module" src="/app/face-scale-test.mjs">`), matching the
   pattern already used by `Prototype/app/index.html`.

Unrelated observation while probing the workspace page: `/app/index.html` logs
`Uncaught TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.`
That is a real defect in the prototype's workspace page and is recorded here rather than fixed
silently, because it is outside the scope of this measurement.

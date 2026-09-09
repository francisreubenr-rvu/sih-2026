# Client boundary audit — 9 September 2026

Scope: shared page agent, geometric privacy contract, local vision lifecycle and web capture cleanup. Automated checks are dependency-free DOM/runtime doubles, not native browser certification.

| Finding | Correction | Evidence |
|---|---|---|
| Document observers do not cross shadow boundaries | Discover and observe open roots; reject newly attached roots before using a scene | page-agent tests for queued shadow mutations and attachShadow |
| Reused revisions could preserve obsolete action authority | Generate a new revision for every capture; clear old scene before collection | unique-capture and failed-capture tests |
| Target meaning or size could change without an observed record | Recheck label, role, full bounds, connected/disabled/inert state | label/role/size and ancestor-state tests |
| Hit testing returned shadow host rather than actionable descendant | Descend open roots and validate composed containment; reject overlays | shadow, nested shadow and external-overlay tests |
| NaN confidence passed a threshold comparison | Validate finite scores, coordinates, shapes and thresholds before decoding | invalid-output tests |
| Rejected inference retained tensors or owned bitmaps | Dispose inputs/outputs in finally, clear resized pixels, close owned bitmap, serialize disposal | successful/failed/concurrent inference lifecycle tests |
| Web capture released screenshot canvas only on success | Clear original canvas dimensions in finally on both success and failure | source inspection; vision failure behavior separately tested |

`npm test` passes 37 tests after these changes. A subsequent embedded Chromium run performed Capture → actual Qwen Pending proposal → confirmation → recapture → actual Qwen Review proposal → confirmation and displayed **Request ready for review**. One model response was 3,105 ms. The browser automation's 3,000 ms locator timeout expired just before that response; inspection showed the real confirm button enabled and the next confirmation succeeded. This was an observation timeout, not evidence of a failed model request.

The real browser run covers the ordinary synthetic fixture only. Shadow/overlay paths above have unit evidence and still need actual browser fixtures. Chrome and Firefox unpacked-extension execution, broad PII datasets, resource distributions and prompt-injection evaluation remain open.

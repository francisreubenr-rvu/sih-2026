# ADR 001 — Reconstruct context before egress

Status: implemented v0.1, 9 September 2026. Working project name: Sightline (not a trademark or novelty claim).

## Decision

Original screenshot pixels, page URLs, field values, raw DOM and arbitrary page text never enter the external request schema. A client-side detector runs UltraFace RFB-320 via ONNX Runtime Web WASM; DOM traversal locates text, inputs, images and supported controls. The client reconstructs a wireframe with opaque private/media/field/face regions and exact-match approved labels. The same typed scene renders the preview and is sent to the server as geometric visual context.

This is semantic obfuscation, permitted in the supplied problem. It is deliberately conservative: a face-detector false negative cannot authorize original image pixels. It does not prove absolute anonymity: geometry and available controls reveal layout and task structure. There is no claim of differential privacy or protection against a compromised browser/extension.

## Alternatives and trade-offs

| Option | Benefit | Cost / reason not default |
|---|---|---|
| Original screenshot plus detected masks | Preserves visual detail | A missed name, face, canvas, closed shadow root or CSS text may escape |
| DOM text with regex replacement | Fast and useful labels | Unknown names, contextual identifiers and hidden DOM can escape |
| Full local VLM | No remote inference needed | More client memory/latency; misses requested hybrid split |
| Conservative semantic reconstruction | Small, schema-checkable egress; resilient to detector misses | Removes useful non-PII text and icons; may underperform visual-context/redaction precision |

The competition score must reflect the loss of useful content. We will compare against bounding-box redaction baselines; no present evidence establishes the best balance or benchmark saturation.

## Action boundary

The server returns an allowlisted action schema. The client binds target IDs to captured DOM element references and a random revision. Mutation/input/scroll/resize, expiry, changed target geometry, a detached or obscured target, an unknown ID, navigation or form submission rejects execution. A human reviews each action. Only click, bounded scroll and done exist; there is no arbitrary JavaScript, typing, URL or credential tool.

Thirty-second capture expiry currently includes model inference and human review. Browser testing demonstrated expiry rejection; the UI needs a visible countdown or proactive invalidation in a subsequent iteration.

## Server

Node HTTP service + Zod strict schemas + SQLite audit counts + Ollama open-weight Qwen2.5 7B. Existing local model used, no paid provider. The current LLM interprets semantic layout JSON, not image pixels. Server persistence contains only audit ID/time, model/mode, region/control counts, latency and action type; never screen contents, target labels, prompt text or tokens. SQLite is local and ignored by Git. A loopback service is sufficient for the current demonstration; public hosting requires TLS and an explicit secret/origin configuration.

Sources: [Chrome captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab), [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/), [Ollama chat API](https://docs.ollama.com/api/chat). Accessed 9 September 2026. These document capabilities; performance is measured separately on the actual build.

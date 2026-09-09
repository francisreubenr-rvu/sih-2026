# ADR 002 — UltraFace RFB-320 on local WASM

Implemented and observed in browser 9 September 2026. Runtime: pinned `onnxruntime-web@1.23.2`, single thread, packaged same-origin assets. Model and runtime hashes/licenses: `Prototype/models/manifest.json`.

Upstream model: [UltraFace](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB), commit `dffdddda9794a50607cba8f318507a28c1c27cab`, `models/onnx/version-RFB-320.onnx`, MIT license. RGB input is resized to320×240, normalized `(value−127)/128`, NCHW float32. Confidence threshold0.7 and IoU NMS0.3 are implementation settings, not measured optimums. Boxes return in original-image coordinates; extension converts screenshot pixels to CSS viewport coordinates.

The upstream ONNX export declares244 weight initializers as inputs and contains35 unused training counters. `scripts/optimize-vision-model.py` removes these metadata artifacts, preserves active weights, checks model validity and keeps the original model. The build observed one face in the NASA reference image before and after cleanup. This is an integration sanity check, not numerical equivalence across a dataset.

Single observed warm inferences ranged around10–22ms during manual checks. They are not p95 results; no benchmark target passes from these samples. The model is about1.2MB, while packaged generic WASM runtime is about11MB: model size alone understates cold-load cost. The actual manifest contains exact bytes. The runtime reports an unknown CPU-vendor warning in the embedded browser; inference still succeeds.

The model does not detect text PII. DOM traversal and conservative reconstruction exclude unknown text, fields and media independently. If model initialization or inference fails, context preparation is blocked. No fallback silently bypasses the local-vision requirement.

A dedicated-worker adapter, WebGPU comparison, multi-scale face recall, cold-load measurements, exact tensor-equivalence tests and labeled screenshot evaluation remain to be completed. Browser-specific extension testing is also pending.

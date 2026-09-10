# WebPII test100 — frozen evaluation contract

Declared 10 September 2026 before running Sightline on the sample. Baseline implementation: b7b2f33 (provider v4; shared vision/privacy unchanged from v0.1).

## Selection and scope

WebPII/webpii test split has 4,481 rows. Select 20 consecutive rows at each offset 0, 1000, 2000, 3000, and 4381, totaling 100 rows. Preserve source ID, variant, company, image dimensions and annotation fields, with source/image hashes. No replacement based on detector outcomes. This is a deterministic test slice, not a random or independently sampled population. Source variants may share a base page; report source diversity and limitations. Do not use the schema_sample_100 reviewer sample for accuracy.

Input adapter: display each released synthetic screenshot as a raster image in an isolated local fixture. Run the unchanged browser UltraFace WASM detector on its actual pixels; run shared page-agent collection on the image wrapper and reconstruct the protected scene. No ground-truth annotation is supplied to the detector or collector. No model-server request is made. This specifically tests the raster-only path, which lacks source DOM semantics; it does not estimate full native-DOM task utility.

## Frozen matching and scores

- Ground truth: visible annotations with positive clipped image-space bounds from pii_elements_json. Group by original key and element_type. This first measurement uses the PII field only; product/order/search/misc taxonomies are retained and must not silently count as non-sensitive semantics.
- Detection: confidence >=0.7, existing NMS IoU0.3. Greedy descending-confidence one-to-one matching at IoU>=0.5, ignoring class only for a clearly labeled cross-taxonomy spatial-localization diagnostic. UltraFace predicts faces; WebPII PII regions include text and images. Do not call this general PII classifier accuracy or face accuracy. Precision is null if no prediction, recall null if no ground truth. Unmatched predictions are FP; unmatched ground truth are FN.
- Reconstruction: count original image pixel area retained, sensitive-region pixel coverage and non-sensitive pixel preservation separately. A full-image opaque media mask is 100% coverage but 0% original visual preservation; it is not selective-redaction success. Measure mask union with clipped rectangles; never sum overlapping areas twice.
- Resource evidence: detector creation time; first inference separately; 10 warmups excluded; 100 timed measured image inferences; preprocessing-inclusive detect time and session.run inference time separately. Record model/runtime asset byte sizes and browser timing entries, long tasks where supported, and performance.memory where supported. JS heap is not total process or WASM/GPU memory. No CPU or energy claim from long tasks. No full-task or under-200ms guardrail pass from these component timings.
- Failures remain in the denominator, with explicit error records. Do not silently skip image decode or inference failures.

## Attribution and limitations

Primary dataset: https://huggingface.co/datasets/WebPII/webpii (root dataset card: Apache-2.0). Sample directory has separate CC-BY-4.0 metadata; this selection comes from the full test split. Synthetic-only release confirmed by https://huggingface.co/datasets/WebPII/webpii/blob/main/sample/README.md. Project https://webpii.github.io/ and paper https://arxiv.org/abs/2603.17357. Record retrieval and repository revision. Source logos/page styles identify dataset reproductions, not Sightline partnerships.

This test does not supply ground truth for useful interactive controls, task completion, broad face accuracy or privacy in arbitrary pages. The complete official metrics remain incomplete after this diagnostic. Its purpose is to quantify a concrete limitation and guide actual implementation changes.

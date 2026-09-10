# Raster-only privacy and resource evaluation

10 September 2026. This is a failure-oriented diagnostic on externally authored synthetic test screens. It is not a passing general-browser-agent benchmark.

## What was frozen

The WebPII test split, repository revision `6d3317721b72bde719a361c564ceaf1fbded3a8e`, supplied 100 rows: 20 at offsets0,1000,2000,3000,4381. The sample contains 46 source IDs and all images are Amazon UI reproductions. Full/empty/partial variants are related; do not treat 100 rows as 100 independent pages or a representative population. The root dataset card declares Apache-2.0; the reviewer sample has different metadata and was not used for these measurements. Original real-PII reproduction targets are withheld by the dataset authors; these released screens are synthetic.

The dataset viewer supplied JPEGs with the annotated natural dimensions. These are not asserted byte-identical to the images in Parquet shards. Raw annotation fields, stable source coordinates, image hashes and license cards are preserved. Temporary signed asset URLs are omitted. The initial loader named JPEG files with a .png extension; browsers decoded the actual JPEG bytes and checked dimensions. The frozen mapping is retained for reproducibility.

Read `Benchmarks/datasets/webpii-test100-contract.md` before interpreting results. No test annotation enters the detector or page-agent collector. Each screenshot is a raster image in an isolated local iframe; source DOM semantics are unavailable. The actual UltraFace model runs in the browser. No request goes to an LLM server.

## Corrected baseline

| Measurement | Observed result |
|---|---:|
| Executed cases | 100/100 |
| Visible selected PII annotations | 810 |
| Detector predictions | 0 |
| Cross-taxonomy spatial recall at IoU0.5 | 0% |
| Precision | Undefined: no predictions |
| Selected PII pixel coverage | 100% |
| Pixels outside selected PII boxes retained | 0% |
| Original image area masked | 100% |
| Exported controls | 0 |

This is exactly the privacy/utility trade-off that a coverage-only metric would conceal. All content disappears, including the useful information. UltraFace is a face detector, so this cross-taxonomy spatial diagnostic is not face accuracy or general PII classifier accuracy. The dataset does not provide the task-control ground truth needed for our control precision/recall metric. Structural metadata can still disclose context even when original pixels are excluded.

## Harness correction

The first run inherited iframe CSS with an800×500 viewport while annotations used full image dimensions. Its computed coverage fractions were invalid. The original result and invalid-marked summary remain under `webpii-raster-v01-*`. The corrected harness sets exact viewport dimensions and rejects any mismatch. Scoring independently checks the same invariant. Seven scorer tests verify overlap union, clipping, one-to-one matching and false-negative accounting. Production vision/privacy code was not changed between those runs.

## Main thread and experimental worker

Both modes use the same frozen images, model, preprocessing and thresholds. Each has ten warmups followed by100 measured cases. Warmups use the NASA reference portrait and consistently detect one face; the100 external screens produce no face predictions in both modes. The worker transfers an ImageBitmap within the browser, releases it, and returns boxes/timings. Worker failure, disposal and duplicate requests are tested. The public server protocol remains unchanged.

| Component/run | Main-thread baseline | Worker first comparison |
|---|---:|---:|
| Detector call p50 | 69.8 ms | 107.3 ms |
| Detector call p95 | 145.4 ms | 369.4 ms |
| Main-thread long tasks | 94 | 25 |
| Total long-task duration | 9046 ms | 2054 ms |

The worker reduced observed main-thread blocking but increased detection p95 in this first comparison. It remains experimental, not the web workspace default. Run order, cache state and background system scheduling confound a causal performance claim. A repeat comparison is retained separately when available. Worker JS heap readings exclude the worker's own heap; a lower main-page heap is not a total-memory reduction claim. Long tasks are not process CPU utilization. Detection timing excludes model-server reasoning and human confirmation, so it cannot pass the full-flow <200ms requirement.

The baseline reports about13.23MB of model/runtime resource bodies: 11,905,541-byte WASM plus1,257,907-byte model and70,177bytes of loader modules. Worker resource requests are not all visible in the page's resource timeline. Initialization timing is session creation in an existing browser, not clean-machine cold startup. No energy, GPU memory, total process memory or dedicated-device claim is made.

## Reproduction and next work

1. `python3 scripts/fetch-webpii-test100.py` verifies the frozen assets if present; initial acquisition needs network access.
2. `npm --prefix Prototype run build` and start the local prototype.
3. Open `/app/benchmark.html`. Run the default baseline or the explicitly labeled worker comparison with the tab visible.
4. Save the machine-readable result to a new versioned file. Never overwrite historical measurements.
5. `python3 scripts/score-raster-benchmark.py --run v02` scores the preserved baseline; use a matching new run suffix for new records.
6. `python3 -m unittest discover -s scripts/tests -v` checks the scorer; `npm --prefix Prototype test` checks implementation.

The next substantive requirement is useful, privacy-filtered visual context for raster or unknown interfaces. A selective local visual/text detector and task-utility evaluation are needed; neither a faster worker nor hiding the entire image resolves this. Broad native-DOM PII localization, independently annotated face cases, full resource profiling, native-extension validation and end-to-end task distributions remain open.

Sources: https://huggingface.co/datasets/WebPII/webpii ; https://huggingface.co/datasets/WebPII/webpii/blob/main/sample/README.md ; https://webpii.github.io/ ; https://arxiv.org/abs/2603.17357 . Source snapshots and attribution: `Raw/datasets/webpii-test100/`.

## Repeat comparison (same frozen slice)

| Run order | Mode | Detect p50 | Detect p95 | Main-thread long tasks | Total long-task duration |
|---|---|---:|---:|---:|---:|
| v02 | main | 69.8 ms | 145.4 ms | 94 | 9046 ms |
| worker-v01 | worker | 107.3 ms | 369.4 ms | 25 | 2054 ms |
| v03 | main repeat | 91.9 ms | 191.1 ms | 101 | 12288 ms |
| worker-v02 | worker repeat | 87.5 ms | 135.1 ms | 6 | 420 ms |

Each row has100 measured inferences after10 warmups. All four runs complete100/100 cases and retain the same zero-prediction/full-mask diagnostic result. Worker blocking is lower in both comparisons; p95 is not consistently better. The experiment remains available on the benchmark page; primary workspace behavior is unchanged. Repeat results do not establish saturation, a causal CPU reduction, or the full-flow latency target.

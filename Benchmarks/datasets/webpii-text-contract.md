# Frozen external OCR/PII diagnostic contract

Protocol `webpii-text-v01`, frozen before first text run on 11 September 2026. Uses all 100 existing WebPII test rows from 46 source IDs, repository revision `6d3317721b72bde719a361c564ceaf1fbded3a8e`. All are synthetic Amazon reproductions. This slice was previously used for face-only raster diagnostics and inspected; it is not independently held-out or representative.

Input listing: `Prototype/app/bench-assets/webpii-test100/text-inputs.json`, stripped of PII/utility annotations. The browser verifies each image SHA-256 and natural dimensions before OCR. Policy and model hashes are frozen in `Benchmarks/results/webpii-text-v01-protocol.json`. No benchmark annotation enters OCR/NER or the privacy policy. No reasoning server is called. Three existing authored development screens warm the engine before the 100 ordered measured rows.

## Scoring fixed before results

- Score visible positive-area text/input annotation values. Exclude images, absent values, non-visible and out-of-frame boxes; count exclusions. Expected values may include text not actually painted, including password/masked/clipped contents. Therefore call this annotated-value recovery, not pure OCR recall.
- Normalize using Unicode NFKC, casefold and alphanumeric token runs. Group the same key and normalized value across multiple line boxes; this collapses repeated identical occurrences and is not instance recall. Match tokens exactly, with multiplicity; no fuzzy correction.
- Associate an OCR word only when at least 50% of its own area intersects the union of the group's boxes. Score each group independently; overlapping annotations may double-count. Count geometry-only associated words separately, once per screen.
- `recognized_tokens` counts expected exact tokens found at their geometry. `pii_marked_tokens` requires the local sensitive flag. `retained_tokens` requires flag false and OCR confidence at least 70, matching the preview's intended redraw. `withheld_recognized_tokens = recognized - retained`; this includes low-confidence withholding and must not be called detector recall.
- Exact retained tokens are a lower-bound exposure indicator. Misread tokens can still disclose PII; also count retained words inside PII geometry without requiring a text match. Neither verifies actual canvas pixels or outbound leakage. Failed/missing screens have unknown exposure, not zero exposure proof.
- Utility proxy includes only allowlisted product name/brand/price/quantity/rating/breadcrumb/description/size text, excluding groups that overlap any visible PII box. Order/search/misc are not assumed safe. Product text itself is not universally public. Report recovered and retained expected tokens plus product tokens incorrectly marked sensitive under this declared proxy.
- Precision proxy uses marked exact PII tokens divided by marked exact PII plus marked eligible product tokens. Predictions outside those annotations are unscored, so this is not global PII precision or an official metric.
- Every frozen row remains in the denominator, including missing and failed cases. Reject duplicate/unknown rows, wrong dataset/source/variant/dimensions/image hash, malformed words and nonfinite timing. Failed cases earn zero recovery or withholding credit. Report their unknown exposure separately.
- Report successful-screen p50/p95/max OCR, NER and combined inference using nearest-rank percentiles, with count/failures. Initialization, warmups, decoding, UI redraw and model-server time are separate. No full-task latency claim.
- Record main-page JS heap and long tasks only as limited diagnostics, excluding worker/process memory and CPU/energy. Sample ordering/cache/scheduling confound comparisons.

## Reproduction

Build the prototype and open `/app/text-benchmark.html`. Run once, save the complete displayed JSON as a new file, then run `python3 scripts/score-text-benchmark.py --input Benchmarks/results/webpii-text-v01.json --output Benchmarks/results/webpii-text-v01-summary.json`. Output creation is exclusive. Freeze a new protocol/version before changing thresholds; preserve all prior results. Run `python3 -m unittest discover -s scripts/tests -v` for independent scorer checks.

This experiment evaluates the current policy's limits. It cannot approve export, demonstrate arbitrary-site tasks, certify native extension behavior, or produce an official weighted SIH score.

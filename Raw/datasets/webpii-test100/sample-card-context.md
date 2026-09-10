---
license: cc-by-4.0
pretty_name: WebPII Reviewer Sample
---

# WebPII Reviewer Sample

This directory is a compact reviewer-facing sample for the full WebPII dataset. The full dataset remains in the parent Hugging Face dataset repository.

## Files

- `webpii_visual_samples.zip`: representative rendered UI examples from the public WebPII project viewer, including PNG variants and per-example `metadata.json` annotation files. This archive contains 28 sample pages, 132 PNG files, and 28 metadata files across 10 companies and 11 page types.
- `schema_sample_100.parquet`: a 100-row Parquet sample with the same schema as the released dataset shards. This is intended for checking loaders and annotation fields, not for estimating benchmark statistics.
- `sample_manifest.json`: machine-readable summary of the sample contents.

## What This Sample Supports

Reviewers can inspect rendered UI quality, filled/partial/empty variants where available, clean counterparts, and the annotation JSON used by the project viewer. The Parquet sample supports quick validation that dataset-loading code can read the released image and annotation columns without downloading the full multi-GB dataset.

## Privacy Note

The original website screenshots used as UI reproduction targets are withheld because they may contain real PII. The released code supports rerunning synthetic PII generation, annotation, benchmark conversion, and baselines from the released React reproductions and dataset artifacts, but not the private source-screenshot collection/reproduction-target step.

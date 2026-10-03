# Dhristi · SIH26171

Browser-local visual perception and protected-context reasoning for the ISRO Smart India Hackathon statement. Built for the RV University six-person CSE team: Gopreet, Hiranmayi, Varun, Koushaik, Francis and Niharika.

**Engineering candidate, not submission ready** (`Benchmarks/release-status.json`: G11 fail, `submission_ready` false). The supplied full statement and official catalogue resolve the original SIH2171 shorthand to SIH26171. Working deadline: 16 October 2026 (a team date, not a verified SIH date).

[Project website](https://francisreubenr-rvu.github.io/sih-2026/) · [Run the prototype](Prototype/README.md) · [Current plan](PLAN.md) · [Readiness ledger](Benchmarks/release-status.json)

## What works

Actual local UltraFace/ONNX WASM inference, strict protected-scene construction, authenticated Node API, reviewed revision-bound actions, and metadata-only SQLite persistence in the Prototype; its Qwen2.5-through-Ollama planner was last run live on 11 September and is skipped in CI. The Warden line plans with Groq by default and keeps local Ollama only as the offline mode. The real browser fixture reached **Request ready for review** after Pending and Review confirmations. Test suites run in CI on every change (`.github/workflows/`); current counts are in the latest checkpoint in `CONTEXT.md`, not here, so this page cannot drift from them. End-to-end on the real extension with a real Warden (GLiNER on CPU) and the real Groq planner: 48 cloud requests across five runs held 0 personal values; after two fixes found by those runs, 3 of 3 runs finished the task in 3 to 4 steps, with each planner round trip 325 to 1219 ms (`Benchmarks/results/e2e-v5-boundary-v02.json`; the earlier fake-planner run is `e2e-v5-boundary-v01.json`). The v5 architecture puts redaction on the device and planning in the cloud (`Docs/decisions/brain-v5-local-redaction-cloud-planner.md`). Local Lighthouse dhristi-v03 on the current site (3 October, six runs): mobile performance **98**, desktop performance **100**, accessibility/best-practices/SEO **100** on both profiles.

The website is hosted on GitHub Pages; the Node/Ollama prototype runs locally. Pages cannot run its backend. Use the explicit setup instructions before opening localhost.

## Deliverables

| Area | Start here |
|---|---|
| Research and raw attribution | [Wiki](Wiki/source-index.md), [official problem](Wiki/problem-statement.md), [domain sources](Raw/domain-sources.json) |
| Implementation and API | [Prototype README](Prototype/README.md), [OpenAPI](Docs/openapi.json) |
| Guardrails and measurements | [Guardrails](Guardrails/guardrails.json), [official rubric](Benchmarks/official-rubric.json), [browser evidence](Benchmarks/results/prototype-v01-browser.json) |
| Supplied-format presentation | [Six-slide PPTX](Docs/submission-deck.pptx), [PDF](Docs/submission-deck.pdf) |
| Technical talk | [15-slide PPTX](Docs/pitch-deck.pptx), [PDF](Docs/pitch-deck.pdf), [speaker notes](Docs/pitch-speaker-notes.md) |
| Reusable template | [POTX](Docs/dhristi-template.potx); open it, replace placeholders, save a new PPTX |
| Design and methodology | [Design comparison](Docs/design-comparison.md), [process documentation](Docs/process-documentation.md), [client audit](Docs/decisions/client-audit.md) |
| Earlier Prototype popup (history) | [Wave 3 package](Docs/dhristi-extension-v01.zip): the September popup, not the current side panel. The current extension is the root `extension/` below. |
| Warden side panel (Option C import) | Load unpacked **root** [`extension/`](extension/README.md). Do not load `Prototype/extension/` as Warden. Server: [`warden/`](warden/README.md) on `127.0.0.1:8756`. |

## Limits that remain open

The full-flow under-200 ms target fails: model responses currently take seconds. Native Chrome/Firefox execution, held-out PII/redaction/utility evaluation, client-resource distributions, continuous demo recording, independent user/judge review, and benchmark saturation remain unverified. Registered team details and authentic consented portraits are absent; roles are proposed. No anonymity guarantee, calibrated winning probability, achieved social impact or competition readiness is claimed.

Historical preparation artifacts are retained with their original scope in [the earlier README](Docs/README-preparation-history.md) and [process history](Docs/process-preparation-history.md). They are not current implementation evidence.

## Reproduce checks

```sh
cd Prototype
npm ci
npm test
npm run build
npm run build:extension
```

Warden unit tests (no model weights or Ollama needed; `node` must be on PATH for the regex-parity tests):

```sh
python -m pip install -r warden/requirements-test.txt
cd warden && python -m pytest -rs test_warden.py test_pii_layers.py
```

From the repository root, serve Website on port 4173 and run `python3 scripts/run_lighthouse.py --label dhristi-v01` for new local measurements. `python3 scripts/check_release.py` deliberately returns a nonzero exit while mandatory gates fail or remain unknown; `--dry-run` prints the ledger (with per-gate evidence freshness) without rewriting `Benchmarks/release-status.json`. GitHub Actions publishes only Website when master receives a website change.

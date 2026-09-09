# Sightline · SIH26171

Browser-local visual perception and protected-context reasoning for the ISRO Smart India Hackathon statement. Built for the RV University six-person CSE team: Gopreet, Hiranmayi, Varun, Koushaik, Francis and Niharika.

**Engineering candidate v0.1 — not submission ready.** The supplied full statement and official catalogue resolve the original SIH2171 shorthand to SIH26171. Internal target: 11 September 2026.

[Project website](https://francisreubenr-rvu.github.io/sih-2026/) · [Run the prototype](Prototype/README.md) · [Current plan](PLAN.md) · [Readiness ledger](Benchmarks/release-status.json)

## What works

Actual local UltraFace/ONNX WASM inference, strict protected-scene construction, authenticated Node API, Qwen2.5 reasoning through Ollama, reviewed revision-bound actions, and metadata-only SQLite persistence. The real browser fixture reached **Request ready for review** after Pending and Review confirmations. Thirty-seven automated tests pass. The static website scored 100 in all four categories across six local Lighthouse runs.

The website is hosted on GitHub Pages; the Node/Ollama prototype runs locally. Pages cannot run its backend. Use the explicit setup instructions before opening localhost.

## Deliverables

| Area | Start here |
|---|---|
| Research and raw attribution | [Wiki](Wiki/source-index.md), [official problem](Wiki/problem-statement.md), [domain sources](Raw/domain-sources.json) |
| Implementation and API | [Prototype README](Prototype/README.md), [OpenAPI](Docs/openapi.json) |
| Guardrails and measurements | [Guardrails](Guardrails/guardrails.json), [official rubric](Benchmarks/official-rubric.json), [browser evidence](Benchmarks/results/prototype-v01-browser.json) |
| Supplied-format presentation | [Six-slide PPTX](Docs/submission-deck.pptx), [PDF](Docs/submission-deck.pdf) |
| Technical talk | [15-slide PPTX](Docs/pitch-deck.pptx), [PDF](Docs/pitch-deck.pdf), [speaker notes](Docs/pitch-speaker-notes.md) |
| Reusable template | [POTX](Docs/sightline-template.potx); open it, replace placeholders, save a new PPTX |
| Design and methodology | [Design comparison](Docs/design-comparison.md), [process documentation](Docs/process-documentation.md), [client audit](Docs/decisions/client-audit.md) |
| Native extension candidate | [Unpacked test package](Docs/sightline-extension-v01.zip) |

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

From the repository root, serve Website on port 4173 and run `python3 scripts/run_lighthouse.py --label sightline-v01` for new local measurements. `python3 scripts/check_release.py` deliberately returns a nonzero exit while mandatory gates fail or remain unknown. GitHub Actions publishes only Website when master receives a website change.

# Sightline delivery scope (SIH26171)

## In scope for the engineering candidate

- One bounded synthetic service-desk / Earth-observation style journey.
- On-device face CV (UltraFace) + DOM allow-listed controls + opaque region kinds.
- Selective local redaction preview; semantics-only egress.
- Local open-weight planner when Ollama is available; privacy-only mode when not.
- Chromium MV3 packaging (+ Firefox package build); harness evidence for Chromium.
- Honest benchmarks: held-out synthetic fixtures, WebPII diagnostics (failures retained), latency gate **fail** until measured otherwise.

## Out of scope before submission_ready

- Real-user screens without authorization.
- Claiming official rubric saturation or jury scores.
- Weakening G11 (&lt;200 ms full-flow).
- Fabricated team photos, deployments, or participant studies.
- Cloud LLM keys as a product dependency.

## Six-person ceiling

Team of six CSE students (proposed roles). Architecture stays within: 1 journey, 2 services, 1 SQLite store, 1 optional local model provider — see `Docs/architecture.md`.

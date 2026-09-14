# Dhristi architecture (SIH26171)

Status: engineering candidate v0.1. Bound to a single primary user journey.

## Primary user journey

1. Operator opens a synthetic (or authorized) page and activates Dhristi from the **toolbar** (activeTab).
2. Local capture → UltraFace WASM + DOM regions → selective/wireframe preview (local only).
3. `assertSanitizedPayload` builds a semantics-only scene (controls, geometry, region kinds).
4. **Privacy-only mode** stops at human review (no network). **Planner-assisted mode** sends the scene to a local Ollama/Qwen process, then requires explicit confirm before a bounded click/scroll/done.

## Services (≤2)

| Service | Role |
|---------|------|
| Browser client (web workspace + MV3 extension) | Capture, vision, redaction preview, sanitization, action execution |
| Node prototype server (`127.0.0.1:9041`) | Zod-validated plan API, optional local-reference API, SQLite audit counts |

## Data stores (≤1 primary)

- SQLite audit DB under `Prototype/data/` (gitignored): timings, counts, model id, action type — **no screen/prompt/token contents**.

## Optional external provider (≤1)

- Local **Ollama** hosting open-weight Qwen2.5 (ports 11434 default / 11436 optional). Not a mandatory cloud API. Unreachable in Wave 4 CI — planner E2E skipped honestly.

## Non-goals this release

- Custom model training, specialized accelerators, multi-tenant production auth, store distribution, WebPII-grade saturation claims.

## Evidence pointers

- `CONTEXT.md`, `Prototype/README.md`, `Docs/decisions/wave4-latency-strategy.md`
- Extension loop: `Benchmarks/results/extension-loop-v01.json`

# G11 Option C Warden latency harness

Measurement only. This does not flip G11 and does not set `submission_ready`.

Frozen core: root `extension/` talking to Warden at `http://127.0.0.1:8756`, stages PERCEIVE → STRIP → PLAN → VALIDATE → EXECUTE, with client `opTierLocal` before unattended EXECUTE.

Not this surface: `Prototype/extension`, Prototype port `9041`, privacy-only / skip-LLM.

## What it writes

- `Benchmarks/results/core-latency-warden-option-c.json` (schema v1)
- `Benchmarks/results/fixtures/g11-warden-option-c-precondition-fail.json` on `--dry-run` (config rejections, not timings)

`Benchmarks/results/core-latency.json` is the historical Wave 7 ledger. The harness refuses that path.

`budgetMs` is 200. The harness exits with an error if a config tries to change it. `budget_weakened` stays false.

Exit 0 means a valid JSON artifact was written, including when `gate.status` is `fail`. A non-zero exit means the harness or a live precondition failed, and no pass file is written.

## Dry run (no Warden, no Ollama)

```bash
node scripts/g11-warden-option-c-harness.mjs --dry-run
```

The dry run does not invent milliseconds. Stage clocks that were not collected stay null. L2 `n` is 0 and the gate stays fail.

## Live L2

Start Ollama so it is listening on `127.0.0.1:11434`, then start Warden on `127.0.0.1:8756` (see `warden/README.md`). Load **root** `extension/` as the only extension under test.

```bash
G11_EXTENSION_LIVE=1 node scripts/g11-warden-option-c-harness.mjs --live --lane L2_full_core
```

Preconditions, all required:

1. `GET http://127.0.0.1:8756/health` returns `ok: true`.
2. The origin is exactly `http://127.0.0.1:8756`.
3. The extension path is root `extension/`.
4. `budgetMs` is 200 and `f17.requireOpTierLocal` is true.
5. At least one absolute page URL is configured. The default is the synthetic file `Benchmarks/fixtures/g11-option-c-page.html`.
6. A `POST /plan` probe labels the planner.

Planner labels:

| Label | When |
|---|---|
| `ollama` / `ollama@127.0.0.1:11434` | `/plan` itself was served by local Ollama |
| `groq` / `groq` | `/plan` still uses the imported Groq path, including "Groq is not configured" |
| `unknown` / `unverified` | The probe could not tell. L2 is not gate-eligible |

Ollama used only by `/validate` does not set `ollama`. After PR #32, `POST /plan` defaults to loopback Ollama, so a live probe should come back `ollama` when that call is actually served by `127.0.0.1:11434`. `groq` is only when `WARDEN_PLANNER=groq` and `/plan` still takes that path.

`G11_EXTENSION_LIVE=1` loads root `extension/` in Chromium and reads `GET_G11_TRACE` (exclusive spans around the real service-worker stages, plus F17). Those are the only milliseconds that can enter the L2 gate. If a stage did not run, the artifact stores null and a reason.

L2 gate inclusion requires, on each counted attempt: extension clock source, every stage a finite number, `f17.ok`, terminal `ok`, planner label `ollama` or `groq`, and not a warmup. Warmups default to 10 and are discarded. Gate eligibility needs n≥100 of those attempts and p95 total &lt; 200 ms. Anything short of that stays fail.

An attempt that bypasses `opTierLocal` is logged and removed from the L2 aggregate.

Privacy-only runs use `--privacy-only`. That forces lane `L0_strip_local` and sets `mayFlipG11` false on every lane.

## Checks

```bash
node --test scripts/g11-warden-option-c-harness.test.mjs
```

Architect notes on this branch: `Docs/decisions/brain-arch-g11-option-c-measure.md` and `Docs/decisions/brain-arch-g11-harness-interface.md`.

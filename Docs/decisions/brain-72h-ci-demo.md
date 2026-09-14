# Brain 72h — Ollama-free CI + toolbar capture evidence path

**Date:** 2026-09-14  
**Branch:** `brain/72h-claims-honesty` / PR #5  
**Scope:** CI honesty + human toolbar Capture & protect protocol. **Do not claim G03 pass.** G11 stays fail. `submission_ready` stays false.

## GOAL A — Ollama-free CI

### Facts

- `Prototype/tests/*.test.mjs` already inject **test-double** providers:
  - `createApp({ infer: async () => ({ …, mode: 'test-only' }) })` (see `server.test.mjs`, local-reference tests).
  - `ollamaProvider({ fetchImpl: … })` stubs HTTP; never hits a live daemon.
- Wave 6/7 **load soak** scripts use the same pattern (`infer: … model: 'load-double'` in `scripts/wave6-load-notes.mjs`, `scripts/wave7-load-notes.mjs`). Soak is a local capacity harness, not part of PR CI.
- Live Ollama planner E2E remains **optional / skipped** when ports 11434/11436 are unreachable (`Benchmarks/results/wave*-ollama-planner-status-v01.json`).

### Wiring

| Entry | Behavior |
|-------|----------|
| `cd Prototype && npm test` | Node built-in test runner; doubles only |
| `cd Prototype && npm run test:ci` | Same tests with `OLLAMA_URL=http://127.0.0.1:9` + `DHRISTI_CI=1` so accidental live planner calls fail fast |
| `.github/workflows/prototype-test.yml` | checkout → setup-node 22 → `npm ci` → `npm run test:ci` — **no Ollama service** |

### Explicit non-goals

- No Ollama container / service in GitHub Actions.
- No fabricated planner latency or G11 flip from CI.
- Soak (`wave7-load-notes.mjs`) stays manual/local; not required on PR.

## GOAL B — Toolbar capture evidence (documentation only)

- Protocol: `Docs/demo-toolbar-capture-protocol.md` — human production Chrome toolbar **Capture & protect** (privacy-only Fast path).
- First-run log stub: `Benchmarks/results/toolbar-capture-log-v01.json` — **empty fields**, `status: not_run`, **not** a G03 pass.
- Runbook / Prototype README point at the protocol.
- Automation harnesses (`validate-extension-*.mjs`) still use temporary overlay; they **must not** be cited as toolbar-glyph proof.

## Policy reminders

- No purchases. No Google login required for this path.
- No G11 weaken. No `submission_ready`. No fabricated human evals.

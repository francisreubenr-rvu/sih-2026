# Cloud models and Jev: what can replace a local model, measured

**Date:** 29 September 2026
**Asked by:** Francis, 29 September 2026: use the Groq, OpenCode and Jev keys, and test whether they (and "Layla") can replace our local models or be used somewhere.
**Status:** measurements and a recommendation. No planner default, gate or ledger status was changed by this note.

## Keys, as found in this container

| Key | Result |
|---|---|
| `GROQ_API_KEY` | Works. Account sees `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` among others. Free-tier rate limits return HTTP 429 under sustained load. |
| `JEV_API_KEY` | Works against TypeSafe's direct API (`https://api.typesafe.ai/v1/systemone`), served model `jev-1.13.0`. Not an OpenRouter key. |
| `OPENROUTER_API_KEY` | The variable holds three whitespace-separated words; only the last is a valid OpenRouter key. Fix the variable to hold just the key. `scripts/cloud-models/bench.py` tolerates the extra words. |
| OpenCode | No key present. None of the three words in `OPENROUTER_API_KEY` authenticates against OpenCode Zen. |
| "Layla" | No model or provider of that name on OpenRouter's or OpenCode Zen's model lists, and none in TypeSafe's public docs. Not tested. Needs a link or an ID. |

Jev is not an LLM. It is TypeSafe's "System One" decision model: it takes state plus typed questions (`choice`, yes/no `noul`, `score`) and returns an answer with probabilities. It cannot generate or extract text.

## Which local models could move

| Local model | Where it runs | Sees | Move to cloud? |
|---|---|---|---|
| GLiNER `urchade/gliner_multi_pii-v1` | Warden `/strip` | Raw page text and task | **No.** It is the redaction layer. Sending its input to any cloud model sends the personal data the product exists to keep local. |
| UltraFace RFB320 | Browser (Prototype) | Raw pixels | **No**, same reason. |
| Ollama planner (`qwythos-9b`) | Warden `/plan` when `WARDEN_PLANNER=ollama` | Tokenized text | Already replaced: Groq is the default since v5. Ollama stays as the offline mode. |
| Ollama reviewer | Warden `/validate` | Tokenized text | Not in the live loop since v5 (the extension checks plans itself). If it comes back, **Jev** is the measured replacement (below). |
| Qwen2.5 via Ollama | Prototype server, port 9041 | Protected scene | Measurement/demo surface only; not tested here. |

## Measured (synthetic, already-tokenized cases; `scripts/cloud-models/cases.py`)

Twelve planner cases and six reviewer cases, run through the Warden's own prompt and validator. Latency is wall-clock from a cloud container (location not verified) through an egress proxy, including network time. It is not G11.

### Planner (`/plan`)

| Candidate | Correct / valid answers | p50 ms | p95 ms | Source |
|---|---|---|---|---|
| Jev `jev-latest` (choice over allowed actions) | 55 / 60 | 191 | 234 | bench v01 |
| Groq `qwen/qwen3.8-27b` | 36 / 36 | 342 | 757 | groq v02 |
| Groq `openai/gpt-oss-20b` (current default) | 31 / 31 | 615 | 1119 | groq v02 |
| Groq `openai/gpt-oss-120b` | 36 / 36 | 760 | 1331 | groq v02 |
| OpenRouter `deepseek/deepseek-v4.1-flash` | 60 / 60 | 2093 | 37194 | bench v01 |
| OpenRouter `google/gemini-3.8-flash` | 60 / 60 | 2716 | 5061 | bench v01 |
| OpenRouter `qwen/qwen3.8-flash` | 59 / 60 | 4276 | 6953 | bench v01 |

- All five Jev misses are `search-free-text`, which needs a typed value that is not a vault token. A choice model cannot produce one. Jev gave each of those wrong answers with confidence 1.0, so **a confidence threshold does not catch this failure**. The case has to be routed away before Jev is asked.
- Before the STATUS/finish fix (commit `dd5d6fd`), gpt-oss-20b answered `click #save` on `account-finish` in 4 of 4 valid calls. After it, it answered `finish` in 3 of 3. This is the same loop the first real end-to-end run hit (`e2e-v5-boundary-v02.json`, run1).
- Groq 429s: in bench v01 most Groq rows were rate-limit errors, because the bench overlapped the end-to-end runs on the same key. Sequential with 2.5 s between calls (groq v02), gpt-oss-20b still took 4 429s in 36 calls. A demo that drives several runs back to back on a free key will hit this. The fallback chain absorbed it in the end-to-end run.

### Reviewer (the old `/validate` stage)

| Candidate | Correct verdicts | p50 ms | p95 ms |
|---|---|---|---|
| Jev (`noul`: "does the action plainly conflict with the task?") | 30 / 30 | 194 | 323 |
| Groq `openai/gpt-oss-20b` (Warden's own review prompt) | 18 / 18 (groq v02) | 453 | 715 |
| OpenRouter `google/gemini-3.8-flash` | 30 / 30 | 2367 | 4023 |
| Local Ollama `qwythos-9b` (for reference, not rerun) | 0 wrong of 24 (warden/ollama_client.py note) | cold start 26.8 s | |

## Recommendation

1. **Keep GLiNER and UltraFace local.** Not a latency question; it is the privacy boundary.
2. **Planner model: try `qwen/qwen3.8-27b` first in the Groq chain.** It was correct on every valid answer and about 1.8× faster at p50 than gpt-oss-20b. Set `GROQ_MODEL_CHAIN=qwen/qwen3.8-27b,openai/gpt-oss-20b,openai/gpt-oss-120b` in `warden/.env` to try it; the default stays until Francis picks. Bench v01 also recorded a "Request too large" 429 for qwen on this free tier under load.
3. **Jev as a fast path, not a replacement.** A hybrid planner could ask Jev first when every value the task needs is a vault token, and ask the LLM otherwise. At about 190 ms that is the only candidate near the 200 ms G11 budget for the planner alone, and G11 covers the full flow, so this alone does not pass G11. It needs its own end-to-end measurement before any claim. Not built in this change.
4. **OpenRouter as a third-provider fallback only.** Always valid in these runs, but 2 to 4 s at p50 with a 37 s tail. Useful when Groq is rate-limited, not as the default.
5. **If `/validate` review returns to the loop, use Jev**, not Ollama: same verdicts on these cases in under 1% of Ollama's cold-start time, and it sees only tokenized text.

## Evidence

- `Benchmarks/results/cloud-model-bench-v01.json`: all providers, 5 reps (pre-fix prompt; see its `caveats`).
- `Benchmarks/results/cloud-model-bench-groq-v02.json`: Groq only, 3 reps, fixed prompt, sequential.
- `Benchmarks/results/e2e-v5-boundary-v02.json`: real extension + Warden + real Groq, 48 cloud requests, 0 personal values.
- Harness: `scripts/cloud-models/bench.py`, `scripts/cloud-models/cases.py`, `scripts/e2e-v5/recording-relay.mjs`.

## Not changed

G11 **fail**, G20 **paused**, `submission_ready` **false**. The planner default is still `openai/gpt-oss-20b` first. No Jev or OpenRouter code path was added to the Warden.

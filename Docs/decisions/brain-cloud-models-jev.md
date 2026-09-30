# Cloud models and Jev: what can replace a local model, measured

**Date:** 29 September 2026; fast path and Laya added 30 September 2026
**Asked by:** Francis, 29 September 2026: use the Groq, OpenCode and Jev keys, and test whether they (and "Layla") can replace our local models or be used somewhere.
**Status:** 29 September: measurements and recommendations only. 30 September (Francis): Qwen first in the Groq chain, and the Jev fast path built and measured, in "30 September" below. No gate or ledger status changed.

## Keys, as found in this container

| Key | Result |
|---|---|
| `GROQ_API_KEY` | Works. Account sees `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` among others. Free-tier rate limits return HTTP 429 under sustained load. |
| `JEV_API_KEY` | Works against TypeSafe's direct API (`https://api.typesafe.ai/v1/systemone`), served model `jev-1.13.0`. Not an OpenRouter key. |
| `OPENROUTER_API_KEY` | The variable holds three whitespace-separated words; only the last is a valid OpenRouter key. Fix the variable to hold just the key. `scripts/cloud-models/bench.py` tolerates the extra words. |
| OpenCode | No key present. None of the three words in `OPENROUTER_API_KEY` authenticates against OpenCode Zen. |
| "Layla" | Not found under that name on 29 September. Francis meant **Laya**, `convaiinnovations/laya` on Hugging Face: tested 30 September, below. |

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
2. **(Done 30 September.) Planner model: try `qwen/qwen3.8-27b` first in the Groq chain.** It was correct on every valid answer and about 1.8× faster at p50 than gpt-oss-20b. Set `GROQ_MODEL_CHAIN=qwen/qwen3.8-27b,openai/gpt-oss-20b,openai/gpt-oss-120b` in `warden/.env` to try it; the default stays until Francis picks. Bench v01 also recorded a "Request too large" 429 for qwen on this free tier under load.
3. **(Built 30 September; see below.) Jev as a fast path, not a replacement.** A hybrid planner could ask Jev first when every value the task needs is a vault token, and ask the LLM otherwise. At about 190 ms that is the only candidate near the 200 ms G11 budget for the planner alone, and G11 covers the full flow, so this alone does not pass G11. It needs its own end-to-end measurement before any claim. Not built in this change.
4. **OpenRouter as a third-provider fallback only.** Always valid in these runs, but 2 to 4 s at p50 with a 37 s tail. Useful when Groq is rate-limited, not as the default.
5. **If `/validate` review returns to the loop, use Jev**, not Ollama: same verdicts on these cases in under 1% of Ollama's cold-start time, and it sees only tokenized text.

## 30 September: Qwen first, temperature 0, fast path built, Laya tested

### Groq chain and temperature

- The default chain is now `qwen/qwen3.8-27b,openai/gpt-oss-20b,openai/gpt-oss-120b` (re-probed; all three answer on this account).
- **Correction to 29 September.** The Qwen-over-gpt-oss ranking above came from calls at temperature 0 with no `response_format`. The Warden sent `response_format: json_object` and no temperature, so Groq sampled at its default temperature. Under the Warden's real settings the same model answered the same scene differently between runs: Qwen chose `click #email` instead of `type #email EMAIL#1` on `account-type-email` in one run (fastpath-bench-v01) and the right answer in the next (groq-settings-bench-v01). The Warden now sends `temperature: 0`, which is the setting the ranking was measured under and what the Ollama path already used.
- The settings comparison itself (`groq-settings-bench-v01.json`) is **inconclusive**: this free-tier key hit its rate limit: 61 of 168 calls came back 429 ("Rate limit reached" and "Request too large") and one 400. On the answers that did come back: Qwen default 36/40, Qwen temperature 0 23/24, gpt-oss-20b default 24/26, gpt-oss-20b temperature 0 15/16. Re-run it when the quota resets before claiming either model is better.

### Fast path (`warden/fastpath.py`, `WARDEN_FAST_PATH=jev|laya`)

For each step it lists the actions the scene allows (click each control, type each task token into each field, finish, or "none of these") and asks one yes/no question in the same call: does the task need typed text that is not a token? It hands the step to the LLM when the model picks "none of these", says free text is needed, or gives the chosen action a probability under `WARDEN_FAST_PATH_MIN_CONFIDENCE` (default 0.9). It runs after the egress guard on the same sanitized body; a backend error falls through to the LLM; a cloud fast path (Jev) is skipped when `WARDEN_PLANNER=ollama`. `/health` and every `/plan` response carry a `fastPath` record. Eleven Warden tests cover it.

Accuracy, `Benchmarks/results/fastpath-bench-v01.json`, 3 reps per case. "Held-out" is 30 cases written after the fast path was designed (`scripts/cloud-models/cases_heldout.py`), 4 of them needing free text; "design" is the 12 cases above.

| Backend | Split | Steps it answered at 0.9 | Correct when it answered | Free-text steps it answered | p50 ms |
|---|---|---|---|---|---|
| Jev (cloud) | held-out | 39 / 89 (44%) | 39 / 39 | 0 | 590 |
| Jev (cloud) | design | 19 / 33 (58%) | 19 / 19 | 0 | 604 |
| Laya (local CPU) | held-out | 0 / 90 | n/a | 0 | 847 |
| Laya (local CPU) | design | 0 / 33 | n/a | 0 | 585 |

- Jev stayed 100% precise at every threshold from 0.5 to 0.99 on both splits; lowering it to 0.5 raises held-out coverage to 45/89 with no wrong answer. One Jev call timed out at the 5 s client limit; the LLM would have answered that step.
- Jev's p50 in this bench (about 600 ms) is higher than on 29 September (191 ms) because each call now carries two questions and the page text. In the real extension loop (`e2e-v5-boundary-v03.json`) Jev answered 12 of 12 steps in 173 to 752 ms, median about 236 ms, and Groq was never called. Groq's median in the same loop on 29 September was 732 ms.
- Where Jev answered, it was never wrong. Overall accuracy with the fast path was 0.933 on held-out (the same as the LLM chain alone) and 0.818 on design against 0.727 for the LLM alone, because in that run the LLM clicked fields it should have typed into (`account-type-email`, `phone-type`, `two-fields-first`) and Jev answered some of those steps correctly first (2 of 3 reps and 1 of 3 reps; on `phone-type` it deferred every time).
- What limits coverage is the free-text question, not the choice: on token-only steps Jev's "free text needed" probability sat near the 0.5 cut (0.45 to 0.58 on those three cases), so similar steps went either way. Rewording that question, or asking it once per task instead of per step, is the next thing to try; it was not tuned here to keep the held-out set honest.

### Laya (`convaiinnovations/laya`)

Laya is an open-weight (Apache-2.0) decision model with the same interface as Jev (state plus typed questions, calibrated probabilities), run on this machine: ModernBERT-large, 421M parameters, a 0.8 GB English checkpoint, `pip install laya`.

- On this container's CPU (4 cores, no GPU) it answered a short question in about 170 ms after loading, and the planner questions in 585 to 847 ms p50. The model card's 33 ms is for a GPU.
- Zero-shot it is not usable as a planner here. Its top choice was right on 33% (held-out) to 55% (design) of steps, and it answered "free text is needed" on every one of 123 steps, so the fast path deferred all of them and Laya only added its own time. That gate is what kept it safe: with the gate removed, at 0.9 it would have acted on 6 held-out steps and been wrong on all 6. Its confidence is not calibrated for this task zero-shot.
- Its value is that it would keep the fast path **on the device**. Its card reports that fine-tuning on domain decisions (their `laya-typed-decisions` checkpoint) roughly doubled accuracy on their benchmark (0.362 to 0.766); that is their number, not ours. Fine-tuning it on Dhristi's action choices is the step that would make a local fast path real.

### Fine-tuning Laya (30 September, Francis: "go forward on training Laya")

Pipeline: `scripts/laya-finetune/` (data generator, CPU/GPU trainer ported from the authors' notebook, `diagnose.py`, `kaggle_train.ipynb`). Training data is 900 synthetic steps from domains and labels disjoint from both evaluation sets (the generator reports the overlap; it is empty).

| Run | What changed | Fit on its own training steps (choice) | Held-out top choice | Used at 0.9 |
|---|---|---|---|---|
| zero-shot | none | base model 24/120 | 33% | 0/90 |
| zero-shot, compact keys | option format only | n/a | 37% | 0/30 |
| v1 (CPU, top 6 layers, 2 epochs) | trained on verbose keys | 6/60 via `laya.Agent` | 33% | 0/90 |
| v2 (CPU, top 6 layers, 2 epochs) | compact keys | 29/120 via training path | 33% | 0/90 |

- v1 failed on my setup: Laya keeps about 12 tokens of each option, the long keys cut off the field label, and in 61 of 200 training steps several options rendered identically. `fastpath.option_table(compact=True)` fixes that for Laya (0 of 200 collapse); Jev keeps the format it was measured with.
- v2 underfit too (29/120 on its own training steps against 24/120 before training). Training only the top 6 of 28 layers for about 200 optimizer updates on a 4-core CPU is not enough; the authors' recipe trains the whole encoder for 4 epochs on about 6,000 decisions, which is roughly 27 hours on this CPU and minutes on a GPU.
- **v2 is less safe than zero-shot.** Its free-text answer collapsed to "no" on every step (the training set is 12% free-text steps), so the gate that kept zero-shot Laya from acting on free-text steps no longer fires. At the default 0.9 it acts on nothing (highest confidence 0.79); at 0.5 it would act on 9 held-out steps and be wrong on 6, including a free-text rename. Do not deploy v2, and do not lower the threshold for any Laya checkpoint without re-running `fastpath_bench.py`.
- Next: `scripts/laya-finetune/kaggle_train.ipynb` runs the authors' recipe (whole encoder, 4 epochs, 1024/256 lengths, 3,000 generated steps) on a free Kaggle GPU, then `diagnose.py` and the benchmark. It needs Francis's Kaggle account. A GPU result should also be checked for the free-text collapse before any use; if it appears, rebalance the generator toward free-text steps.

### Recommendation (30 September)

1. **Jev fast path: ready to switch on for demos** (`WARDEN_FAST_PATH=jev`). On these synthetic cases it never answered wrongly or on a free-text step, it answered about half the steps, and in the real loop it answered every step of the fixture task at a median of about 236 ms. It is another cloud recipient of the sanitized body, so it stays opt-in.
2. **Laya: leave off.** Zero-shot it only adds latency; the two CPU fine-tunes underfit, and v2 lost the free-text safety gate. The GPU notebook is the next attempt.
3. **Re-run `llm_settings_bench.py` on a fresh quota** before calling Qwen better than gpt-oss-20b at temperature 0.
4. None of this passes G11 (200 ms for the full flow); one planner call alone is near or over that budget.

## Evidence

- `Benchmarks/results/cloud-model-bench-v01.json`: all providers, 5 reps (pre-fix prompt; see its `caveats`).
- `Benchmarks/results/cloud-model-bench-groq-v02.json`: Groq only, 3 reps, fixed prompt, sequential.
- `Benchmarks/results/e2e-v5-boundary-v02.json`: real extension + Warden + real Groq, 48 cloud requests, 0 personal values.
- `Benchmarks/results/fastpath-bench-v01.json`: fast path, Jev and Laya, design and held-out cases, with the Groq chain's answer on each case.
- `Benchmarks/results/groq-settings-bench-v01.json`: Groq models at default temperature vs 0, Warden request shape (rate-limited; inconclusive).
- `Benchmarks/results/e2e-v5-boundary-v03.json`: real extension + Warden with the fast path, 5 runs, 0 personal values.
- `Benchmarks/results/fastpath-bench-laya-ft-v01.json`, `-ft-v02.json`, `-zeroshot-compact-v01.json`: the fine-tuning runs above, each with its caveat.
- Harness: `scripts/cloud-models/bench.py`, `fastpath_bench.py`, `llm_settings_bench.py`, `cases.py`, `cases_heldout.py`, `scripts/e2e-v5/recording-relay.mjs`.

## Not changed

G11 **fail**, G20 **paused**, `submission_ready` **false**. As of 30 September the Groq chain starts with `qwen/qwen3.8-27b` and the Warden calls Groq at temperature 0. The fast path is built and **off by default** (`WARDEN_FAST_PATH` unset). No OpenRouter code path was added to the Warden.

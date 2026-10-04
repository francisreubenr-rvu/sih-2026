# DHRISTI Warden

The local application that holds the PII model. It is the single authority on what counts as
personal data. The local machine runs a model for one job, PII redaction; `POST /plan` defaults to
Groq (cloud) over already-tokenized text, behind an egress guard. `WARDEN_PLANNER=ollama` selects the
offline local planner instead. The Warden validates every returned plan before the browser is allowed
to act on it.

Architecture and the frozen HTTP contract: `../Docs/specs/2026-09-13-dhristi-v4-warden.md`, with the
additive wire changes in `../Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md`.
Port decision: `../Docs/decisions/brain-option-c-warden-port.md`.

## This port (Option C)

Francis locked Option C on the `sih-2026` master line. Two facts sit next to each other:

1. **The planner default is Groq (cloud)** since 29 September 2026 (v5 spec). `dispatch_plan` calls `groq_client.plan_via_groq` unless `WARDEN_PLANNER=ollama`. Any other value fails closed with 503 and calls no model. Without `GROQ_API_KEY` the default path returns 503 and does not call Ollama.
2. **`WARDEN_PLANNER=ollama` is the offline path**, local Ollama on `http://127.0.0.1:11434`. If Ollama is down, not loopback, or tagged `:cloud`, `/plan` returns an error and does not call Groq. A model tag ending in `:cloud` is not that path. Ollama remains the optional `/validate` reasoning stage as well (`ollama_client.review`). That stage may only downgrade `accept` to `ask`.

Do not describe a Groq `/plan` response as the offline planner. Every `/plan` response and `/health` carry `destination` (`cloud` for Groq, `local` for Ollama) so the extension can say where the body went.

**Start** (loopback only, port **8756**):

```sh
cd warden
python -m uvicorn app:app --host 127.0.0.1 --port 8756   # the Python of your venv; see Requirements
```

`python app.py` uses the same bind: `host="127.0.0.1"` and `config.PORT` (default 8756). Do not bind `0.0.0.0`. Do not use port **9041**. That port belongs to the master Prototype server (`http://127.0.0.1:9041/`).

Load the unpacked side panel from the repository-root `extension/` directory. `Prototype/extension/` is the master measurement popup. It is not this Warden UI.

The extension computes the operation tier itself (`extension/utils/op-tier.js`, re-checked on the live element right before a click) and asks before any state-changing or destructive step (F17). The Warden never decides that a step may run. Real end-to-end runs of this loop are recorded in `../Benchmarks/results/e2e-v5-boundary-v02.json` and `-v04.json` (synthetic fixture only).

## Why it exists

v3 filtered PII in the browser with regular expressions. An earlier repository measured that filter at
string-level micro F1 0.383 over 206 cases, with names, passports and addresses undetected in free text;
that results file (`pii-detection-v1.json`) was not imported into this repository, so treat the figure as
recorded history, not evidence here. A regular expression cannot recognise a person's name. The Warden
adds a real named-entity model for the cases regex cannot reach, and keeps the regex layer for the
cases where a deterministic answer is better than a probabilistic one.

## Requirements

| Requirement | Detail |
|---|---|
| Python | 3.11 or newer in a virtual environment (CI uses 3.12; the cloud container 3.11). |
| Packages | `pip install -r requirements.txt` (runtime: gliner, torch, transformers, protobuf, fastapi, uvicorn, httpx; on a CPU-only machine install torch from `https://download.pytorch.org/whl/cpu`). Tests only: `requirements-test.txt`. Without `protobuf` the mdeberta tokenizer could not load its SentencePiece model and the GLiNER load failed in a fresh Linux venv (29 September 2026), so `/health` reports `loaded:false` and the real-weight tests skip. With it, that CPU-only container with the CPU torch wheel plus these packages loaded the weights in 14.2 s. |
| Model weights | `urchade/gliner_multi_pii-v1`, in the Hugging Face cache (`HF_HOME` if set, else the library default) |
| Groq key | Required for `POST /plan` on the default path. Goes in `.env`, never in a tracked file, never in the browser. `GROQ_BASE_URL` (default `https://api.groq.com/openai/v1`) names the OpenAI-compatible endpoint; the key is sent there, so change it only deliberately (the test suite points it at a local fake server). |
| Ollama | Required for `POST /plan` only when `WARDEN_PLANNER=ollama`. Also used for optional `/validate` reasoning. Host must be loopback (`http://127.0.0.1:11434` unless `OLLAMA_HOST` says otherwise). |

## Setup

```sh
cp .env.example .env
# Default planner is Groq. Put GROQ_API_KEY in .env.
# Get one at console.groq.com/keys. Never paste a key into a chat or a tracked file.
# For offline local planning instead, set WARDEN_PLANNER=ollama.
```

## Run

```sh
cd warden
python -m uvicorn app:app --host 127.0.0.1 --port 8756
```

It binds to 127.0.0.1 only, never 0.0.0.0. This service is a PII oracle: anything that can reach it
can ask it what in a piece of text is personal data, so it must not be exposed to the network.

The Warden does not set `HF_HOME` (since 3 October 2026 it no longer defaults to a development
machine's path); set it to use another cache, or leave it unset for the library default.

The model loads at startup. `/health` reports `loaded: false` until it finishes and `/strip` answers
503 in the meantime. Poll `/health` rather than assuming it is ready.

## Measured on this machine

Recorded 13 September 2026 on an Apple Silicon Mac, weights already cached.

| Fact | Value |
|---|---|
| Model load, warm cache | 15.7 s |
| Model load, first run including download | 76.4 s |
| Strip, one 5-entity sentence | 137 ms |
| Strip, five cases | 337 ms total |

These are point estimates from single runs on one machine. They are not a benchmark and no
confidence interval is claimed.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `loaded` (GLiNER ready), model id, regex pattern count, `planner` (`groq`/`ollama`/`invalid`), `destination` (`cloud`/`local`/null), `plannerModel`, `groqConfigured`, `fastPath` (mode, destination, threshold), `reviewer` (`{mode, loaded, error}`), `pairing` (`required`/`missing`/`misconfigured`/`disabled`), `warden` version |
| POST | `/strip` | Two-layer PII removal, returns tokenized text, tokenized element labels, the token map, uncertain spans and value-free decisions |
| POST | `/plan` | Egress guard, then planning over sanitised material (Groq with model fallback by default, Ollama when `WARDEN_PLANNER=ollama`) |
| POST | `/validate` | Legacy: deterministic checks, then optional local reasoning. The v5 extension does not call it. |

Request and response shapes are in the frozen spec, with these additions since v5. `/health` never
returns a key, only whether one is present.

**Request boundary (3 October 2026).** Checked before the pairing proof or any parsing:

| Refusal | When |
|---|---|
| 421 | `Host` is not a loopback name (127.0.0.1, localhost, [::1]): stops DNS rebinding |
| 411 | a POST without `Content-Length` |
| 413 | a body over `WARDEN_MAX_BODY_BYTES` (default 2 MiB) |
| 415 | a POST whose `Content-Type` is not `application/json` |
| 400 | malformed JSON or a wrong field type; names the field, never the value |

`/docs`, `/redoc` and `/openapi.json` are not served. Evidence against a real uvicorn Warden:
`../Benchmarks/results/warden-hardening-v01.json` (`../scripts/warden-hardening-evidence.py`).

**Answers to uncertain spans.** `/strip`'s `resolved` maps a token id to
`{"decision": "strip"|"keep", "value": "<the uncertain entry's preview>"}`. An answer applies only to
the value it was given for, because token ids restart at `#1` on every call: a "keep" for a link label
must never keep a different value that gets the same id on the next page. A legacy bare `"strip"` still
applies; a bare `"keep"` is ignored and the question is asked again.

## How stripping works

Two layers run independently over the RAW text and their spans are merged in the original coordinate
space, with the deterministic layer winning on overlap.

1. **Regex layer** (`redactor.py`), ported faithfully from `../extension/utils/redactor.js`: same
   patterns, same order, same Luhn and Aadhaar-keyword heuristics. Order is load-bearing, since a
   card number must be consumed whole before a phone or Aadhaar pattern can claim a substring of it.
   A regex hit is certain and never enters the uncertain band.
2. **GLiNER layer** (`entities.py`) for what regex cannot reach: person name, address, date of birth,
   account number, password.

### GLiNER scores one line at a time

The model's window is 384 words and everything past it is dropped. Handing it the whole serialised
DOM lost every name after the first few lines, and even a few lines together scored badly because a
list of unrelated controls dilutes each name. Measured in a Linux container on 29 September 2026
(CPU torch, gliner 0.2.29), 120 synthetic DOM lines with 10 names:

| Chunking | Names found | Latency |
|---|---|---|
| Whole text (old) | 0/10 | 0.45 s |
| 8 lines per chunk | 3/10 | 10.4 s |
| 4 lines per chunk | 3/10 | 8.4 s |
| 1 line per chunk (now) | 9/10 | 7.4 s with the old filler, 3.4 s as shipped |

On a 41-line page with names on lines 2 and 39, the old whole-text call found neither; one line per
chunk finds both and strips them (scores at or above 0.60). A line longer than 128 words is split on whitespace. Offsets map back to the
original text exactly. The scaffolding filler is now one `·` then spaces instead of one `·` per
character, which halved latency with no added false positives on the same fixture, and the leading
`N.` element index is neutralised too (scored alone, a line index came back as an account number). Full numbers are
in the comment above `entities._chunk_spans`. One run, one fixture: not a benchmark.

### One token per value, and labels

The same (type, value) gets one token across the task and the DOM, and one uncertain question covers
every occurrence. `elements[].label` comes back tokenized with the same tokens as `sanitizedDom`: the
regex layer runs on each label, then every value minted in the request is replaced by its token,
longest first, as an exact substring. A value the user chose to keep stays. Each `decisions[]` entry
carries `token` and `source` (`task`, `dom` or `label`) and never a raw value.

### Why both layers see raw text

The first implementation ran regex first and handed its tokenized output to GLiNER. That was
measured to be harmful:

| Probe | Person-name score |
|---|---|
| Raw text | 0.241 |
| After regex tokenization | 0.179 |
| The token `EMAIL#1` itself | 0.095, returned as a person name |

A named-entity model reads context, and a `TYPE#n` token is not context. Tokens depress the scores
of real entities and get scored as entities themselves.

### Confidence bands

| Band | Action |
|---|---|
| score >= 0.60 | Strip silently |
| floor <= score < 0.60 | Uncertain: ask the user through the extension side panel |
| score < floor | Ignore |

The floor is per label, not global:

| Label | Floor | Ground |
|---|---|---|
| person name | 0.12 | The same name scored 0.423 in "Hi, I am Francis Reuben R" and 0.241 in "Log in as Francis Reuben R". A global floor of 0.35 let the imperative phrasing through in plaintext. A missed name is a privacy breach; a spurious prompt costs one click. |
| everything else | 0.35 | Structured types score high when present, so a lower floor adds noise without adding recall. |

Measured after the correction on five cases: the imperative name rose to 0.390 and prompts, the
declarative name rose enough to strip silently, a second name prompted at 0.347, and two PII-free
control sentences produced zero tokens and zero prompts. Five cases is not a rate.

### Token shape note

Tokens are uppercase letters and digits only, with a single `#` before the numeral: `PERSONNAME#1`,
never `PERSON_NAME#1`. The browser's consumer regex is `/[A-Z][A-Z0-9]*#[0-9]+/g` with no anchors,
so an underscore-bearing token matches only its suffix (`NAME#1`), which is not a key the vault
holds, and rehydration then throws and the field is never typed. The frozen spec's `/strip` example
shows the underscore form; that example is wrong and `minter.py` deliberately does not mint it.

## Planning and model fallback

This is the default planner (`WARDEN_PLANNER` unset or `groq`). See "This port (Option C)" above for
the offline Ollama mode.

### Egress guard

Before any planner is called, `/plan` runs the same deterministic regex layer `/strip` uses over every
string in the body: `tokenizedTask`, `sanitizedDom`, every element field (labels, selectors), and
`history`. Any hit refuses the request with HTTP 422
`{error, egressGuard: {pattern, field}, planner, warden}` and no model is called. The refusal names the
pattern and the field path (for example `elements[0].label`), never the value. `TYPE#n` tokens are
blanked before the scan, so they never trip it. A body carrying `tokens` is still refused first, with
400.

### Model fallback

`/plan` tries the chain in order at temperature 0, moving on immediately on HTTP 5xx, 429, a timeout, or an
unparseable body. The response lists every model that failed in `switched`, so a fallback is visible
in the extension's step log instead of silent.

Default chain, overridable with `GROQ_MODEL_CHAIN`:

1. `qwen/qwen3.8-27b` (first since 30 September 2026: 36/36 correct at p50 342 ms on the Warden's prompt, `Benchmarks/results/cloud-model-bench-groq-v02.json`)
2. `openai/gpt-oss-20b`
3. `openai/gpt-oss-120b`

The chain names models the ACCOUNT can actually reach, not models that exist in some catalogue. It
originally listed `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`, and probing this key on
13 September 2026 showed both return "does not exist or you do not have access", so every request
paid a failed round trip before succeeding and the third fallback did not exist at all. Probed
across the reachable catalogue on 30 September 2026, these three answer on this account. Re-probe before
editing: a dead entry costs a wasted request on every call.

Only the sanitised material crosses the boundary: `tokenizedTask`, `sanitizedDom`, `elements` and
`history`. Never the token map, never a raw value.

### Decision-model fast path (off in code)

`fastpath.py` can put a decision model in front of the planner: it lists the actions the scene allows
and lets the model pick one when it is at least `WARDEN_FAST_PATH_MIN_CONFIDENCE` (0.9) sure, deferring
to the planner otherwise. **Both backends are disabled in code** (`JEV_ENABLED = False`, decided by Francis
on 2 October 2026; `LAYA_FASTPATH_ENABLED = False`, parked after failing Jev's bar). Setting
`WARDEN_FAST_PATH` has no effect until a recorded decision flips one; `/health.fastPath` reports the
refusal. The fast path's checkpoint variable is `WARDEN_FAST_PATH_LAYA_MODEL`, separate from the
reviewer's.

History, for the record (`../Docs/decisions/brain-cloud-models-jev.md`): on 30 September Jev answered 39
of 89 held-out steps at 0.9, all right, never a free-text step, at a median of about 236 ms per step in
the real loop; Laya fine-tunes on CPU and on Colab did not reach Jev's bar.

## Validation

Deterministic checks run first, each reporting a named pass or fail: selector present in the
submitted scene, coordinates finite and in the viewport, action in the allowed set, no unexpected
keys, operation tier, and intent coherence. A deterministic failure is a hard reject.

Local reasoning through Ollama runs only after those pass, and may downgrade `accept` to `ask` but
can never upgrade a `reject`. A reasoning model does not overrule a deterministic safety check. When
Ollama is absent the check is recorded as SKIPPED, never as passed.

### Laya reviewer (optional, 30 September 2026)

`WARDEN_REVIEWER=laya` swaps the Ollama review for `laya_review.py`, a fine-tuned
[Laya](https://huggingface.co/convaiinnovations/laya) classifier (Apache 2.0, multilingual
checkpoint, 322M). It answers two typed questions per step in one forward pass: the click's tier
(navigational / state-changing / destructive) and whether the step serves the task. The contract
on `/validate` is the reasoning stage's: it can only turn `accept` into `ask`, never lowers a tier,
and any failure is a SKIPPED check. On `/plan` its scores can also let the extension release a
confirmation (below). The default stays `ollama`.

| Variable | Meaning |
|---|---|
| `WARDEN_REVIEWER` | `ollama` (default) or `laya` |
| `WARDEN_REVIEWER_MODEL` | local checkpoint directory or Hub repo id; unset means SKIPPED. `WARDEN_LAYA_MODEL` is read as a fallback for the reviewer only |
| `WARDEN_LAYA_SUBFOLDER`, `WARDEN_LAYA_DEVICE` | optional; device defaults to `cpu` |
| `WARDEN_LAYA_DESTRUCTIVE_MIN`, `WARDEN_LAYA_OFF_TASK_MIN` | ask thresholds, default 0.5 |

Needs `pip install laya` (pulls torch); it is not a test dependency. Dataset, trainer and evaluator:
`../scripts/laya/`. Results and limits: `../Benchmarks/results/laya-plan-review-v01.json` and
`../Docs/decisions/brain-laya-plan-review.md`. The fine-tuned weights are in the private Hub repo
`francisreubenr/dhristi-laya-plan-review`, so set `WARDEN_REVIEWER_MODEL` to that id with an `HF_TOKEN` that
can read it. The model is warmed at startup in the background (about 11 s on a 4-thread CPU; a failed load is retried after 60 s, and `/health.reviewer` shows the state), then scores a step in
about 200–260 ms.

With `WARDEN_REVIEWER=laya`, `/plan` also returns `review`: `model`, `fineTuned`, `action`,
`targetSelector`, `pNavigational`, `pDestructive` and `pOffTask` for the returned click, or
`{"skipped": reason}`, or `null` for anything but a click. The Warden scores; the extension
decides. `extension/utils/plan-check.js` `layaRelease` may skip a local confirmation only for a click
its own scan could not identify (`unproven`), under thresholds it holds itself. Since v5 the
extension's run loop does not call `/validate`, so the escalation review above reaches only older
harnesses.

### Pairing with the extension (required since 2 October 2026)

Before 30 September the extension trusted whatever answered on `127.0.0.1:8756`. Once a `/plan`
response could skip a confirmation (Laya release, above), that was not good enough. `pairing.py`
adds a shared secret that never crosses the wire, and since 2 October (Francis) it is required.

| Direction | Header | HMAC-SHA256 over |
|---|---|---|
| request | `X-Dhristi-Nonce`, `X-Dhristi-Auth` | `dhristi-req`, method, path, nonce, sha256(body) |
| response | `X-Dhristi-Proof` | `dhristi-res`, path, nonce, status, sha256(exact response bytes) |

Setup, once per machine:

```sh
cd warden
python pairing.py new          # prints a fresh secret
# put it in warden/.env as WARDEN_PAIRING_SECRET=..., restart the Warden,
# and paste the same value into the extension's Settings > Pairing code
```

`/health` reports the pairing state:

| `pairing` | Meaning | POST /strip, /plan, /validate |
|---|---|---|
| `required` | secret set, 32+ characters | must carry a valid, unused request proof, else 401; every response is signed |
| `missing` | no secret | refused (503) with these setup steps; the Warden also says so on startup |
| `misconfigured` | secret shorter than 32 characters | refused (503) |
| `disabled` | no secret and `WARDEN_PAIRING_DISABLED=1` | accepted unsigned; for scripted harnesses and the test suite only |

The extension (`extension/utils/warden.js`) behaves as follows:

- **No code saved:** it sends no POST at all, and no run starts, whatever the Warden reports. Only an
  unsigned `GET /health` goes out, so the panel can say what is missing.
- **Code saved:** it refuses any response without a valid proof. A failed `/health` proof stops the
  run before any page text is sent. A `disabled` Warden therefore cannot serve the extension; the
  flag only lets non-extension tools in.
- **Laya release:** only on a verified `/plan` response.

The G11 harness signs its `/plan` probe when `WARDEN_PAIRING_SECRET` is in its environment.
`scripts/e2e-v5/run.mjs` saves that same value into the loaded extension.

Residual: the pairing code sits in the extension's `chrome.storage.local`. If an impostor takes the
port mid-run after the real Warden answered, at most one `/strip` body reaches it before its unproven
response stops the run.

### The reasoning stage, measured 13 September 2026

It had never been exercised before this date: every call recorded `skipped`, and three real defects
were hiding behind that. None were visible while the stage was inert.

| Defect | Measurement | Fix |
|---|---|---|
| The timeout sat below the real cold path | `WARDEN_OLLAMA_TIMEOUT_S` defaulted to 12 s. Measured cold call with the model unloaded: **26.8 s wall, 15.0 s of it model load**. So the first call after any pause silently skipped while Ollama was up and answering. | A 60 s floor (`ollama_client.MIN_TIMEOUT_S`), which a larger configured value still overrides. |
| The model returned valid JSON carrying no verdict key | 2 of 24 calls at default sampling. `json.loads` succeeded, the verdict key was absent, and the only readable outcome was `skipped`. | `temperature: 0`, measured at 0 of 24. |
| The prompt invited escalation of everything | 16 of 24 wrong verdicts at temperature 0 on six probe plans, four of which must not be flagged. It asked a human to confirm `click View Details` for the task `view the order details`. That is over-escalation, not safety, and it is the failure mode that trains a user to click through prompts. | Prompt rewritten with explicit rules and a worked example. Measured 0 of 24 wrong verdicts. |

Latency and behaviour, against the real model:

| Fact | Value |
|---|---|
| Warm call, consecutive runs | 6.65 s to 7.00 s |
| Warm call, observed range over 60+ calls | 1.6 s to 19.5 s |
| Cold call, model unloaded | 26.8 s wall, 15.0 s of it model load |
| Sampling | `temperature: 0` |

On six probe plans, two that must be flagged and four that must not:

| Probe | Deterministic tier | Model verdict | `/validate` verdict |
|---|---|---|---|
| click Delete Account, task says delete my account | destructive | no conflict | ask (tier rule) |
| click Delete Account, task says view my order history | destructive | flags it | ask |
| type a password into #password, task says search for a laptop | state-changing | flags it | ask |
| click View Details, task says view the order details | navigational | no conflict | accept |
| type a comment into #comment, task says type a comment | state-changing | no conflict | accept |
| click Delete Account against a scene with no destructive control | none, hard reject | never called | reject |

The reasoning model is load-bearing in exactly one row: a plan whose target contradicts the task
where the deterministic tier is not `destructive`. Nothing deterministic catches that case, and the
last row shows a hard reject never reaches the model at all.

A residual is recorded rather than engineered around: the 0-of-24 no-verdict rate is a measurement,
not a guarantee. A no-verdict response still degrades safely to `skipped` with the deterministic tier
rule standing, so the failure mode is an inert stage rather than a wrong verdict. No retry was added,
since that would be speculative code for a case that no longer reproduces.

The extension independently re-computes the operation tier and gates execution on its own result.
The Warden's verdict is necessary but never sufficient. See finding F17 in `../ROAST.md` for the
incident that made this rule non-negotiable.

## Degraded modes

| Condition | Behaviour |
|---|---|
| Model still loading | `/health` reports `loaded: false`, `/strip` answers 503 |
| Groq key missing | `/health` reports `groqConfigured: false`. Default `/plan` returns 503 and does not call a model. |
| `WARDEN_PLANNER` set to anything but `groq` or `ollama` | `/plan` returns 503 and calls no model; `/health` reports `planner: invalid`, `destination: null`. |
| Ollama absent for `/plan` with `WARDEN_PLANNER=ollama` | 503 with a clear error. Groq is not called. |
| `/plan` body contains a regex-detectable value | 422 from the egress guard. No model is called. |
| Ollama absent for `/validate` | Deterministic validation still runs and is authoritative; the reasoning check records as skipped |
| Warden not running | The extension refuses to start a run. It does not fall back to the old browser regex filter, because silently downgrading a privacy guarantee the user was shown is worse than an honest stop. |

## Element pii flags

`/strip` returns each submitted element with a `pii` boolean. Note its real limit: the request
carries no element values, only selector, label, fieldType, filled and coordinates, so this is a
metadata classifier over declared types and label text, not a scan of content. It is deliberately
narrow and is not evidence of field-level PII detection accuracy.

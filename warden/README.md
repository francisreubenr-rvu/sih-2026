# DHRISTI Warden

The local application that holds the PII model. It is the single authority on what counts as
personal data, it is the only component that talks to the cloud, and it validates every returned
plan before the browser is allowed to act on it.

Architecture and the frozen HTTP contract: `../Docs/specs/2026-09-13-dhristi-v4-warden.md`.
Port decision: `../Docs/decisions/brain-option-c-warden-port.md`.

## This port (Option C)

Francis locked Option C on the `sih-2026` master line. Two facts sit next to each other:

1. **Phase 1 planner default is local Ollama**, the offline path on `http://127.0.0.1:11434`. A model tag ending in `:cloud` is not that path.
2. **The files imported from `2afd215` do not implement that default.** `POST /plan` in `app.py` still calls Groq (`groq_client.plan_via_groq`) and returns 503 when `GROQ_API_KEY` is absent. Ollama in this import is the optional `/validate` reasoning stage (`ollama_client.py`). That stage may only downgrade `accept` to `ask`. It is not the planner.

Do not describe a Groq `/plan` response as the Phase 1 offline planner. Switching `/plan` onto Ollama is later work.

**Start** (loopback only, port **8756**):

```sh
cd warden
export HF_HOME="/Volumes/1TB SSD/LM/hub"
~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756
```

`python app.py` uses the same bind: `host="127.0.0.1"` and `config.PORT` (default 8756). Do not bind `0.0.0.0`. Do not use port **9041**. That port belongs to the master Prototype server (`http://127.0.0.1:9041/`).

Load the unpacked side panel from the repository-root `extension/` directory. `Prototype/extension/` is the master measurement popup. It is not this Warden UI.

The imported `extension/background.js` already computes the operation tier on the client (`opTierLocal`) before execute. That F17 gate stays mandatory whenever the execute path is wired. This import does not attach that loop to the Prototype server on 9041, and this port does not claim a live run.

## Why it exists

v3 filtered PII in the browser with regular expressions. `../Benchmarks/results/pii-detection-v1.json`
measured that filter at string-level micro F1 0.383 over 206 cases, with names, passports and
addresses undetected in free text. A regular expression cannot recognise a person's name. The Warden
adds a real named-entity model for the cases regex cannot reach, and keeps the regex layer for the
cases where a deterministic answer is better than a probabilistic one.

## Requirements

| Requirement | Detail |
|---|---|
| Python | `~/.venvs/data/bin/python` (3.14.7). System Python is externally managed; do not use it. |
| Packages | gliner, torch, transformers, fastapi, uvicorn, all already installed in that venv |
| Model weights | `urchade/gliner_multi_pii-v1`, cached under `HF_HOME` |
| Ollama | Optional. Used only for validation reasoning. The Warden runs without it. |
| Groq key | Optional to start, required for `/plan`. Goes in `.env`, never in a tracked file. |

## Setup

```sh
cp .env.example .env
# then put your Groq key in .env: GROQ_API_KEY=...
# Get one at console.groq.com/keys. Never paste a key into a chat or a tracked file.
```

## Run

```sh
cd warden
export HF_HOME="/Volumes/1TB SSD/LM/hub"
~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756
```

It binds to 127.0.0.1 only, never 0.0.0.0. This service is a PII oracle: anything that can reach it
can ask it what in a piece of text is personal data, so it must not be exposed to the network.

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
| GET | `/health` | Readiness, model id, regex pattern count, whether Groq is configured |
| POST | `/strip` | Two-layer PII removal, returns tokenized text, the token map, and uncertain spans |
| POST | `/plan` | Groq planning over sanitised material, with model fallback |
| POST | `/validate` | Deterministic checks, then optional local reasoning |

Request and response shapes are in the frozen spec. `/health` never returns the Groq key, only
whether one is present.

## How stripping works

Two layers run independently over the RAW text and their spans are merged in the original coordinate
space, with the deterministic layer winning on overlap.

1. **Regex layer** (`redactor.py`), ported faithfully from `../extension/utils/redactor.js`: same
   patterns, same order, same Luhn and Aadhaar-keyword heuristics. Order is load-bearing, since a
   card number must be consumed whole before a phone or Aadhaar pattern can claim a substring of it.
   A regex hit is certain and never enters the uncertain band.
2. **GLiNER layer** (`entities.py`) for what regex cannot reach: person name, address, date of birth,
   account number, password.

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

The section below describes the **imported Groq `/plan` chain** from commit `2afd215`. It is not the Option C Phase 1 default. That default is local Ollama, and it is not wired to `/plan` in this import. See "This port (Option C)" above.

`/plan` tries the chain in order, moving on immediately on HTTP 5xx, 429, a timeout, or an
unparseable body. The response lists every model that failed in `switched`, so a fallback is visible
in the extension's step log instead of silent.

Default chain, overridable with `GROQ_MODEL_CHAIN`:

1. `openai/gpt-oss-20b`
2. `openai/gpt-oss-120b`

The chain names models the ACCOUNT can actually reach, not models that exist in some catalogue. It
originally listed `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`, and probing this key on
13 September 2026 showed both return "does not exist or you do not have access", so every request
paid a failed round trip before succeeding and the third fallback did not exist at all. Probed
across the reachable catalogue, these two are the only usable models on this account. Re-probe before
editing: a dead entry costs a wasted request on every call.

Only the sanitised material crosses the boundary: `tokenizedTask`, `sanitizedDom`, `elements` and
`history`. Never the token map, never a raw value.

## Validation

Deterministic checks run first, each reporting a named pass or fail: selector present in the
submitted scene, coordinates finite and in the viewport, action in the allowed set, no unexpected
keys, operation tier, and intent coherence. A deterministic failure is a hard reject.

Local reasoning through Ollama runs only after those pass, and may downgrade `accept` to `ask` but
can never upgrade a `reject`. A reasoning model does not overrule a deterministic safety check. When
Ollama is absent the check is recorded as SKIPPED, never as passed.

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
| Groq key missing | `/health` reports `groqConfigured: false`, `/plan` returns a clear error, not a stack trace |
| Ollama absent | Deterministic validation still runs and is authoritative; the reasoning check records as skipped |
| Warden not running | The extension refuses to start a run. It does not fall back to the old browser regex filter, because silently downgrading a privacy guarantee the user was shown is worse than an honest stop. |

## Element pii flags

`/strip` returns each submitted element with a `pii` boolean. Note its real limit: the request
carries no element values, only selector, label, fieldType, filled and coordinates, so this is a
metadata classifier over declared types and label text, not a scan of content. It is deliberately
narrow and is not evidence of field-level PII detection accuracy.

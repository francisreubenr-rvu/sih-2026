# DHRISTI v4: the Warden architecture

Written 13 September 2026. This spec is FROZEN for the v4 build: three work packages implement
against it in parallel, so a change here invalidates work in flight. Supersedes the v3 two-process
split for the shipping path. The v3 design at `Docs/specs/2026-09-10-sightline-v3-design.md` remains
the record of what was measured before this run and is not restated as v4 evidence.

**Amendment, 23 September 2026.** Francis locked the Phase 1 planner default to local Ollama.
`POST /plan` follows `Docs/decisions/brain-warden-ollama-plan-harden.md`. Groq is optional and
is not the offline path. Sentences below that say a missing Groq key blocks planning describe
the 13 September import, not the current default.

## Why a third process

v3 put the filter in the browser and used regular expressions plus an UltraFace face detector. That
filter has a measured hole recorded in `Benchmarks/results/pii-detection-v1.json`: free-text NAME,
PASSPORT and AADHAAR go undetected, ACCOUNT reads as PHONE, and DATE, ADDRESS and SECRET recall
zero, for a string-level micro F1 of 0.383 over 206 cases. A regular expression cannot recognise a
person's name. That is not a tuning problem, it is the wrong class of model.

v4 introduces a local application, the Warden, which holds a real named-entity model and becomes
the single authority on what counts as personal data. It runs on the user's own machine, so the
privacy claim is unchanged: nothing leaves the device unredacted.

## Measured basis for the model choice

Recorded on this machine on 13 September 2026, before any of the build was written, so the
architecture rests on a real measurement rather than an assumption.

| Fact | Value |
|---|---|
| Model | `urchade/gliner_multi_pii-v1` (GLiNER, zero-shot NER, purpose-built for PII) |
| Runtime | `~/.venvs/data` (Python 3.14.7), torch 2.14.0, transformers 5.16.1 |
| Cold load | 76.4 s including first-time weight download |
| Inference | 182 ms on a 5-entity, 3-sentence probe |
| Detected | address 0.995, passport 0.999, aadhaar 0.995, email 1.000, phone 1.000 |
| Uncertain | person name 0.423 |
| True negative | `Order id 7781234` not flagged |

The person-name score of 0.423 is the load-bearing observation. It is a real hit in the uncertain
band, which is exactly the case the user asked to be escalated to a prompt rather than guessed. The
uncertain path is therefore not a hypothetical branch: the reference model produces it on the first
probe.

Ollama is also present with one genuinely local model, `qwythos-9b:latest`. The `:cloud` entries in
`ollama list` are not local and must never be described as the offline path.

## The five stages

```
1. PERCEIVE    browser        content script serialises the DOM, captures the visible tab
2. STRIP       Warden, local  regex layer, then GLiNER. Uncertain spans escalate to the user
3. PLAN        Warden to Groq only the sanitised scene crosses the boundary
4. VALIDATE    Warden, local  deterministic checks, then local reasoning
5. EXECUTE     browser        the extension re-gates locally, then acts on the page
```

The browser never holds a cloud API key in v4. The Groq key lives in the Warden's `.env`, read by
the server process, which is the correct place for it: a key in an unpacked extension is readable by
anything that can read the extension directory.

## Trust model, and the one rule that must not be relaxed

The Warden is local but it is still a separate process, so a spoofed or compromised loopback
listener must not be able to authorise a destructive action. Finding F17 in `ROAST.md` recorded
exactly this failure in v3: the client trusted a server-supplied `requiresConfirmation` field and a
hostile-server double executed a destructive click with zero confirmations.

**The extension re-computes the operation tier locally from the scene it holds and gates execution on
its own result. The Warden's verdict is necessary but never sufficient.** Both must agree before an
action runs. This is defence in depth, not redundancy, and no work package may remove it.

## Frozen HTTP contract

Origin `http://127.0.0.1:8756`. Port 8756 was confirmed free on this machine on 13 September 2026.
Do not use 9041: finding F18 records that another project holds it. Do not use 9051: a Prototype
server is listening there.

Every response carries `warden` with the model identifier and version so the extension can display
what actually did the stripping, never a hardcoded claim.

### GET /health

```json
{ "ok": true, "model": "urchade/gliner_multi_pii-v1", "loaded": true,
  "regexPatterns": 11, "groqConfigured": true, "warden": "0.1.0" }
```

`groqConfigured` reports whether a key is present in the environment. It never returns the key.

### POST /strip

Request:
```json
{ "task": "raw task text", "dom": "serialised DOM text",
  "elements": [ { "selector": "#email", "label": "Email", "fieldType": "email",
                  "filled": false, "x": 120, "y": 340 } ],
  "resolved": { "PERSON_NAME#1": "strip" } }
```

`resolved` carries decisions the user already made this session for previously uncertain spans, so
the same question is never asked twice. `strip` or `keep`.

Response:
```json
{ "tokenizedTask": "task with TYPE#n tokens",
  "sanitizedDom": "dom with TYPE#n tokens",
  "tokens": { "EMAIL#1": "francis@example.com" },
  "elements": [ { "selector": "#email", "label": "Email", "fieldType": "email",
                  "filled": false, "x": 120, "y": 340, "pii": true } ],
  "uncertain": [ { "id": "u1", "token": "PERSON_NAME#1", "label": "person name",
                   "score": 0.423, "preview": "Francis Reuben R", "source": "task" } ],
  "decisions": [ { "pattern": "email", "score": 1.0, "layer": "regex" } ],
  "warden": "0.1.0" }
```

`tokens` returns the token-to-value map to the extension because the values originated in the
browser: they are page content and task text the browser already held. Returning them over loopback
adds no exposure and keeps rehydration where typing happens. The map goes into the extension's
existing client vault, which is never serialised into an outbound request.

`uncertain` is non-empty when the model scored a span inside the uncertain band. The extension MUST
prompt the user and MUST NOT proceed to `/plan` for that span until answered.

Confidence bands, applied to GLiNER scores:

| Band | Action |
|---|---|
| score >= 0.60 | strip silently, it is personal data |
| 0.35 <= score < 0.60 | uncertain, ask the user |
| score < 0.35 | ignore, do not strip |

The regex layer is deterministic: a regex hit is always stripped and never enters the uncertain
band. The two layers union, so the model can only ever add coverage, never remove it.

### Amendment, 13 September 2026: layer ordering and per-label floors

The first implementation ran the regex layer first and handed its tokenized output to GLiNER. That
was measured to be harmful and is now corrected. Both layers run independently over the RAW text and
their spans are merged in the original coordinate space, with the deterministic layer winning on
overlap.

| Probe | Person-name score |
|---|---|
| Raw text | 0.241 |
| After regex tokenization | 0.179 |
| The token `EMAIL#1` itself | 0.095, returned as a person name |

A named-entity model reads context and a `TYPE#n` token is not context: tokens depress the scores of
real entities and are themselves scored as entities.

The single global floor of 0.35 is also wrong for person names on this model. The same name scored
0.423 in "Hi, I am Francis Reuben R" and 0.241 in "Log in as Francis Reuben R", so an imperative
phrasing fell below the floor and the name reached the planner in plaintext with no prompt. That is
the exact failure this architecture exists to prevent, so the floor is now per label:

| Label | Uncertain floor | Ground |
|---|---|---|
| person name | 0.12 | A missed name is a privacy breach; a spurious prompt costs one click. The asymmetry justifies buying recall with questions. |
| everything else | 0.35 | Structured types score high when present, so a lower floor adds noise without adding recall. |

Measured after the correction, on five cases: the imperative name rose to 0.390 and now prompts, the
declarative name rose enough to strip silently, a second name (`Priya Sharma`) prompted at 0.347,
and two PII-free control sentences produced zero tokens and zero prompts. The lower floor bought
recall at no observed false-prompt cost on those controls, which is a small sample and not a rate.

### POST /plan

Request carries only sanitised material: `tokenizedTask`, `sanitizedDom`, `elements`, `history`.
Never `tokens`, never a raw value, never a screenshot unless the caller explicitly opts in.

Response:
```json
{ "plan": { "action": "click", "target_selector": "#login-btn",
            "coordinates": { "x": 245, "y": 680 }, "value": null,
            "reasoning_token": "brief, no PII" },
  "model": "llama-3.3-70b-versatile", "attempts": 1,
  "switched": [], "latencyMs": 412, "warden": "0.1.0" }
```

`switched` lists models that failed before the one that answered, so a fallback is visible in the
step log instead of silent. Fallback chain, tried in order, moving on immediately on HTTP 5xx, 429,
a timeout, or an unparseable body:

1. `llama-3.3-70b-versatile`
2. `openai/gpt-oss-20b`
3. `llama-3.1-8b-instant`

The chain is configuration, not a hardcoded constant, so it can be corrected without a code change.
Every model in it must be a real Groq model id; never invent one to pad the chain.

### POST /validate

Request: `{ "plan": {...}, "elements": [...], "tokenizedTask": "...", "attempt": 1 }`

Response:
```json
{ "verdict": "accept",
  "tier": "reversible",
  "checks": [ { "name": "selector-in-scene", "pass": true } ],
  "reasons": [], "question": null, "warden": "0.1.0" }
```

`verdict` is one of `accept`, `reject`, or `ask`.

Deterministic checks run first and a failure is a hard `reject` with a reason naming the check:
selector present in the submitted scene, coordinates finite and inside the viewport, action in the
allowed set, no unexpected keys, operation tier computed locally, and intent coherence (a task
expressing destructive intent against a scene holding no destructive control rewrites to `done`,
carried over from v3).

Local reasoning runs only after the deterministic checks pass, using `qwythos-9b:latest` over
Ollama, and may downgrade `accept` to `ask` but may never upgrade a `reject`. A reasoning model
cannot overrule a deterministic safety check.

`ask` returns a `question` object the extension renders as an interactive prompt:
```json
{ "id": "q1", "text": "The plan clicks Delete account, which the task did not request. Proceed?",
  "options": [ { "id": "proceed", "label": "Proceed" },
               { "id": "skip", "label": "Skip this step" },
               { "id": "stop", "label": "Stop the run" } ] }
```

### Retry and escalation loop

On `reject`, the extension re-requests a plan, passing the rejection reasons back so the next
attempt is informed rather than a blind retry. Bounded at 3 attempts. After the third, the run
escalates to an interactive question and the user takes the lead. A validation failure must never
silently drop a step or execute anyway.

## The three interactive prompts

All three are popup surfaces, not console log lines, because each one blocks the run pending a human
decision.

| Prompt | Trigger | Resolution |
|---|---|---|
| Uncertain PII | `/strip` returned a span in the 0.35 to 0.60 band | User answers strip or keep. The answer is remembered for the session in `resolved` so the question is asked once. |
| Cloud model switch | A Groq model in the chain failed | No prompt. It switches immediately and surfaces `switched` in the step log, because the spec asks for speed here, not a decision. |
| Validation question | `/validate` returned `ask`, or 3 attempts were exhausted | User picks proceed, skip, or stop. The choice drives the next loop iteration. |

## Degraded modes, stated plainly

The Warden is a separate process the user has to start, so it will sometimes be absent.

| Condition | Behaviour |
|---|---|
| Warden unreachable | The run does not start. The popup says the Warden is not running and how to start it. Falling back to the regex-only browser filter would silently downgrade the privacy guarantee the user was shown, so it is refused rather than degraded. |
| GLiNER not loaded | `/strip` answers 503. Same refusal. A partial filter presented as a filter is worse than an absent one. |
| Groq key missing | `/health` reports `groqConfigured: false` and the popup says so before a run is attempted. |
| Ollama absent | Deterministic validation still runs and is authoritative. Local reasoning is skipped and `checks` records it as skipped, never as passed. |

## Pixel design language

Extracted from the supplied reference video frame by frame on 13 September 2026, not estimated. The
dominant pair and the three accents are measured pixel values.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0B0B0F` | Page and panel ground |
| `--cream` | `#E8E9DE` | Structure, body text, the dominant mass |
| `--amber` | `#FCC34A` | Uncertain, awaiting a human decision |
| `--red` | `#FF0000` | Personal data, destructive tier |
| `--red-deep` | `#B71A00` | Red at rest, borders and fills |
| `--blue` | `#142EFF` | Validated, plan accepted |
| `--blue-deep` | `#1F2181` | Blue at rest |

The cell grid is the signature: a subject is built from discrete square cells on an 8px module,
mixing filled squares with stroke-only outlined squares, thinning to sparse outlines at the edges.
From the first reference image: 1px detection rectangles with micro monospace labels, over a
scanline texture. From the second: a 1-bit dither falloff and a geometric sans paired with a serif
display face.

Motion is stepped, never eased: `steps(n)` timing, cell-by-cell reveal. An eased transition reads as
a modern web animation and breaks the illusion immediately.

The palette carries meaning, which is the whole reason it earns its place: red marks personal data,
amber marks a decision waiting on the user, blue marks a validated plan, cream carries everything
structural. A reviewer can read a run's state from colour alone.

The third reference image is a violet-glow composition. Its centred serif display headline is
adopted. Its palette is not: the workspace rules prohibit generic violet-glow schemes, and the
video's measured palette is both more distinctive and semantically load-bearing here. Recorded as a
deliberate deviation from the supplied reference rather than an oversight.

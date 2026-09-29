# Dhristi v5: local redaction, cloud planning, browser-side checks

**Date:** 29 September 2026
**Authority:** Francis, 29 September 2026: "the redaction part can be local. The rest of it can be done online itself, since that would help us to have a bigger model running locally for one specific task, redaction, and the remaining can run online." The front end must show how the system works without leaning on backend work.
**Supersedes:** the PR #35 brief's "planner = local Ollama on 11434" lock, and the v4 per-step `POST /validate` round trip. Local Ollama stays as an explicit offline planner mode.

## Roles

```
 page ──scan──▶ extension worker ──raw task + raw scene──▶ Warden POST /strip      (loopback only)
                                  ◀── tokens (TYPE#n → value) + sanitized scene     local GLiNER + regex
                extension worker ──sanitized only──▶ Warden POST /plan ──▶ cloud LLM (Groq, default)
                                                      egress guard        or local Ollama (offline mode)
                                  ◀── plan (tokens only)
                extension: plan checks + F17 tier gate + human prompt (all local, no backend)
                content script: execute + rehydrate tokens locally
```

- **Warden** has two jobs: local redaction (`/strip`) and a guarded relay to the planner (`/plan`). It holds the cloud key; the browser never does.
- **Extension** owns every decision about acting: plan schema checks, target-in-scene, F17 tier, intent coherence, human confirmation. It no longer calls `/validate` during a run. The endpoint stays in the Warden for older harnesses only.

## Warden wire changes (additive)

`GET /health` adds:
- `destination`: `"cloud"` when the planner is Groq, `"local"` when it is Ollama.
- `plannerModel`: the first model the planner will try (string or null).
- `planner` keeps `"groq" | "ollama"`; the default is now `"groq"`. `WARDEN_PLANNER=ollama` selects offline local planning.

`POST /strip` changes:
- GLiNER scores text in chunks that fit the model window; a long page no longer loses entities past the window.
- `elements[].label` comes back tokenized with the same tokens as `sanitizedDom`. The extension may still apply its own regex pass on top.
- A value that appears more than once gets one token.
- Each `decisions[]` entry adds `token` and `source` (`task` | `dom` | `label`) so the panel can show what was replaced where. No raw value is added to `decisions`.

`POST /plan` changes:
- **Egress guard:** before any model is called, the Warden runs its deterministic regex layer over every string in the body. Any hit refuses with HTTP 422 `{error, egressGuard: {pattern, field}}` and nothing leaves the machine. TYPE#n tokens never trip it.
- Response adds `destination` (`cloud` | `local`) and keeps `model`, `latencyMs`, `switched`.

## Extension ↔ side panel contract (new messages)

Existing messages (`SESSION_UPDATE`, `PROMPT_*`, `HEALTH_UPDATE`, `OUTBOUND_UPDATE`, `GET_SESSION`, `GET_PROMPT`, `GET_OUTBOUND`, `START_TASK`, `STOP_TASK`, `RETRY_HEALTH`, `SET_WARDEN_ORIGIN`) are unchanged. `HEALTH_UPDATE` adds `destination` and `plannerModel`.

`TRACE_UPDATE { trace }` and `GET_TRACE → trace | null`. The background always sends the WHOLE trace for the current step. Memory only, never written to storage. Shape:

```js
{
  runId, step,                         // numbers
  stages: {                            // one per pipeline node, fixed keys and order
    perceive: Stage, redact: Stage, plan: Stage, check: Stage, act: Stage,
  },
  planner: { destination: 'cloud'|'local'|null, provider: 'groq'|'ollama'|null, model: string|null },
  scene: { controls: number },
  redaction: {
    replaced: [{ token, type, source: 'task'|'dom'|'label', layer: 'regex'|'gliner'|'user', score: number|null }],
    uncertainAsked: number,
    screenMasked: number,              // regions masked in the local screenshot
  },
  screenshot: { dataUrl: string|null, width, height } | null,   // MASKED capture, local display only
  outbound: { path: '/plan', bytes: number, body } | null,     // exact sanitized body that left the browser
  inbound: { action, target, value, reasoning, model, latencyMs, switched: [] } | null, // value is a token or masked
  check: { checks: [{ name, pass, detail }], tier: string|null, gate: 'unattended'|'confirm'|'ask'|'reject'|null, choice: string|null } | null,
  act: { action, target, outcome: 'done'|'navigated'|'failed'|'skipped'|'stopped', error: string|null } | null,
}
Stage = { status: 'idle'|'active'|'done'|'error'|'skipped', ms: number|null, detail: string|null }
```

Rules: `ms` is measured wall time or null, never invented. `trace` carries no vault value: `replaced[]` lists tokens and types only.

`REVEAL_TOKEN { token } → { token, value } | { error }`. Answered from the current run's vault only, on an explicit user click, and only to the extension's own side panel. The value is shown in the panel and never stored.

`HIGHLIGHT_REDACTIONS { tokens: {TYPE#n: value} }` background → content script, after `/strip`: the content script draws labelled boxes over the visible text that was replaced, on the live page, for the length of the run. `CLEAR_HIGHLIGHTS` on run end. The overlay is local DOM; nothing is sent anywhere.

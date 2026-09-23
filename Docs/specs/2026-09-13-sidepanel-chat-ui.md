# DHRISTI side panel: chat surface, frozen for parallel build

Written 13 September 2026. Amends the v4 spec (`2026-09-13-dhristi-v4-warden.md`) for the
presentation layer only. The five stages, the HTTP contract, the trust model and the three
escalation prompts are unchanged.

## Why this exists

Francis was loading `Prototype/extension/`, a v3-era side panel with a local pairing token and
user-facing Capture / Send / Confirm buttons. The v4 build at `extension/` is the Warden-wired one
and already removes those, but it presents as a toolbar popup. `Prototype/extension/` is retired by
this change so there is exactly one extension, and it is the side panel.

## The one-extension rule

`extension/` is the only loadable extension. `Prototype/extension/` gets a README stating it is
superseded and must not be loaded. Two loadable builds is what caused this confusion; it must not
survive the fix.

## Surface

The extension presents as a **Chrome side panel** (`chrome.sidePanel`), opened by clicking the
toolbar icon, pinned to the right. Not a toolbar popup. Manifest gains:

```json
"permissions": ["activeTab", "scripting", "storage", "sidePanel"],
"side_panel": { "default_path": "sidepanel.html" },
"action": { "default_title": "DHRISTI" }
```

Note there is no `default_popup`: a `default_popup` and a side panel are mutually exclusive on one
action, and the popup is what is being replaced. The background calls
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so the toolbar click opens
the panel.

## Chat, not a control panel

The panel is a conversation. A user types a task in natural language into a text box and sends it.
Everything the agent then does appears in the transcript as an activity entry.

**Internal steps are never user actions.** Capture, strip, plan, validate and execute happen because
the agent decided to, and they render as transcript activity. There is no Capture button, no Send
protected layout button, and no Confirm this action button. The user asked for these to be abstracted
away, and they are: they were implementation detail leaking into the interface.

**Genuine decisions stay.** Exactly two things block on the user, because the architecture requires
a human in the loop, not because the implementation is exposed:

| Blocking card | Trigger |
|---|---|
| Uncertain PII | `/strip` returned a span in the uncertain band. Amber. The user decides strip or keep. |
| Validation question | `/validate` returned `ask`, or three plan attempts were exhausted. The user picks proceed, skip or stop. |

These render inline as cards in the transcript, keyboard operable and focus-trapped while pending.
They must survive the panel closing and reopening, because an invisible blocking decision is a hang.

## Transcript entry kinds

| Kind | Rendered as | Colour |
|---|---|---|
| `user` | The task text, right-aligned | cream |
| `stage` | One line per stage: Perceive, Strip, Plan, Validate, Execute, with a real measured value where one exists (controls found, tokens minted, model that answered, verdict) | cream, muted |
| `activity` | A completed internal action, e.g. "Stripped 3 values before sending" | cream |
| `uncertain-pii` | Blocking card, one strip/keep choice per detected span, showing label, score and preview | amber |
| `question` | Blocking card with proceed / skip / stop | amber |
| `blocked` | The server is not running, with the exact start command | red |
| `error` | A real failure, naming what failed | red |
| `validated` | A destructive-tier or reasoned action was accepted | blue |

Red means personal data or a blocked run. Amber means a decision is waiting on the user. Blue means
validated. Cream is structure. The mapping from `DESIGN.md` is unchanged and must stay true in the
markup, not only in the stylesheet.

## Server discovery, no pairing token

There is no pairing token anywhere. It was a v3 concept.

On panel open the background calls `GET /health` at the configured origin, default
`http://127.0.0.1:8756`, overridable in `chrome.storage.local` under `wardenOrigin`. It also
re-checks whenever a task is submitted and on a short interval while the panel is open, so starting
the server after opening the panel recovers without a reload.

| State | What the user sees |
|---|---|
| Reachable, model loaded | A quiet green-ish status line. Ready. |
| Reachable, model still loading | "The local model is loading", with the elapsed wait. Not an error. |
| Unreachable | A red `blocked` card naming the reason and the exact start command, taken verbatim from `warden/README.md`, plus a Retry control. A task submitted in this state is refused, never queued and never sent unredacted. |
| Groq key missing | A muted note that the plan stage will fail until the key is in `warden/.env`. Not an error, since strip still works. |

## Low prominence for the two technical views

`Inspect outbound data` and `Server setup` remain, behind one collapsed disclosure at the foot of
the panel, closed by default. They are diagnostics, not the product. Inspect outbound data shows the
last outbound request body, which is already sanitised. Server setup shows the origin field and the
health detail. Neither is a primary action and neither competes with the task input.

## Pixel treatment

Everything from `DESIGN.md` and `extension/pixel.css` applies to the panel: the `#0B0B0F` ground, the
cell-grid motif on the empty state, stepped motion, no eased transitions, `prefers-reduced-motion`
honoured. A chat surface is where the pixel language has to work hardest, because a transcript is
text-heavy and the temptation is to fall back to a generic dark chat UI. It must not.

The empty state is the one place for the cell motif: an opening message built from the cell grid
explaining in one line that the agent reviews what leaves the browser before it leaves.

## Message contract, frozen

Panel to background: `START_TASK { task }`, `STOP_TASK`, `GET_SESSION`, `PROMPT_RESPONSE { id, answers }`,
`GET_PROMPT`, `GET_OUTBOUND`, `SET_WARDEN_ORIGIN { origin }`, `RETRY_HEALTH`.

Background to panel: `SESSION_UPDATE { entries }` (the whole transcript, so a reopened panel
re-renders from one source), `PROMPT_REQUEST { prompt }`, `PROMPT_RESOLVED { id }`,
`HEALTH_UPDATE { reachable, model, loaded, groqConfigured, elapsedMs, error }`,
`OUTBOUND_UPDATE { body }`.

`entries` is the transcript and lives in the service worker. `HEALTH_UPDATE` carries no secret.
`OUTBOUND_UPDATE` carries the sanitised body only. No vault value and no raw task text may appear in
any `chrome.storage` write; the transcript's uncertain-PII `preview` field is real personal data and
must stay in memory only.

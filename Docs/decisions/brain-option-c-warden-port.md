# Option C — selective Warden port

**Date:** 2026-09-23  
**Branch:** `brain/option-c-warden-port`  
**Decision:** Francis locked Option C. Import the Warden package and the root side panel from the public archive. Do not replace the master Prototype, Website, or wrap HUD.

## Source

| Item | Value |
|---|---|
| Archive | `https://github.com/francisreubenr-rvu/sih26171-dhristi` |
| Branch | `sightline-v2-foundation` |
| Commit | `2afd215d795d781f74c8a45468a86eedfa58253e` |
| Verified | `git rev-parse` of the fetched object equals that commit |

`Docs/decisions/brain-fundamentals-restructure.md` is not on master tip. It exists on open PR #30 (`brain/fundamentals-warden-pivot`). This note does not depend on that file merging.

## What was imported

Real files from `2afd215` only. No empty stubs.

- `warden/` — FastAPI package (`app.py`, strip, plan, validate, tests, `README.md`, `.env.example`, `.gitignore`).
- Root `extension/` — side panel (`manifest.json`, `background.js`, `sidepanel.*`, `pixel.css`, utils, icons). This is the candidate shipping Warden UI.
- `Docs/specs/2026-09-13-dhristi-v4-warden.md`
- `Docs/specs/2026-09-13-sidepanel-chat-ui.md`

No real `.env` was in that tree. `.env.example` has an empty `GROQ_API_KEY=`. `warden/.gitignore` ignores `.env`. Nothing matching a live Groq key was in the imported sources.

## What was not imported and not overwritten

- `Prototype/`, `Website/`, `Benchmarks/`, wrap HUD, and master `Benchmarks/release-status.json` were left as they were.
- `Prototype/extension/` was not deleted. It stays measurement and demo chrome for the master popup. It is not the Warden side panel. Loading it and scoring the Warden is the two-build trap.
- G11 was not flipped. `submission_ready` was not flipped. Both stay as recorded on master: G11 **fail**, `submission_ready` **false**.

## Ports

| Port | Owner |
|---|---|
| `127.0.0.1:8756` | Warden. Bind loopback only. Start: `python -m uvicorn app:app --host 127.0.0.1 --port 8756` from `warden/`. |
| `127.0.0.1:9041` | Master Prototype server and its capture harness. Not the Warden. Do not move the Warden onto 9041. |

## Planner default vs imported code

Phase 1 planner default for this port is **local Ollama** (offline path, default host `http://127.0.0.1:11434`). Tags ending in `:cloud` are not that path.

At the time of this import, the code did not do that yet. `POST /plan` still called Groq and returned 503 when `GROQ_API_KEY` was missing. Ollama in that import was the optional `/validate` reasoning stage, and it may only downgrade `accept` to `ask`.

Follow-up `Docs/decisions/brain-warden-ollama-plan-harden.md` wires the default. `POST /plan` uses local Ollama unless `WARDEN_PLANNER=groq`.

## F17 execute path

`extension/background.js` contains a client-side operation-tier classifier (`opTierLocal`) used inside `planAndValidate` before an accepted plan can run unattended. Destructive and state-changing tiers ask locally even when the Warden returns `accept`. The Warden verdict is necessary and never sufficient.

That gate is **imported source**. This port does not wire it to the Prototype Node server, does not start the Warden, and does not record a new live execute run. Anyone who wires execute later keeps the client-computed tier. Do not trust a server `requiresConfirmation` field in place of it.

## Visual authority

ARCH-002 (`Docs/decisions/brain-arch-pixel-hud-002.md`) remains the visual authority for **Website** and **Prototype**.

Root `extension/pixel.css` is Warden-line archive chrome for the side panel only. The two systems disagree. This port records that conflict and does not invent a third blended system, and it does not restyle Website or Prototype to match the side panel.

## Merge

Draft until Francis confirms. No Pages redeploy from this decision.

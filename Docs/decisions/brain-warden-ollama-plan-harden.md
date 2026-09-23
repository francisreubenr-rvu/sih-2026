# Warden Ollama `/plan` default and extension host allowlists

**Date:** 2026-09-23  
**Branch:** `brain/warden-ollama-plan-harden`  
**Follows:** `Docs/decisions/brain-option-c-warden-port.md` (PR #31, master `11cb4de`)  
**Cites:** SEC-FUND-001; Francis lock that the Phase 1 planner default is local Ollama.

## Planner

`POST /plan` defaults to local Ollama on loopback (`OLLAMA_HOST`, default `http://127.0.0.1:11434`).

- `WARDEN_PLANNER` unset or `ollama`: Ollama only.
- `WARDEN_PLANNER=groq` and `GROQ_API_KEY` set: the optional Groq path in `groq_client.py`.
- Ollama down, a non-loopback `OLLAMA_HOST`, or a model tag ending in `:cloud`: `/plan` returns an error. It does not call Groq.
- Explicit Groq without a key: `/plan` returns an error. It does not call Ollama either.
- The browser still holds no cloud key. Groq, when used, is read by the Warden process from the environment or `warden/.env`.

`/validate` local reasoning is unchanged. It may only downgrade `accept` to `ask`, and a missing Ollama there is still recorded as skipped. The client operation-tier gate in `extension/background.js` (`opTierLocal`) is unchanged.

G11, G20, and `submission_ready` are not changed by this note.

## Extension host permissions (SEC-FUND-001)

Install-time `host_permissions` are loopback only:

- `http://127.0.0.1:8756/*` and `http://localhost:8756/*` (Warden)
- `http://127.0.0.1:7860/*` and `http://localhost:7860/*` (OmniParser)

`activeTab`, `scripting`, `storage`, and `sidePanel` stay. The blanket `<all_urls>` entry was removed from `host_permissions`.

Stored `wardenOrigin` and `omniparserUrl` are accepted only for `http` or `https` on `127.0.0.1`, `localhost`, or `::1`, with no userinfo, query, fragment, or path. Anything else is refused and is not fetched.

## Residual risk

Page scan still needs to run on the tab the user is working on, including after a click navigates that tab. `activeTab` alone ends on navigation, so a static content script is not declared at install. Instead:

- `optional_host_permissions` includes `<all_urls>`.
- The side panel requests that origin when the user sends a task (a user gesture).
- After the grant, the service worker registers `utils/visualizer.js` and `content.js` for `<all_urls>` and injects them into the task tab.

That grant is broad. Once the user allows it, the extension can read and change pages it is scanned on, for as long as the permission remains. Denying the prompt stops the task. Nothing is sent.

`web_accessible_resources` still lists `utils/redactor.js` with `matches: ["<all_urls>"]`. That is not a host permission. It lets the content script import the redactor on the page being scanned. A page that knows the extension id can read that file. The file is the regex redaction patterns. It does not contain a cloud key.

The Warden still binds `127.0.0.1` only, port `8756`. It does not bind `0.0.0.0` and does not use port `9041`.

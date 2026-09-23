# Root `extension/` — Warden side panel

This folder is the candidate shipping Warden UI, imported from
`francisreubenr-rvu/sih26171-dhristi` at commit `2afd215d795d781f74c8a45468a86eedfa58253e`.

Load **this** directory as an unpacked extension when you want the Warden side panel.

Do **not** load `Prototype/extension/` as the Warden. That folder is the master-line
measurement and demo popup (port **9041** harness). Loading it and then judging the
Warden panel is the two-build trap recorded in
`Docs/decisions/brain-option-c-warden-port.md`.

`pixel.css` in this folder is Warden-line archive chrome for this surface only.
Website and Prototype visual authority stays ARCH-002
(`Docs/decisions/brain-arch-pixel-hud-002.md`). Do not blend the two into a third system.

The panel expects the Warden on `http://127.0.0.1:8756`. Start commands are in
`warden/README.md`. `POST /plan` defaults to local Ollama. Stored `wardenOrigin` and
`omniparserUrl` values are refused unless they are loopback.

Install-time host permissions are loopback only (Warden `8756`, OmniParser `7860`).
Page scan uses `optional_host_permissions` `<all_urls>`, requested when you send a
task. After that grant, the content script is registered for later navigations.
`web_accessible_resources` still matches `<all_urls>` so the content script can import
`utils/redactor.js`. That exposes the redaction patterns to pages, not a cloud key.
See `Docs/decisions/brain-warden-ollama-plan-harden.md`.

`extension/background.js` includes the client operation-tier gate (F17). Keep that gate
when wiring execute. This import does not connect the loop to the Prototype server.

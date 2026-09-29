# Root `extension/` — Warden side panel

This folder is the candidate shipping Warden UI, imported from
`francisreubenr-rvu/sih26171-dhristi` at commit `2afd215d795d781f74c8a45468a86eedfa58253e`.

Load **this** directory as an unpacked extension when you want the Warden side panel.

Do **not** load `Prototype/extension/` as the Warden. That folder is the master-line
measurement and demo popup (port **9041** harness). Loading it and then judging the
Warden panel is the two-build trap recorded in
`Docs/decisions/brain-option-c-warden-port.md`.

Since 29 September 2026 (v5) the roles are: the Warden redacts on this device and relays
the sanitized request to a cloud planner; this extension checks every plan and acts. Decision:
`Docs/decisions/brain-v5-local-redaction-cloud-planner.md`. Contract:
`Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md`. The side panel shows the
work live: a device/cloud pipeline with measured times, the exact body that left the browser,
the tokens kept on this device (a value is shown only on Reveal), the masked screen and the
local checks. On the page, labelled boxes mark each value replaced before planning.

Styling is the Signal system (`DESIGN.md`).

The panel expects the Warden on `http://127.0.0.1:8756`. Start commands are in
`warden/README.md`. `POST /plan` defaults to the cloud planner (Groq, key in `warden/.env`);
`WARDEN_PLANNER=ollama` is the offline mode. Stored `wardenOrigin` and
`omniparserUrl` values are refused unless they are loopback.

Install-time host permissions are loopback only (Warden `8756`, OmniParser `7860`).
Page scan uses `optional_host_permissions` `<all_urls>`, requested when you send a
task. After that grant, the content script is registered for later navigations.
`web_accessible_resources` still matches `<all_urls>` so the content script can import
`utils/redactor.js`. That exposes the redaction patterns to pages, not a cloud key.
See `Docs/decisions/brain-warden-ollama-plan-harden.md`.

`extension/background.js` runs the plan checks (`utils/plan-check.js`) and the client
operation-tier gate (F17) locally (`planAndValidate`); since v5 it no longer calls the Warden's
`POST /validate`. Destructive steps always ask; state-changing steps ask for local confirmation. Since francisreubenr-rvu/sih-2026#35, the scan gives each control an
opaque per-scan handle held only in the content script, execute resolves that handle (never a
selector), refuses hidden, covered, offscreen, detached or stale targets, and re-derives the tier
from the live element before clicking. The local tier comes from the extension's own scan, and
anything the local gate cannot tier is refused. Evidence: unit tests, the real `background.js`
against a fake Warden, `content.js` in real Chromium, and one loaded-extension run against a real
Warden with GLiNER and a fake cloud planner (`scripts/e2e-v5/`,
`Benchmarks/results/e2e-v5-boundary-v01.json`: 3 steps, 0 personal values in the 3 cloud
requests). Iframes and shadow DOM are not covered. Tests: `node --test extension/utils/loopback.test.mjs extension/tests/*.test.mjs`
(needs `Prototype/node_modules` and a Chromium). This surface is not connected to the Prototype
server on 9041.

G11 timing for this surface is `scripts/g11-warden-option-c-harness.mjs`. Run notes:
`Docs/decisions/g11-warden-option-c-harness.md`. A dry run writes a fail artifact and
does not call the Warden. A live L2 run needs this extension loaded, Warden on
`127.0.0.1:8756`, and a planner probe of `POST /plan`.

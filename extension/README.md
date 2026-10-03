# Root `extension/`: Warden side panel

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
`WARDEN_PLANNER=ollama` is the offline mode. A stored `wardenOrigin` must be
`http://127.0.0.1:<port>` (since 3 October 2026; `localhost` can resolve to `[::1]`, where another
process could relay); `omniparserUrl` must be loopback.

**Pairing (required since 2 October 2026).** Make a secret with `python warden/pairing.py new`, put it
in `warden/.env` as `WARDEN_PAIRING_SECRET`, restart the Warden, and paste the same value into
Settings > Pairing code. Without a code the extension sends nothing and starts no run. Every request
carries an HMAC proof and every response must carry one back; the code itself never crosses the
wire. Before each `/strip` the extension checks a signed `/health`, so a process that takes the port
mid-run never receives page text.

**Run safety (3 October 2026).** A run is bound to the origin it started on: if the tab moves to
another site, the next step asks (naming the new site) or stops. Confirmation questions name the
action, the control's label from the extension's own scan, any typed value as tokens, and the site.
Answers to "is this personal data?" questions are tied to the exact value and end with the run.
Only the extension's own pages can control the worker; content scripts cannot.

Install-time host permissions are loopback only (Warden `127.0.0.1:8756`, OmniParser `7860`).
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

Since 3 October 2026 the extension runs a vision model on this device. Each step's capture goes
to an offscreen document (`offscreen.html`, `offscreen.js`, `utils/vision.js`) that runs the
bundled UltraFace RFB-320 face detector on ONNX Runtime Web (WASM, single thread). The service
worker cannot load ONNX Runtime (no dynamic `import()` in service workers), which is why it runs in
the offscreen document. The worker asks for faces over a runtime Port that only the offscreen document
listens on and that answers only the worker (`utils/vision-client.js`). Face boxes are padded and
added to the masked regions, so the masked capture in the panel, and the only image OmniParser may
see, has detected faces painted over. A failed or late check (cap 1500 ms; the one-time model load
has its own 10 s cap and starts at START_TASK) discards that step's capture: the panel shows none
and OmniParser gets nothing. The run continues, because the planner never sees pixels. Nothing new
goes to the Warden or the cloud. The manifest gains the `offscreen` permission and an
`extension_pages` CSP of `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. Without it the
offscreen document cannot compile the WASM runtime. The step trace carries `vision` (faces,
measured ms, or the failure reason), and the G11 clock has a `vision` span kept out of `perceive`.
Model and runtime files with their MIT licences are in `models/` (same bytes as
`Prototype/models/`; provenance in `Prototype/models/manifest.json`). `dhristiVisionProbe` is a
worker-only global used by `scripts/validate-extension-vision.mjs`. Evidence is in
`Benchmarks/results/extension-vision-v01.json`, from one container on synthetic pages with one
public-domain test portrait. It is not a face-detection accuracy benchmark, and small faces are
missed (see its `limits`).

G11 timing for this surface is `scripts/g11-warden-option-c-harness.mjs`. Run notes:
`Docs/decisions/g11-warden-option-c-harness.md`. A dry run writes a fail artifact and
does not call the Warden. A live L2 run needs this extension loaded, Warden on
`127.0.0.1:8756`, and a planner probe of `POST /plan`.

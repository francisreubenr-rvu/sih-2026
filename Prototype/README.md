# Sightline — SIH26171 prototype

An implemented local demonstration of browser vision → protected semantic layout → open-weight server reasoning → reviewed browser action. This is an engineering candidate, not a completed competition submission.

## Start

Requires Node.js 22+ with `node:sqlite`, npm, and Ollama. Verified locally on Node26 / Apple M1 Pro (16 GB memory). Model assets are packaged locally; no browser CDN is used.

```sh
cd Prototype
npm ci
node ../scripts/build-prototype.mjs
ollama serve
# In another terminal, only if the model is not installed:
ollama pull qwen2.5:7b-instruct
# In another terminal from Prototype:
npm start
```

Open `http://127.0.0.1:9041/`. The model is a separate server process. Never expose the Ollama port publicly. Settings are in `.env.example`; export environment variables yourself or use Node's `--env-file` option. `.env.example` is documentation, not loaded implicitly.

1. Select **Review a pending request**.
2. **Capture & protect** runs local WASM face inference and builds the preview.
3. Inspect the protected layout / outbound JSON; **Ask the local model**.
4. Review and **Confirm this action** to open Pending.
5. Repeat capture → model → confirm to open Review. The fixture heading becomes **Request ready for review**.

The fixture has explicitly synthetic account data and a public-domain NASA astronaut image for face testing. There is no real account or external form submission. Capture expiry is 30 seconds: after any change or delay, recapture. Token copying is for locally installed extension pairing only.

## Browser extension

```sh
node ../scripts/build-extension.mjs
```

Load `Prototype/extension-build/` unpacked in Chrome. For Firefox, copy `manifest.firefox.json` over `manifest.json` in a separate copy of the build and load temporarily through `about:debugging`. These package builds exist; actual Chrome/Firefox extension operation is still awaiting browser-specific validation.

Open the popup's **Server setup**, copy its exact extension origin into `ALLOWED_ORIGINS`, and restart the Node server. In the local workspace choose **Copy pairing token** and paste into the extension. Token storage is session-only. Native active-tab capture runs locally; the screenshot is never part of the API payload. Only user-activated `activeTab`, `scripting`, `storage`, and localhost server permissions are requested. Browser-internal/restricted pages can reject capture and show an error.

## Tests and builds

```sh
npm test
node ../scripts/build-prototype.mjs
node ../scripts/build-extension.mjs
npm audit --omit=dev
```

Node tests cover schema rejection, geometry bounds, unsafe commands, HTTP auth/origins, request-size/rate limits, provider error handling and detector math. Browser evidence is recorded separately in `Benchmarks/results/prototype-v01-browser.json`; unit tests use explicit model test doubles, while recorded manual workflow uses real Qwen2.5.

## Data and security

`data/audit.sqlite` is created/migrated on startup with parameterized writes. It stores only counts/timing/action type, up to 1000 records. No screen, prompt, name, URL or pairing token is stored in the audit. `data/pairing-token` is local mode0600 and ignored by Git. Do not share it. To rotate, stop server, remove that exact token file and restart, then pair clients again.

For a consistent backup, stop Node and copy the entire local `data/` directory to a private location; restore while stopped. Do not commit backups. The app does not need seeded database rows. **Reset demo** resets synthetic browser state independently of audit history.

The authenticated API is `/api/v1/plans`; strict JSON, max256KiB, 20requests/min, max2 in-flight, fixed provider URL, timeouts, exact origin allowlist. Public deployment requires `HOST`, `PUBLIC_ORIGIN` (HTTPS), and `SIGHTLINE_TOKEN` (24+ characters) behind a TLS reverse proxy. GitHub Pages hosts only the static project website and cannot run this server.

## Known limitations

- Current export is conservative semantic layout, not a redacted original screenshot. Useful text/images are removed. Visual-context accuracy and redaction precision need dataset evaluation.
- Face model can miss small/occluded faces. Its output never authorizes raw image transmission. PII regex detects some email/numeric strings; unknown strings are still excluded.
- The demo capture adapter uses html2canvas; the extension uses native tab capture. Browser-specific testing remains separate.
- Current server LLM interprets layout geometry/labels, not PNG images; no VLM claim.
- Three task intents and an approved control vocabulary bound the current workflow. Arbitrary navigation, typing and irreversible submissions are not implemented.
- Initial live server steps took seconds, so the original <200ms full-flow guardrail is not passed. A fast local capture observation does not replace that requirement.
- No representative-user study, broad WCAG conformance, benchmark saturation, final pitch deck, final Stitch comparison, public backend deployment or screen-recording fallback is claimed yet.

## Additional validation evidence — 10 September

Run `npm test` for the current 39 automated tests. With the app running, open `/app/validation.html` and run the browser checks plus the 31-second expiry check. This harness tests the shared JavaScript boundary on synthetic fixtures, not an installed native extension. The recorded Chrome run passes 18 checks in `Benchmarks/results/chrome-boundary-v02.json`.

`Docs/decisions/model-pilot.md` preserves all real-model development results, including the latest Qwen7B 22/24 result and remaining errors. The continuous recording is `Docs/demo-recording/sightline-browser-v02.mp4`. Both remain scoped to the synthetic browser demo.

## External raster diagnostic and worker experiment

The repository includes 100 released synthetic WebPII test screens under `app/bench-assets/webpii-test100/`, with source attribution in `Raw/datasets/webpii-test100/`. These are dataset reproductions, not real user screenshots or partner endorsements. Run `python3 ../scripts/fetch-webpii-test100.py` from this directory to verify the frozen image hashes.

Open `/app/benchmark.html` after building. The main-thread and worker buttons run separate 100-case local measurements with ten warmups. They do not call the server model. The worker remains experimental; the primary workspace still uses its tested existing detector. Current suite: 42 passing prototype tests. Seven separate scorer tests run with `python3 -m unittest discover -s scripts/tests -v` from the repository root.

Read `Docs/decisions/raster-evaluation.md` before quoting results. Full-image masking covered all selected PII regions while preserving zero original visual pixels; no claim of broad PII accuracy or task utility follows.

## Experimental local text privacy lab

After `npm ci --ignore-scripts` and `npm run build`, open `/app/text-preview.html` on the local prototype server. This separate development page runs Tesseract.js English OCR and a quantized BERT-small PII model over three authored synthetic screens. It displays sensitive-token detection, retained interface text and timings. It never calls the reasoning endpoint. Reconstructed text may include missed entities; the page is a local diagnostic, not an approved anonymized export.

Model and language files are pinned in `Raw/domain/ocr-pii/asset-manifest.json`. `python3 scripts/fetch-ocr-pii-assets.py` from the repository root restores their declared upstream revisions if needed. The build copies the OCR worker and WASM runtime from the pinned npm dependencies. These generated runtime copies are ignored by Git. Model provenance and limitations: `Docs/decisions/reference-informed-plan.md`.

Validation as of 10 September: build and 48 automated tests pass. The browser tool blocked navigation to the local preview, so no browser OCR/NER accuracy, latency or visual QA result has been established. Chrome/Firefox extension verification remains separate. The lab is not integrated into the v0.1 outbound scene or native extension.

## Experimental bounded synthetic runner

`/app/task-loop.html` is linked from the main workspace. Start authorizes safe actions in the built-in synthetic fixture only. The runner uses the existing local vision and model adapters, reobserves after each action and checks declared fixture postconditions. It stops after 8 actions, 90 seconds, two unchanged observations, cancellation or an execution error. A model's `done` reply alone cannot produce a completed status.

The full suite now has 58 passing tests, including 10 coordinator cases. Build passes. Browser execution and visual QA of this new page remain unverified; the native extension still uses the existing manual review flow. See `Docs/decisions/reference-informed-plan.md` for acceptance scope and remaining tests.

## Experimental local-reference draft flow

Open `/app/local-reference.html` from the workspace. Capture the synthetic report contact, inspect the protected layout/request, ask the local model, then confirm the exact local draft fill. The email stays in the fixture and a client-memory vault; the model receives an expiring random reference, field type and geometry. `POST /api/v2/local-plans` returns only an allowed reference/field pair or `done`. No report is submitted. This separate protocol does not enable typing in the native extension or v1 action API.

References are bound to the original target object and page revision, require confirmation, expire after 30 seconds, and are consumed before writes. Reset/navigation revokes the vault. The current adapter only supports the authored synthetic email field; arbitrary-site input handlers can transmit typed values and require a different authorization/integration review.

Validation: 68 automated tests, three correct authored real-Qwen provider cases, and a running-server/SQLite readback pass. Browser DOM execution, visual QA and native-extension support for this feature remain unverified. Evidence and failed attempts: `Docs/decisions/local-reference-pilot.md`.

If the configured Ollama endpoint no longer lists the required model, check that service's model directory before downloading weights again. This development machine currently uses a separate instance on `127.0.0.1:11436` with the existing Qwen cache; the private `.env` points to it. Fresh installations may use the standard port 11434. Both the model service and prototype server must be running; a static Pages site cannot host them.

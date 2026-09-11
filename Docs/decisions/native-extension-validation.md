# Native-extension validation harness

11 September 2026. `scripts/validate-extension.mjs` loads the built unpacked extension into a throwaway Chromium profile and checks, from inside the browser, that it registers, injects, enforces its label allow-list and can reach its declared local server. Recorded run: 8 passed, 0 failed, 1 informational. Complete output in [the result file](../../Benchmarks/results/extension-native-v01.json).

This narrows the native-extension gate. It does not close it, and it is not a PII-accuracy or performance measurement.

## Why the operator's browser is untouched

The harness calls `chromium.launchPersistentContext` against a fresh `mkdtemp` user-data-dir that is deleted in a `finally` block, with `--disable-extensions-except` and `--load-extension` pointing at the absolute `Prototype/extension-build` path. The normal Chrome profile is never opened, so nothing in the operator's own browsing state is read or written.

`Prototype/extension-build/` is gitignored. Rebuild it with `node scripts/build-extension.mjs` after any source change, or the harness tests a stale bundle.

## How the extension id is derived

An unpacked extension has no id in its manifest; Chrome computes one from the absolute install path. The harness reproduces that rule: `sha256(absolutePath)`, take the first 32 hex characters, and map each nibble `0-f` to `a-p`. For this checkout that yields `bimcbkphmeboblldpplkeenglfjjmhkh`.

The derived id is then **verified** rather than assumed: the harness navigates to `chrome-extension://<id>/manifest.json` and requires HTTP 200 plus a parsed manifest whose name and version match the built file. If the derivation rule ever changes, that check fails loudly instead of silently testing nothing.

## Why there is no service-worker check

The manifest declares no `background` key. This extension is popup-driven: the content script is injected on demand through `chrome.scripting.executeScript` when the operator asks for a capture. Chromium therefore exposes no service worker to wait on, and an earlier version of this harness that waited for one produced a false failure. `background_service_worker` is now recorded as `info` with that explanation.

## Checks performed

| Check | What it proves |
|---|---|
| `extension_loaded` | Chromium loaded the unpacked bundle and serves its manifest |
| `manifest_parsed` | The live manifest is MV3 and matches the built name/version |
| `content_script_injection` | `content.js` executes in a real page and registers `__sightlineController` |
| `collect_protected_scene` | The controller collects exactly the 3 allow-listed fixture controls |
| `unlisted_control_refused` | A button labelled "Approve transfer" never reaches the exported scene |
| `popup_loaded` | `popup.html` loads as an extension document |
| `popup_module_executed` | The popup module bundle runs and binds its controls |
| `host_permission_reachable` | The extension origin can `fetch` the declared local server |

The fixture carries allow-listed labels (`Pending`, `Next`, `Cancel`) and a synthetic value only. Labels outside `SAFE_LABELS` are refused by design, so a fixture using them would make the control count meaningless. The negative check exists so the allow-list is proven to be a refusal rather than a filter of convenience.

## The defect this harness found

`crypto.randomUUID()` is gated to secure contexts, so it does not exist on a plain `http://` page — exactly the extension's target. `createPageAgent()` called it unconditionally, threw, and `content.mjs` never registered `globalThis.__sightlineController`. The extension was inert on every non-HTTPS page.

`Prototype/shared/random-id.mjs` now exports `newRevisionId(source, { allowWeakFallback })`: it prefers `randomUUID`, falls back to a UUID v4 built from `getRandomValues`, exposes an explicit `weakRevisionId()` nonce for callers that accept `Math.random`, and throws when no crypto source exists at all. Both `page-agent.mjs` call sites and the default `randomId` in `local-values.mjs` use it. Two regression tests cover a page with no secure-context `randomUUID` and a source that reports a crypto object it cannot use; the suite is 77 tests, all passing.

The harness reproduced the original failure as `page_errors: ["crypto.randomUUID is not a function"]` before the fix and passes after it.

## What this does not prove

- **Chromium only.** A Firefox manifest is shipped but Firefox is not exercised here.
- **The toolbar path is not driven.** The popup is opened as an extension document, not through the toolbar action, so `chrome.tabs.captureVisibleTab` and the pairing-token round trip remain unexercised.
- **Injection is not through the production path.** Step 2 uses `page.addScriptTag`, which runs in the page's main world rather than the isolated content-script world Chrome gives `chrome.scripting.executeScript`. `chrome.runtime` is therefore absent and `content.js`'s own `chrome.runtime.onMessage.addListener` call throws *after* the controller is already registered. Expect a page error naming "onMessage" on every run; it does not indicate a production failure, and the production path is not covered here.
- **No accuracy or latency claim.** This is extension load, injection and host-permission reachability. It says nothing about PII recall, redaction precision or the 200 ms full-flow budget, which remains failed.

A stopped local server is recorded as `info` rather than `fail`, so an environment fact never masks a real host-permission failure.

## Reproduction

```
node scripts/build-extension.mjs
cd Prototype && node --env-file-if-exists=.env server/index.mjs   # separate terminal
node scripts/validate-extension.mjs --json Benchmarks/results/extension-native-v01.json
```

Exit code 0 requires `verdict: pass`. Without the server the host-permission check records `info` and the run can still pass.

Native Firefox execution, the toolbar capture path, broader privacy and utility datasets, client resource budgets, independent domain validation and human review remain open.

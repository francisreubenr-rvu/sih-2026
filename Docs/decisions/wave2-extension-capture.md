# Wave 2 — extension capture path (14 September 2026)

## What was proven

`scripts/validate-extension-capture.mjs` loads the unpacked MV3 build into Playwright Chromium for Testing (not branded Google Chrome — branded Chrome ignores `--load-extension`).

On `http://127.0.0.1:9041/app/fixture.html` (matches `host_permissions`):

1. **Production injection:** `chrome.scripting.executeScript({ files: ['content.js'] })` from the extension origin registers the controller (isolated world — not `page.addScriptTag`).
2. **Collect:** `chrome.tabs.sendMessage` returns three allow-listed controls (`Pending`, `Completed`, `Next`) and a revision id.
3. **Sanitized egress:** semantics JSON built from the collected scene contains no `data:image`, screenshot, or pixel fields.
4. **Production capture gate:** with the shipped manifest (`activeTab` + local host permission), `chrome.tabs.captureVisibleTab` refuses without a toolbar user gesture: *"Either the '<all_urls>' or 'activeTab' permission is required."* This is recorded as a pass for the permission model, not a product defect.
5. **Harness overlay:** a temporary copy of the build adds `<all_urls>` only inside a deleted temp directory. That overlay successfully captures a PNG (~38 ms, ~78 KiB data-URL) while the outbound semantics body still excludes capture bytes. **Shipped `Prototype/extension/manifest.json` is unchanged.**

Native load/inject refresh: `Benchmarks/results/extension-native-v02.json`.

## What remains open

- Toolbar glyph / true `activeTab` user-gesture automation.
- Firefox live unpacked run (manifest + `browser ?? chrome` shipped; no Firefox binary on this box).
- Pairing-token planner / Ollama E2E (service unreachable this wave).
- PII accuracy and full-flow <200 ms (G11 remains fail).

## Reproduction

```
cd Prototype && npm run build:extension
# optional: start server, or let the harness spawn it
SIGHTLINE_CHROMIUM=$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
  xvfb-run -a node ../scripts/validate-extension-capture.mjs \
  --json ../Benchmarks/results/extension-capture-v01.json
```

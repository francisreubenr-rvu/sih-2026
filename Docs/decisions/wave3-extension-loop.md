# Wave 3 — extension capture→review loop + packaging (14 September 2026)

## What was proven

`scripts/validate-extension-loop.mjs` drives the **production popup UI** (`#capture`) in Playwright Chromium:

1. Shipped manifest still refuses `captureVisibleTab` without toolbar `activeTab` / `<all_urls>` (permission gate pass).
2. Popup stage strip, EN/HI trust chip, and toolbar guidance copy are present.
3. Under a **temporary harness-only `<all_urls>` overlay** (shipped manifest unchanged), clicking **Capture & protect** completes inject → collect → capture → filter → sanitize → review with selective-pixelate preview; outbound JSON excludes capture bytes (`extension-loop-v01.json`, 8 pass / 0 fail).
4. Tab resolution prefers http(s) pages when the popup is opened as a document tab (developer path); toolbar users still get the true active tab.

Native refresh: `extension-native-v03.json`. Packaging: extension **0.1.1** with DigiLocker-credible icons; Chrome + Firefox zips under `Docs/` and `Website/downloads/` (OCR/PII lab weights excluded). Security scan: `Benchmarks/results/security.json` (0 high findings).

## What still needs a human

- **Chrome toolbar glyph click** — Playwright cannot invoke the action UI; production `activeTab` grant remains a human gesture for the shipped manifest.
- **Firefox live unpacked run** — package + `browser ?? chrome` exist; no Firefox binary on this host.
- **Live Ollama/Qwen planner E2E** — :11434/:11436 unreachable this wave; skipped, not faked.

## Guardrails

G06 and G07 moved **unknown → pass** on sanitize hooks + unit validation + synthetic-boundary/secret-scan evidence. G11 remains **fail**. Official rubric score remains **null**.

## Reproduction

```
cd Prototype && npm run build:extension
xvfb-run -a node ../scripts/validate-extension-loop.mjs \
  --json ../Benchmarks/results/extension-loop-v01.json
```

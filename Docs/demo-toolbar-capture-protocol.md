# Demo protocol — production Chrome toolbar Capture & protect (Fast / privacy-only)

**Status:** Protocol only. **Do not claim G03 pass** until a completed human log exists and Guardrails acceptance is met.  
**Related stub:** `Benchmarks/results/toolbar-capture-log-v01.json` (empty until first run).  
**Harness honesty:** `scripts/validate-extension-*.mjs` overlay paths are **not** this protocol.

## Purpose

Exact steps for a human operator to exercise the **shipped** MV3 extension via the **Chrome toolbar glyph** (`activeTab`), privacy-only **Fast** path — no planner, no Ollama, no Google login, no purchases.

## Preconditions

| Item | Requirement |
|------|-------------|
| Browser | Google Chrome (stable) on the operator machine — record exact version |
| Extension | Unpacked `Prototype/extension-build/` built from a frozen commit (`git rev-parse HEAD`); version **0.1.1** (or note if different) |
| Node | 22+; `cd Prototype && npm ci && npm start` → `http://127.0.0.1:9041/` (local server for fixture; planner **not** required) |
| Ollama | **Off / unused** — leave **Privacy-only / Fast** checked |
| Fixture | Synthetic only: `/app/fixture.html` or operations desk — no real accounts |
| Permissions | No Google account login required for Capture & protect on localhost fixture |

## Exact steps

1. Freeze evidence identity: record `git rev-parse HEAD`, date/time (UTC), machine OS/arch, Chrome version, extension version from `chrome://extensions`.
2. `cd Prototype && npm ci && node ../scripts/build-extension.mjs` (or `npm run build:extension`). Confirm `extension-build/` is current.
   - **After any branding/rebuild:** chrome://extensions → **Remove** Dhristi → rebuild → **Load unpacked** again → pin → then Capture. Do not Capture against a half-replaced tree (DBG-001 H2). Build now stages then renames; still prefer a clean Remove/Load.
3. `npm start` → open `http://127.0.0.1:9041/app/fixture.html` in a normal tab (not `chrome://`).
4. Chrome → **Load unpacked** → select `Prototype/extension-build/`. Pin **Dhristi** to the toolbar.
4a. **Reload immediately before each streak Capture** (chrome://extensions → Dhristi → Reload). Do not skip Reload between G14 consecutive runs (DBG-002 H4). For **multi-site / public** hops, Reload between sites as well (DBG-003 H4). After any rebuild: Remove → rebuild → Load unpacked (DBG-001).
4b. **Fixture-only tabs:** keep only the local fixture / operations desk open. Close production, personal, and GitHub tabs before Capture (DBG-002 H2/H4).
5. **Click the Dhristi toolbar icon** (required for `activeTab`). Do **not** open `popup.html` as a bookmarked tab or via “Inspect views” as the capture gesture. On open, status may briefly show “Loading local vision…” (sandbox ORT warm); wait until ready before Capture if still loading. After navigating to another site, always close/reopen via a **fresh toolbar click** before Capture (DBG-003).
6. Confirm UI: trust chip “on this device” / “इस उपकरण पर”; path chip **Fast**; **Privacy-only** checked; Score disabled if shown.
7. Click **Capture & protect**. Watch stage strip: inject → … → review.
8. Confirm selective or wireframe **local** preview appears (faces/sensitive regions mosaicked).
9. Inspect outbound / semantics JSON panel: **no** `screenshot`, `dataUrl`, raw pixels, or image blobs.
10. **Stop** (privacy-only). Do not Send protected layout / Ask model for this evidence run.
11. Optional controlled failure: attempt capture without a prior toolbar gesture (or from a restricted page), then recover by closing popup → toolbar click → retry.
12. Save screenshots and fill the log stub (below). Do **not** flip G03 in `Guardrails/guardrails.json` from this file alone.

## Multisite / public-page Capture (DBG-003)

Blind public multi-site smoke after PR#17/#22 showed intermittent MV3 balloon crashes when hopping sites without Reload / fresh toolbar gesture, while heavy PNG decode + selective mosaic still ran in the popup.

**Operator rules (required for multi-site):**

1. **Reload** the extension between sites (or immediately after any chrome://extensions **Errors** badge). Fixture G14 streak rules still require Reload before each consecutive Capture.
2. After every **navigation** or tab switch: close the popup → **fresh toolbar click** on the target page → wait past “Loading local vision…” → Capture. Do not Capture across a navigation with the same popup open (DBG-003 H3 — Capture refuses with a clear status if the tab URL changed since toolbar open).
3. Prefer the default **wireframe** preview on public / heavy pages; uncheck only when you need selective mosaic review (mosaic now runs in the sandbox, but wireframe stays cheaper).
4. If the sandbox soft-restarts (“Local vision sandbox restarted…”) and Capture still fails, **Reload** — Chrome may still attribute sandbox process death to the whole extension.
5. Close unused heavy tabs when possible. Fixture-only is not required for blind smoke, but reduces GPU / SharedImage pressure.

**Honesty:** Multi-site smoke with fewer crashes is hardening evidence — **not** a G03 pass.

## What to log (copy into the stub JSON / notes)


| Field | What to record |
|-------|----------------|
| `run_id` | Unique id (e.g. `toolbar-YYYYMMDD-01`) |
| `operator` | Initials or anonymized id (not email) |
| `recorded_at` | ISO-8601 UTC |
| `git_sha` | Full or short SHA of the build |
| `browser` | `Chrome <version>` |
| `os` | OS + arch |
| `extension_version` | From manifest / chrome://extensions |
| `path` | Must be `fast-privacy-only` |
| `ollama_used` | `false` |
| `stages_observed` | e.g. inject→detect→mask→review |
| `preview_ok` | true/false — selective/wireframe visible |
| `semantics_only_ok` | true/false — no screenshot/dataUrl in egress |
| `activeTab_ok` | true/false — capture succeeded after toolbar gesture |
| `metrics` | Any popup Fast-path ms strings **as displayed** (label as Fast ≠ G11); empty if none |
| `screenshots` | Paths under `Benchmarks/results/` or `Docs/demo-recording/` where stills were saved |
| `notes` | Failures, HI/EN language, anything unexpected |
| `g03_claim` | **Always `false`** in the stub until Gate owners update Guardrails with multi-scenario acceptance |

## Screenshot destinations (suggested)

Create a dated folder only when a real run happens (do not invent PNGs):

- `Benchmarks/results/toolbar-capture-screens/<run_id>/01-fixture.png`
- `…/02-popup-fast-chip.png`
- `…/03-preview-review.png`
- `…/04-semantics-json.png`

Reference those paths in the log’s `screenshots` array.

## What this is not

- Not a G03 pass (reproducible complete multi-scenario workflow + persistence).
- Not a G11 pass (Fast local protect ≠ planner-inclusive &lt;200 ms full-flow).
- Not proof that Playwright/Chromium harness overlay clicked the toolbar glyph.
- Not a Firefox live validation.
- Not a Score-path or Reason-path evidence run.

## Pointers

- Judge one-pager: `Docs/demo-judge-checklist.md`
- General runbook: `Docs/demo-runbook.md`
- Human demo script: `Docs/dhristi-human-demo-script.md`
- CI / doubles: `Docs/decisions/brain-72h-ci-demo.md`

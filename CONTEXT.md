# Dhristi: SIH26171

## Session handoff: start here (2 October 2026)

**Where the work is.** PR #42 (Laya plan reviewer and release) and PR #41 (fast path, Groq settings, Laya fast-path training, now parked) are merged into `master` (`3314513`). Open: PR #44 on `claude/lucid-fermat-6dkxla`. It adds Hindi and missing-verb destructive rules, and makes extension-Warden pairing required (`warden/pairing.py`, `WARDEN_PAIRING_SECRET`, Settings > Pairing code). Current review and ordered plan: `PLAN.md`, "Review and next steps (2 October 2026)". Findings: `ROAST.md` rounds 28 and 29. Decision: `Docs/decisions/brain-laya-plan-review.md`.

**Decided by Francis (2 October):**

- Working deadline 16 October 2026.
- G20 unpaused, with the protocol and forms refreshed for the v5 side panel; still `unknown`, zero sessions.
- Jev fast path disabled in code but kept.
- Installs approved, provided nothing destructive happens in the container.

The two-week schedule is in `PLAN.md`.

**Since pairing is required:**

- A Warden with no secret refuses every POST, and an unpaired extension starts no run.
- Scripted harnesses and the Warden tests use `WARDEN_PAIRING_DISABLED=1`, or sign with the secret.
- The e2e harness reads `WARDEN_PAIRING_SECRET` and saves it into the loaded extension.

**Checks at the PR #44 head:**

- Warden: 158 passed, 6 skipped.
- Extension: 134/134 in real Chromium.
- Prototype: 141/141.
- G11 harness: 13/13.
- Ledger: 14 pass / 1 fail / 5 unknown.

## Session handoff, 1 October 2026 (history; superseded by the section above)

**Where the work is.** Branch `claude/determined-babbage-mhi2zj`, draft PR #41 (https://github.com/francisreubenr-rvu/sih-2026/pull/41), head `ba36a0b` or later, CI green, no conflicts with `master` (`8c04ecd`), no review comments. Use `sih-2026`, not the older `sih26171-dhristi` copy. Details: `Docs/decisions/brain-cloud-models-jev.md`, `scripts/laya-finetune/README.md`, `PLAN.md` (top sections), `ROAST.md` Rounds 22 to 25.

**Why the new session.** On 1 October Francis moved the Laya GPU fine-tune from Kaggle to his Colab Pro (GPUs up to 80 GB, 160 GB RAM). Colab runs in his browser, not from this container, so the run is his. This session's job is to bring the results into the repo.

### Task 1: Laya after the Colab run (start here)

- **Result (1 October):** `Benchmarks/results/laya-colab-sweep-v01.json` (transcribed from the notebook outputs; the full JSON files are on Francis's Drive, `MyDrive/dhristi-laya/colab-v01`, under a Google account this container's Drive connector does not see). The selected `a-s2-e6` fails Jev's bar on held-out: wrong on `support-desc-free` (needs free text) and `profile-phone`. Not deployed, nothing uploaded.
- **Run v02 done (2 October): not accepted** (`laya-colab-sweep-v02.json`; held-out 24 acted / 1 wrong on `support-desc-free`; design regressions on prose success messages). Francis parked Laya training on 2 October; resuming needs a fresh held-out set first. Colab saved v02 under `determined-babbage-mhi2zj/` on this branch again; removed.
- (Earlier) **Generator v5 was built and the notebook set for run v02** (Francis approved): overwrite, click-then-type, optional fields and composed free-text requests, with `--split train|val` held-out wording for validation. Francis runs it in Colab, then saves to this branch (the save dialog defaulted to `master` last time). Results land in `MyDrive/dhristi-laya/colab-v02/`. Judge by the same bar, and record the disclosure that the held-out cases are no longer blind to the new categories.
- **Stray file on master:** PR #43 removes `determined-babbage-mhi2zj/` (Francis asked).

### Task 2: keep PR #41 moving
- The PR is a draft. Merging it, or asking for changes, is Francis's call. Keep CI green on every push. Use `subscribe_pr_activity` and hourly `send_later` check-ins; the 1 October session's check-ins end with it.

### State at handoff (1 October)

**Done in PR #41.**
- Real-Groq end-to-end run found the planner never chose finish; fixed (`STATUS` lines in `extension/content.js`, vault token in `buildHistory`, finish rule in `warden/groq_client.py`). 48 real cloud requests, 0 personal values (`e2e-v5-boundary-v02.json`).
- Groq chain `qwen/qwen3.8-27b, openai/gpt-oss-20b, openai/gpt-oss-120b` at temperature 0. Re-run on a fresh quota (`groq-settings-bench-v02.json`, 429s retried): at temperature 0 Qwen 41/42 (711 ms), gpt-oss-20b 35/42 (974 ms). Qwen stays first.
- Opt-in fast path `warden/fastpath.py` (`WARDEN_FAST_PATH=jev|laya`, off by default). Jev answered 39/89 held-out steps at 0.9, all right, never a free-text step; real loop median about 236 ms (`fastpath-bench-v01.json`, `e2e-v5-boundary-v03.json`).
- Laya (`convaiinnovations/laya`, 421M, ModernBERT-large):

  | Run | Own training steps right | Top choice, 41 scenes | At 0.9 | Free-text answer |
  |---|---|---|---|---|
  | zero-shot | 23-24/120 | 17/41 | acts on none | high everywhere |
  | v2 (flat targets) | 29/120 | 16/41 | acts on none | ~0.17 everywhere |
  | v3 (sharp targets, CPU) | 60/120 | 19/41 | acts on none | ~0.1 everywhere |
  | v4 (+25% free text, CPU) | 80/120 | 28/41 | 27/90 held-out, 21 right; wrong on `rename-free`, `already-logged-in` | 0.24-0.44 everywhere |

  The v1/v2 underfit was the generator's flat targets (fixed in `a97fd1d`) plus too few updates. The choice question trains; on CPU the free-text question never learned its cue. None deployed. CPU training stopped; the GPU run is next.
- Claims corrected on Website and README; `feat/dhristi-wave8` a11y ported; `cursor/website-pixel-redesign-pr1-ac89` not merged (superseded by Signal).

**Open decisions (Francis).**
1. Jev fast path for demos: held back, open.
2. Merge PR #41, or ask for changes.
3. Whether a passing Laya checkpoint becomes the fast path's default backend (it stays opt-in until Francis says so).

**Rules that hold.** G11 **fail**, G20 **paused**, `submission_ready` **false**. Do not lower `WARDEN_FAST_PATH_MIN_CONFIDENCE` for Laya without re-benchmarking. Never print key values; keys live in the environment or `warden/.env`, never in tracked files. Test only the synthetic fixtures. Never weaken a failed guardrail to get a pass. Do not put model identifiers in commits or PR text.

**Environment facts (cloud container).**
- Keys in env: `GROQ_API_KEY`, `JEV_API_KEY` (TypeSafe direct API), `OPENROUTER_API_KEY`, `HF_TOKEN` (write, `francisreubenr`), and from 1 October a Kaggle key (no longer needed: training moved to Colab). No OpenCode key.
- No GPU: 4 CPU cores, 15 GB RAM. A CPU Laya epoch (about 1,800-2,000 questions, top 6 layers) takes 28-35 minutes.
- `pip install laya==0.3.22 protobuf` (not preinstalled). The base checkpoint is downloaded to `~/.hf/hub/models--convaiinnovations--laya/...` on first use (about 0.8 GB). Container-local artefacts (`/home/user/laya-dhristi-v1` to `-v4`, venvs) do not survive a new session; v2-v4 can be rebuilt with the README commands.
- Warden with GLiNER needs CPU torch, `gliner`, `protobuf`, `fastapi`, `uvicorn`, `httpx`.
- Groq's free tier returns 429s under back-to-back runs; `llm_settings_bench.py` now retries them, and `bench.py` has `--sleep`.
- Node's fetch needs `NODE_USE_ENV_PROXY=1` behind the proxy (`scripts/e2e-v5/recording-relay.mjs`).
- `pkill -f <pattern>` can kill the calling shell when the pattern appears in its own command line; kill by PID instead.

**Laya tools.** `scripts/laya-finetune/`: `gen_data.py` (v4 settings), `train_cpu.py` (CPU or CUDA; `EPOCHS`, `TRAIN_TOP_LAYERS`, `MAX_LEN`, `HEAD_MAX_LEN`, `LR_ENCODER`, `LR_HEAD`, `GRAD_ACCUM`), `diagnose.py` (`DATA=`), `overfit_check.py` (can it fit 64 steps at all), `validate.py` (checkpoint selection on unseen generated steps), `colab_train.ipynb`. Benchmark: `scripts/cloud-models/fastpath_bench.py --backends laya --laya-model <dir> --llm-from Benchmarks/results/fastpath-bench-v01.json`.

**Checks to run first** (superseded 3 October: the block that stood here left the shell inside `Prototype/`, so later lines failed when pasted). From the repo root:
```sh
scripts/check-all.sh --install   # every suite; writes Benchmarks/results/setup-run-<date>.json
```

## Fundamentals restructure (2026-09-23)

Wrap/polish is not the primary path. Target architecture is Warden / v4 (PERCEIVE→STRIP→PLAN→VALIDATE→EXECUTE), recorded in `Docs/decisions/brain-fundamentals-restructure.md` and `Docs/grokbot-briefing.md`. `warden/` and root `extension/` are on master via PR #31 (archive `2afd215`) and PR #32 (Ollama `/plan` default). G11 stays fail, G20 stays paused, `submission_ready` stays false. Since 29 September the product surfaces (side panel, Prototype pages and popup) use the Signal design system and the public Website is a light landing page with key information only (`DESIGN.md`, `Docs/decisions/brain-signal-redesign.md`); that resolves the earlier ARCH-002 vs side-panel palette conflict. Since 29 September (v5) redaction runs on the device and planning in the cloud: the Warden's GLiNER scores the page line by line (it previously lost names past its window), `/plan` defaults to Groq behind an egress guard, and the extension does every plan check itself and shows the boundary live (`Docs/decisions/brain-v5-local-redaction-cloud-planner.md`). Waves below are history of the master prototype. On 29 September the first real-Groq end-to-end run (`Benchmarks/results/e2e-v5-boundary-v02.json`) replaced the fake-planner evidence, and `Docs/decisions/brain-cloud-models-jev.md` records which local models can move to cloud or Jev (GLiNER and UltraFace cannot). On 30 September the Groq chain put `qwen/qwen3.8-27b` first at temperature 0, and an opt-in decision-model fast path (`WARDEN_FAST_PATH=jev|laya`) was built and measured in the same note. Since 30 September an optional Laya reviewer (`WARDEN_REVIEWER=laya`, fine-tuned multilingual checkpoint, private Hub repo `francisreubenr/dhristi-laya-plan-review`) is available. It is off by default. When on, `/plan` carries its scores, and the extension may skip the F17 confirmation for a click its own rules could not identify, under thresholds the extension holds (`Docs/decisions/brain-laya-plan-review.md`). Only a `/plan` response that proved the extension-Warden pairing secret (`warden/pairing.py`, opt-in through `WARDEN_PAIRING_SECRET`) can release a confirmation. Hindi destructive labels now tier destructive and always ask (ROAST round 28).

## Product rename (2026-09-14)
Product renamed **Sightline → Dhristi** on 2026-09-14 (user spelling: Dhristi). Repo slug and GitHub Pages path remain `sih-2026`. Name collision note: a separate Devpost project named SightLine (voice browser agent) is unrelated prior art; former name Sightline / now Dhristi for this SIH26171 candidate.
User: Francis, on behalf of RV University team Gopreet, Hiranmayi, Varun, Koushaik, Francis and Niharika. Roles remain proposed, not verified skill evidence. Internal target11September2026. Correct organizer problem is SIH26171, ISRO, on-device visual perception for light-weight browser agents. The official retrieved statement supersedes the original unresolved SIH2171 shorthand.

## Vocabulary
- **Local capture:** original screenshot retained in client memory only; demo uses html2canvas, extension uses captureVisibleTab.
- **Protected scene:** strict geometric context with opaque region kinds and approved control labels. No raw screenshot/DOM/value/URL field.
- **Vision detector:** packaged UltraFace RFB320 on ONNX Runtime Web WASM; face-only, not a general PII detector.
- **Plan:** server-proposed click/scroll/done, validated against the current scene.
- **Revision:** expiring client snapshot identity; changes reject stale commands.
- **Audit:** persisted counts, timings, model identifier and action type; no scene contents.
- **Measured:** evidence from a declared actual runtime. Synthetic fixtures, projections, unit doubles and author-reported literature numbers must be labeled separately.

Working server http://127.0.0.1:9041; The redesigned static Website is ready for candidate publication; check Docs/deployment-verification.md for the actual published revision. Current implementation is v0.1, not competition-ready. See PLAN.md for the complete remaining scope and ROAST.md for implementation findings.

Experimental additions: `/app/text-preview.html` provides local-only OCR/PII diagnostics; `/app/task-loop.html` provides a bounded synthetic task loop; `/app/local-reference.html` provides a confirmed synthetic email draft using one-use local references and `/api/v2/local-plans`. On 11 September all three ran in the in-app browser: OCR policy correction, three synthetic task goals, cancellation and local draft/expiry evidence are recorded in `Docs/decisions/browser-experiments-2026-09-11.md`. Native-extension and general privacy/utility gates remain open. The current ignored `.env` selects an independent local Ollama instance on port11436; default install instructions still support11434.

External OCR checkpoint (11 September): all 100 frozen WebPII screens execute, but intended text redraw retains exact annotated PII on 58 screens; local OCR/NER p95 2888.4ms. Keep OCR local-only. Protocol/results: `Docs/decisions/external-text-evaluation.md`. This broader failure supersedes any generalization from the three authored token examples.

Integrated simulation (11 September): `/app/operations.html` demonstrates the complete pattern on an original synthetic Earth-observation interface: protected scene, real Qwen navigation, expiring local email reference, confirmed local draft fill; expiry/stop cases pass. Run records in `Benchmarks/results/operations-v01/`. Known limits: 80px fixture portrait yields zero UltraFace detections (scale sensitivity), property readback probe discrepancy preserved, no egress-isolation or native-extension claim. Full-flow timing still seconds.

Native-extension harness (11 September): `scripts/validate-extension.mjs` loads the real unpacked MV3 build into a throwaway Chromium profile (Playwright) and verifies load, content-script injection, popup execution and host-permission reachability from inside the browser. A real bug surfaced and was fixed: `crypto.randomUUID()` in `Prototype/shared/page-agent.mjs` is undefined outside secure contexts (plain `http://`, `data:`, `file://`), which is exactly where the content script gets injected, so it threw before registering; fixed via `Prototype/shared/random-id.mjs`. Harness now passes 8/8 (1 informational: the manifest declares no background worker, so this popup-driven build has no service worker to wait on); record in `Benchmarks/results/extension-native-v01.json`. A second check added with it proves the label allow-list is a refusal: a button labelled "Approve transfer" never reaches the exported scene. Full unit suite 77/77. Scope: Chromium-only, popup opened as a document rather than through the toolbar action so `captureVisibleTab` and the pairing-token round-trip are unexercised. This narrows but does not close the native-extension gate.

Wave 1 P0 (14 September 2026): Branch `feat/p0-extension-selective-redaction`. Native MV3 popup path now runs capture → local UltraFace + DOM regions → **selective pixelation preview** (preserves non-sensitive layout pixels locally) → `assertSanitizedPayload` → semantic `requestSchema` planner round-trip → human confirm. Egress remains semantics-only (no screenshot/dataUrl/pixels). `classifySensitive` adds Aadhaar/PAN telemetry. Extension UI: DigiLocker-credible navy/paper + spare saffron/green, trust chip "on this device" / "इस उपकरण पर", EN/HI string map. Rubric hooks in `shared/rubric-hooks.mjs` + unit fixtures; official weighted score still null; full-flow <200ms gate remains **fail**. Unit suite 86/86. Ollama not required for these client/extension/redaction tests; local Qwen remains optional for live planner E2E. Firefox: `browser ?? chrome` polyfill + shipped `manifest.firefox.json`; Firefox browser run still unverified.
Wave 2 (14 September 2026): Chromium harness `scripts/validate-extension-capture.mjs` drives production `chrome.scripting.executeScript` + `tabs.sendMessage` collect on the host-permission fixture, proves production `captureVisibleTab` refuses without toolbar `activeTab`, then re-runs capture with a **temporary harness-only `<all_urls>` overlay** (shipped manifest unchanged). Overlay capture ~38ms PNG; outbound semantics exclude capture bytes (9/9 pass). Held-out synthetic fixture eval writes `Benchmarks/results/wave2-pii-redaction-utility-v01.json` (honest means; score null; latency fail). Client resource hooks (`shared/client-resources.mjs`) + extension heap/timing metrics; observed null. Firefox still unverified (no binary). Ollama 11434/11436 unreachable; planner E2E skipped, not faked. Unit suite 92/92.
Wave 3 (14 September 2026): Production popup loop reliability (stages, reinject, http(s) tab fallback, toolbar/activeTab EN/HI guidance). Harness `validate-extension-loop.mjs` 8/8 under overlay; shipped activeTab gate unchanged. Extension **0.1.1** packaged (Chrome+Firefox zips; OCR/PII excluded). Security scan 0 high; G06/G07 → pass; G11 fail retained. Unit suite 100/100. Ollama unreachable; Firefox live unverified. Toolbar glyph still requires a human click for production capture.
Wave 4 (14 September 2026): Expanded held-out synthetic PII/redaction/utility fixtures (12 cases → `wave4-pii-redaction-utility-v01.json`). G11 latency strategy: privacy-only skip-LLM mode (default in popup), detector session cache, optional wireframe preview; `core-latency.json` keeps full-flow **fail** (historical planner seconds; budget not weakened). Judge/demo checklist for human toolbar activeTab. Recovery + differentiation evidence closed G13/G04; architecture/scope closed G02; claim ledger / impact / sources closed G15/G16/G19. Website Wave4 panels + DigiLocker pixel-abstract accents. Unit suite 107/107. Ollama unreachable; Firefox live unverified. Official rubric score **null**; submission_ready **false**.
Wave 5 (14 September 2026): G03 e2e harness `scripts/validate-extension-e2e.mjs` maximizes inject/collect/activeTab-gate/overlay UI protect loop + `wave5-demo-screens/` (toolbar glyph still human-only). Held-out fixtures 18 cases → `wave5-pii-redaction-utility-v01.json` (official score null). `classifySensitive` IFSC/voter/card-like telemetry; page-agent mosaics only classifier-flagged text + `mergeRegions`; schema allows `password` region kind. G11 fail retained with judge_latency_breakdown. Evidence for unknowns: load.json (G05 notes), accessibility.json axe (G09), demo-fallback.webm + demo-rehearsal.json (G14), human-evaluation protocol (G20). Closed G17/G18 with existing deck/README evidence. Security rescan 0 high. Ollama unreachable; Firefox live unverified. Unit suite 109/109. submission_ready false.
Wave 6 (14 September 2026): G08 Node/API hardening proven (`hardening.json`: headers, origin, body size, rate limits, error hygiene) → **pass** for declared local scope. G09/G10 axe+popup+CSS-zoom notes (unknown). G11 stage breakdown + mosaic subsample; full-flow **fail** retained. Held-out fixtures 24 → `wave6-pii-redaction-utility-v01.json` (official score null). G05 load notes enriched (unknown). G14/G20 forms/checklists without pass. Security rescan 0 high. Ollama unreachable; Firefox live unverified. Unit suite 112/112. submission_ready false.
Wave 7 (14 September 2026): G09/G10 deepened (axe + keyboard + text-spacing + EN/HI DigiLocker toggle; popup runtime.getURL guard) remain **unknown**. G05 5-minute soak + heap snapshots → **pass** (local scope). G11 mergeOverlappingRegions + stride-4; full-flow **fail** retained. Security rescan 0 high. Ollama unreachable; Firefox live unverified. Unit suite 113/113. Do not mark G14/G20/G03 toolbar pass. submission_ready false.


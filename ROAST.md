## Round 30: review sweep (3 October 2026)

Security review, consistency audit, Warden and extension code review, side-panel accessibility, PII measurement. Branch `claude/epic-mayer-7cyi4z`, PR francisreubenr-rvu/sih-2026#52.

**Privacy (measured, `scripts/gliner-label-fp/measure.py`, 94 ordinary EN/HI labels and tasks, 19 synthetic values, real GLiNER, end to end through `strip()`):**

- [x] HIGH, leaks: "खाता संख्या 50100234567812", the same number in Devanagari digits, and a keyed Hindi date of birth reached the planner unasked. The regex layer had no account pattern, and GLiNER finds account numbers only next to English words. Fixed in `redactor.py` and `redactor.js` (parity kept): one-for-one match copy (Indian-script and full-width digits, NBSP, zero-width, soft hyphen), IBAN with mod-97, bare 9 to 18 digit account numbers, dates on a line that names a date of birth, leading-0 mobiles. Leaks 4 -> 1 (`gliner-label-fp-v01.json` -> `-v02.json`).
- [x] Aadhaar took 12 digits out of a longer grouped number ("3920 1188 2201 76" left "76"; inside an IBAN it left "GB29 NWBK"). Fixed.
- [x] Ordinary labels silently replaced by tokens: 9 -> 0, among them the Hindi destructive label for closing an account, stripped as a PASSWORD (the planner could not see the control). Model hits must look like their type: an account number or date of birth has a digit, a password has no space. Our own tag word (`BUTTON`) is neutralised before scoring.
- [x] Hindi UI words are field names (`gliner-label-fp-v03.json`): lines asked about 31 -> 14 -> 7 of 94, values caught unchanged.
- [ ] A Devanagari person name ("प्रिया शर्मा") is missed by `gliner_multi_pii-v1` (tuned on European languages). No regex can fix it. Needs an Indic NER or a Hindi-capable PII model (`Docs/research/how-to-build-dhristi.md` section 8.1).
- [ ] The strings are author-written and the rules were designed with them in view: not held-out evidence. The blind set (PLAN, 3 to 4 October) should add Hindi label and value rows.

**Security review (PoC-backed findings fixed by the Warden and extension agents):**

- [x] HIGH: a "keep" answer was keyed by position token and reused for a different value on a later page. Answers are now `{decision, value}` and end with the run (Warden and extension).
- [x] HIGH: labels past the 30 KB DOM cut were never scored by GLiNER. They are now scored and decided with the page.
- [x] Egress guard: token-shaped prefixes, dict keys, numbers and Devanagari digits no longer slip past.
- [x] Warden request boundary: Host allow-list (421), JSON only (415), Content-Length (411), 2 MiB cap (413), 400 without echo, no docs routes, `/plan` no longer blocks `/health` (threadpool). Evidence: `warden-hardening-v01.json`, 17/17 against a real uvicorn Warden.
- [x] Tiering: "Link this device", "Link Aadhaar to PAN", "Open a new account" no longer tier navigational; invisible characters (soft hyphen, bidi) and full-width letters can no longer hide a keyword; Hindi pay/send/submit/confirm labels tier submit (destructive still wins).
- [x] Confirmation questions name the action, the control's label, typed tokens and the site. A run is bound to its starting origin. Only extension pages can control the worker. The Warden origin is `127.0.0.1` only, and a signed `/health` precedes each `/strip`.
- [x] Regression caught at merge: the sender check also refused the side panel opened in a tab, so no loaded-extension harness could pair. Fixed on `sender.url`; content scripts stay refused.
- [ ] Element ids and attribute selectors reach the planner as written (`<a id="contact-neha-joshi">`). Fix is opaque per-scan keys in place of selectors; architectural, not done.
- [ ] The pairing code sits in `chrome.storage.local`. Nonces are remembered for 600 s in memory only, and requests carry no timestamp, so a captured request replays after a restart.
- [x] English submit gaps ("transfer", "donate", "subscribe", "apply", "agree" and others) read unproven, so Laya could release them. Added to both rule sets (over-asking accepted: "Apply filters" asks).

**G11 (first live measurement):**

- [x] Every G11 artifact so far was a dry run: the extension had stage clocks (`GET_G11_TRACE`) but no harness read them. `scripts/e2e-v5/g11-live.mjs` now does, 100 runs after 10 warm-ups. Total p50 2404 ms, p95 3713 ms (v01).
- [x] About 770 ms per run was fixed sleeps (250 ms after a click, 120 ms after finish, 400 ms before the next scan). Replaced by a DOM-quiet wait capped at the old maximum: total p50 1737 ms, p95 2270 ms (v02). A background agent's tests ran during part of v02, which can only have slowed it.
- [ ] Remaining: two cloud planner round trips (about 1.1 s), the 380 ms cursor animation (kept on purpose), about 80 ms capture and scan. G11 stays fail; the budget is unchanged.
- [ ] Without the Laya reviewer the frozen flow asks before every "Account statements" click (F17 over-asking, round 28), so no run is unattended. The measurement uses the demo configuration with the reviewer on.

**Vision stage in the shipping extension (research rank 3):**

- [x] The root extension ran no vision model, while the problem statement asks for client-side visual perception in the browser. UltraFace RFB-320 now runs on ONNX Runtime Web (WASM) in an offscreen document (`extension/offscreen.html`, `utils/vision.js`, `utils/vision-client.js`). Faces are masked in the capture before anything else sees it; a failed or slow check (1.5 s cap) discards that step's capture, so OmniParser and the panel get none. Nothing new reaches the Warden or the cloud.
- [x] Measured (`extension-vision-v01.json`, real Chromium, synthetic pages with a public-domain NASA portrait): round trip p50 26.5 ms, p95 43.3 ms; inference p50 11.8 ms; cold start 375 ms; 3 of 3 real steps finished with every sampled face point masked. Re-run on the merged tree: same.
- [ ] Faces at 128 px and 64 px on a 1280x800 page were not detected (6 of 8 found), so small faces stay unmasked. A tiled or multi-scale pass is the fix. Not an accuracy benchmark.
- [ ] Chrome only (`chrome.offscreen`, side panel). Renderer memory rises from about 100 MB to 228 MB when the model loads (shared process; not the offscreen document alone).

**Evidence and ledger:**

- [x] G05/G06/G08 scripts re-run at HEAD; the secret scanner no longer scans agent worktrees (2,672 -> 668 files).
- [x] Gate reasons now state that G06/G07/G08/G13 passes covered the Prototype server and add Warden evidence beside it. No status changed.
- [x] `check_release.py` reports commits to each gate's code `subjects` since its evidence (G12: 25 Website commits since its Lighthouse run; G13: 49) and evidence files whose `status` contradicts their gate. `demo-rehearsal.json` said pass while G14 is unknown; aligned.
- [x] `scripts/check-all.sh`: every local suite from the repo root, with a run record (8/8).
- [x] Side panel and pages: axe 0 violations in 21 panel states and 11 pages (from 1); a keyboard trap while a card was pending, fields not tied to their status, Hindi not marked `lang="hi"`, 200% zoom overflow, fixed. The three round-21 findings were already gone at `7c35778`. Evidence: `accessibility-v5-sidepanel.json`. G09/G10 stay unknown (no screen reader, no user).
- [x] Website: the "305 ms" figure had no results file; replaced with a backed one.
- [ ] One run of `warden-hardening-evidence.py` (the first in this container) hit an httpx ReadTimeout before writing its record; it did not reproduce in four reruns and the failing call was not captured. Health polling during the cold load is now tolerant and recorded (0 timeouts since).
- [ ] G12 is stale against the current Website (Lighthouse not re-run). Committed extension zips still package the September popup.

## Round 29: destructive verbs and required pairing (2 October 2026)

- [x] Verbs neither language listed are now destructive in `op-tier.js` and `tiers.py`. English: forget, discard, withdraw, purge, revoke, unlink, disconnect, wipe, kick, stop sharing, leave a group/team, end a membership, empty trash, clear history, factory reset, void a transaction. Hindi equivalents too. A node-backed parity test runs the real JS against the Python on 36 labels and 9 tasks.
- [x] Over-match guarded: "Leave a review", "Swipe", "Clear filters", "Forgot password", "Kickstart", "avoid", bare "छोड़ें" (Skip) and "वापस जाएं" (go back) stay non-destructive. "Withdraw cash" now always asks (accepted).
- [ ] The test split now reads 120/120 destructive caught, but the verbs were fitted to it (`held_out: false`). A blind set written by someone else is still needed.
- [x] Pairing is required.
  - **Warden:** with no secret it refuses every POST (`missing`, 503) and says so on startup. `WARDEN_PAIRING_DISABLED=1` is for harnesses and tests only.
  - **Extension:** with no code it sends no POST and starts no run, whatever the Warden reports (tested for each state).
  - **Harnesses:** the G11 probe signs; e2e-v5 pairs the loaded extension.
- [x] Real loop (`e2e-v5-boundary-v04.json`): loaded extension, real Warden with GLiNER, pairing through Settings, Laya from the private Hub repo, real Groq. 9 runs, 21 cloud requests, 0 personal values, Groq round trip 227 to 1117 ms (median 416).
  - Release worked in 3 of 3 runs where the statements label was kept.
  - Destructive always asked (C2).
  - A wrong pairing code sent 0 POSTs and 0 cloud requests, and showed the refusal.
- [ ] NEW, GLiNER flags ordinary UI text as an account number in the uncertain band: the link label "Account statements" (0.42) and the task "Delete my account" (35%). Each costs the user a prompt. Stripping a label makes it opaque to the planner, and blocks a release that would have been right. To measure and fix (PLAN schedule, 9 October). Do not lower thresholds to hide it.
- [ ] NEW, planner: asked to "Delete my account" on the bank page, Qwen clicked "Account statements" instead of the Hindi "खाता हटाएं" link, then finished. Laya did not release that off-task click, so a person would have been asked. Cross-language control choice is a planner weakness.
- [ ] Laya warns that the checkpoint's serves-task temperature (7.1) is outside its supported range and clamps it to 5. The evaluation ran with the same clamp; recorded here so a future laya upgrade does not shift the numbers silently.

## Round 28: Laya plan reviewer, PR #42 (work of 30 September 2026, merged 2 October)

- [x] Optional Laya reviewer behind `WARDEN_REVIEWER=laya`; stub tests pin accept → ask only, no tier lowering, SKIPPED on any failure. Warden suite 111 passed / 6 skipped (real-model tests).
- [x] Zero-shot Laya is not usable here: it rated "Close account permanently" as serving a "download my statement" task at 0.92, and at a 0.9 release threshold it would have released 5 destructive steps. Only the fine-tuned checkpoint was evaluated for release.
- [x] MEDIUM, `warden/tiers.py` (legacy `/validate`): `NAV_LABEL_RE` ran over label + fieldType, so fieldType `link` satisfied `\blink\b`. Any link without a destructive/submit keyword tiered navigational, and 42/120 destructive test steps would accept (e.g. "Kick from folder", "खाता बंद करें"). Fixed: navigational is matched on the label only, as `op-tier.js` does. Now 0/120, with regression tests.
- [x] The live F17 gate over-asked: 126/144 genuinely navigational test clicks were forced to confirm. Francis approved release under the constraint. `layaRelease` now skips a confirmation only for an `unproven` click with a confident review from the fine-tuned checkpoint. The live element must still read `unproven` at execute; a relabel to "Pay now" stops, tested in real Chromium. Extension suite 120/120, Warden 122 passed / 6 skipped.
- [x] RESIDUAL, closed for paired setups. The extension did not authenticate the Warden, so any process on 127.0.0.1:8756 could release an `unproven` click, including a Hindi destructive label.
  - **Pairing:** `warden/pairing.py` (HMAC request and response proofs, the secret never on the wire). A paired extension refuses any unproven response, and stops before `/strip` when `/health` fails the proof. `layaRelease` requires a verified `/plan` response. Tested against a fake Warden in the extension suite, in Warden pytest, and cross-language against a real uvicorn Warden.
  - **Hindi keywords:** `HI_DESTRUCTIVE` in `op-tier.js` and `tiers.py`, matched after NFC and zero-width stripping. Hindi destructive test steps tiered destructive: 0/42 → 24/42.
- [ ] Still open:
  - Destructive verbs neither language lists (forget, leave, stop sharing, discard, withdraw, purge, revoke), and Hindi submit keywords. These stay `unproven`; only a verified fine-tuned review can release them.
  - Pairing is opt-in. Unpaired setups never release, but are otherwise as trusting as before.
  - A mid-run port takeover can receive one `/strip` body before it is detected.
- [ ] Evidence scope: synthetic hand-authored dataset, author labels, Hindi not native-reviewed, one control per state, correlated tier rows (61 distinct held-out controls). CPU only. No loaded-extension run of the release.

## Round 27: Laya Colab run v02 (2 October 2026)

- [x] Held-out-wording validation ranks candidates (1 of 12 pass); same-generator validation could not.
- [x] `profile-phone` and four over-flagged free-text steps fixed on held-out.
- [ ] Still wrong on `support-desc-free` (free text, 0.05; clicked Submit at 0.98). Not accepted.
- [ ] Design regressions: `account-finish`, `already-done`; success shown as prose, not a STATUS line, which v5 never generates.
- [ ] The held-out set is being fitted round by round. A fresh, untouched held-out set is needed before another generator round counts as evidence.
- [x] Laya fast-path training parked by Francis (2 October). Evidence kept: v01, v02, generator v5, `validate.py`, the Colab notebook.

## Round 26: Laya on Colab (1 October 2026)

- [x] Free-text hypothesis checked and ruled out: Laya drops the end of the JSON state (`done_so_far`) when it runs out of room, but no free-text question on `train_v4.jsonl` loses any state at 512/192 or 1024/256.
- [x] Selection leak avoided: the Colab sweep makes 12 candidates, chosen on unseen generated steps (`validate.py`) by a rule fixed before the run; only the chosen one sees the 30 held-out benchmark cases.
- [x] GPU run done (A100 80 GB). Free-text question learned (AUROC 1.0 on generated steps), unlike every CPU run.
- [ ] Fails Jev's bar on held-out: wrong on `support-desc-free` (free text, 0.05) and `profile-phone` (pre-filled field to overwrite). Not deployed. Generator lacks both situations.
- [x] Generator v5 holds wording out for validation (`--split val`): in a dry run, no tasks or labels were shared with training. Untested on GPU until run v02.
- [ ] Confidence is pinned to the training targets (0.98; 0.05/0.95), so the 0.9 threshold barely filters.
- [x] Colab saved the run notebook to `master` (`fbcda5c`); Francis asked for removal, which is PR #43.
- [ ] The v5 situations were picked after seeing held-out failures: the 30 held-out cases are no longer blind to them. A v02 pass on those cases is weaker evidence than v01's fail.
- [ ] Validation steps come from the same generator as training; they measure fit and calibration, not generalization to new wording. Only the benchmark measures that.

## Round 25: Laya on CPU, and the Groq re-run (1 October 2026)

- [x] Root cause of the v1/v2 underfit: flat targets (2% per wrong option, right answer split up to five ways) capped a calibrated model near 0.8. Fixed in `gen_data.py`; overfit test 63/64.
- [ ] The free-text question never learned its cue on CPU (v3 about 0.1, v4 about 0.3 on every step, tracking the training share). v4 acts wrongly at 0.9 on `rename-free`, a free-text step, and at 0.95 on `already-logged-in`. Not deployed. Needs the GPU run, judged by Jev's bar.
- [x] Groq settings re-run with 429 retries: at temperature 0 Qwen 41/42, gpt-oss-20b 35/42 (3 of its misses are JSON Groq rejected).

## Round 24: Laya fine-tuning (30 September 2026)

- [x] v1 option truncation found and fixed: long option keys left about 12 tokens per option and cut off the field label (61 of 200 training steps collapsed); Laya now gets compact keys.
- [ ] Both CPU fine-tunes underfit (v2: 29/120 on its own training steps, base 24/120). The authors' recipe (whole encoder, 4 epochs, ~6,000 decisions) needs a GPU; `kaggle_train.ipynb` is ready but not run.
- [ ] v2's free-text answer collapsed to "no" everywhere (training set 12% free-text steps), removing the gate that kept zero-shot Laya safe; below 0.9 it acts wrongly on free-text steps. Not deployed; the threshold must not be lowered for Laya without re-benchmarking. Rebalance the generator if the GPU run shows the same collapse.
- [ ] Fine-tuned weights (0.8 GB) cannot go in Git here (no LFS, 100 MB limit); needs a Hugging Face repo or release asset chosen by Francis.

## Round 23: Qwen first, fast path, Laya (30 September 2026)

- [x] Warden's Groq call had no temperature, so the same scene got different plans between runs; now temperature 0 (test asserts it). The 29 September Qwen ranking was measured under different settings than the Warden used; recorded as a correction in `Docs/decisions/brain-cloud-models-jev.md`.
- [x] Decision-model fast path built and measured; off by default; cannot block planning (defers on backend error), runs after the egress guard, never sends to the cloud in offline mode.
- [ ] Jev's "free text needed" answer sits near 0.5 on token-only steps, which caps coverage at about half the steps. Question wording not tuned (kept the held-out set clean).
- [ ] Laya zero-shot is unsafe without the free-text gate (0 of 6 confident held-out steps right). Needs fine-tuning on action choices before any use.
- [x] Groq free-tier rate limits made the model/temperature comparison inconclusive; re-run on a fresh quota on 1 October with 429s retried (`groq-settings-bench-v02.json`): at temperature 0 Qwen 41/42, gpt-oss-20b 35/42.
- [ ] `OPENROUTER_API_KEY` in this session's environment still holds three words; the fix Francis made applies to new sessions.

## Round 22: real cloud planner + cloud-model bench (29 September 2026)

- [x] HIGH, found by the first real-Groq end-to-end run: the planner never chose finish on a completed task and looped to the 25-step limit (it could not see the page's status message, and history carried no value). The fake planner in e2e v01 was scripted to finish, so it hid this. Fixed in `extension/content.js` (STATUS lines), `extension/background.js` (vault token in history), `warden/groq_client.py` (finish rule). Two new tests, each failing on the old code. Evidence: `Benchmarks/results/e2e-v5-boundary-v02.json`.
- [x] Privacy boundary against a real cloud planner: 48 requests, 0 personal values, recorded at a loopback relay.
- [x] Claims corrected: Website and README had called the fake-planner run "the cloud planner".
- [ ] Round 18's "`/plan` default is local Ollama" was superseded by v5 (Groq default); left above as history.
- [ ] Jev hybrid fast path and a Groq chain reorder are recommendations only (`Docs/decisions/brain-cloud-models-jev.md`). No end-to-end G11 measurement with either. G11 stays fail.
- [ ] Groq free-tier 429s under back-to-back runs are a live-demo risk.

## Round 21: Signal redesign (29 September 2026)

- [x] One design system (Signal) across Website, side panel, Prototype operator pages and popup; canonical tokens in `design/signal-tokens.css`, CI check for drift and WCAG AA contrast. Decision: `Docs/decisions/brain-signal-redesign.md`. Resolves the ARCH-002 vs side-panel palette conflict.
- [x] axe-core: 0 violations on Website, Prototype pages and popup. Behaviour, IDs and harness selectors unchanged; tests 141/58/13 pass.
- [ ] Mobile Lighthouse 97–98 vs master 99 on the same machine (LCP +0.25 s from the serif hero face). Desktop 100.
- [x] Side panel carries three axe findings that also exist on master (list, region, aria-allowed-role in `sidepanel.js` markup). Closed 3 October 2026: already gone at `7c35778` (fixed by the v5 panel); axe 0 in 21 states (`accessibility-v5-sidepanel.json`).
- [x] Website redirected by Francis the same day: light landing page, key information only, Anton / Open Sans / Glacial Indifference, real prototype footage replacing the explain video, NASA public-domain imagery. No Pinterest images (copyright).
- [ ] Committed extension zips still package the earlier interface. Demo footage shows the dark Signal Prototype.

## Round 20: F17 target identity (29 September 2026)

- [x] HIGH, reproduced on master `84fd497` in real Chromium: the scan recorded only a selector string, execute ran `document.querySelector` on it (first match, hidden or not), then synthetic pointer events and `click()`. A hidden `<button id=next>` in a `/account/delete` form ahead of a visible `<a id=next>Next page</a>` tiered navigational and posted the delete. Same for `aria-label="Next"` on a "Delete my account" button.
- [x] Fixed in root `extension/`: per-scan opaque handles held in the content script (execute resolves only a handle; selectors are display keys, made unique); execute-time refusal of stale/detached/hidden (incl. opacity:0 ancestor)/offscreen/covered/`pointer-events:none`/inert targets; tier re-derived from the live element and escalated to a prompt when stricter than planned; tiering on visible text, accessible name, title, value, form action, formaction, href and type (`extension/utils/op-tier.js`); local tier from the extension's own scan only; final tier is the stricter of Warden and local, and anything but an exact `accept` with an agreeing unattended-safe tier prompts. Synthetic pointer sequence removed.
- [x] Pre-existing master bug found while testing: since `562ae03`, `redacted`/`omni` were block-scoped inside the PERCEIVE timing `try`, so every side-panel run threw `redacted is not defined` after STRIP and never reached PLAN. Hoisted.
- [ ] Evidence scope: unit tests, the real `background.js` against a fake Warden, and `content.js` in real Chromium (main world, not an extension isolated world). No live Warden/Ollama run, no loaded-extension run. Iframes and shadow DOM out of scope. No consent-enforcement claim beyond these tests; no guardrail status changed.

## Round 19: G11 Option C harness (23 September 2026)

- [x] Measurement harness for root `extension/` + Warden `:8756` only. Privacy-only and Prototype `:9041` cannot set `mayFlipG11`.
- [ ] Live L2 n≥100 was not collected here (Warden 8756 and Ollama 11434 were down). G11 stays fail. Do not weaken the 200 ms budget.

## Round 18: Warden planner default + host allowlist (23 September 2026)

- [x] `POST /plan` default is local Ollama. Groq is explicit (`WARDEN_PLANNER=groq`) and is not used when Ollama is down.
- [x] `wardenOrigin` and `omniparserUrl` refuse non-loopback. Install-time `<all_urls>` host permission removed. Optional `<all_urls>` is requested on send. Residual recorded in `Docs/decisions/brain-warden-ollama-plan-harden.md`.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation (G03).
- [ ] Full-flow <200ms gate remains failed. Do not weaken. G11 stays fail.
- [ ] Human/domain validation (G20) participants not yet collected. `submission_ready` stays false.

## Round 17: wave 7 a11y + load soak (14 September 2026)

- [x] G09/G10 enriched evidence (axe 0 violations, keyboard, text-spacing, EN/HI); remain unknown (no fake WCAG pass).
- [x] G05 5-minute local soak with heap snapshots → pass on declared local scope.
- [x] G11 honest mosaic/merge opts; full-flow fail retained.
- [x] Popup runtime.getURL guard so lang controls work in HTTP preview.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation (G03).
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] Ollama planner E2E not run (unreachable); do not fake.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.
- [ ] Human/domain validation (G20) participants not yet collected.
- [ ] G14 3 consecutive live rehearsals not logged.

## Round 16: wave 6 hardening + a11y + latency (14 September 2026)

- [x] Node/API hardening evidence harness (headers, origin, size, rate limit, error hygiene); G08 pass on declared scope.
- [x] axe on Website + extension popup; contrast/reveal fixes; G09/G10 remain unknown (no fake WCAG pass).
- [x] Latency stage instrumentation + mosaic subsample; G11 fail retained.
- [x] Expanded held-out fixtures to 24; GSTIN/UPI telemetry; official score null.
- [x] G14/G20 human-path templates without marking pass.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation.
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] Ollama planner E2E not run (unreachable); do not fake.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.
- [ ] Human/domain validation (G20) participants not yet collected.
- [ ] G05 full 5-minute capacity floor still open.

## Round 15: wave 5 e2e + saturation + gate evidence (14 September 2026)

- [x] E2E harness maximizes automation + screenshotable synthetic flow; activeTab gate retained; toolbar glyph not faked.
- [x] Expanded held-out fixtures to 18; classifySensitive/mergeRegions/password kind; honest scores; official null.
- [x] G17/G18 closed with real deck/README evidence.
- [x] Protocol/templates for G05/G09/G14/G20 evidence files; statuses stay unknown without acceptance.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation.
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] Ollama planner E2E not run (unreachable); do not fake.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.
- [ ] Human/domain validation (G20) participants not yet collected.
- [ ] G05 capacity floor, G08 production hardening, G09 full WCAG, G10 200% zoom still open.

## Round 14: wave 4 latency + rubric diagnostics (14 September 2026)

- [x] Privacy-only skip-LLM path + detector cache + wireframe preview implemented; G11 remains fail with core-latency evidence.
- [x] Expanded held-out synthetic fixture scoring (12 cases); official score null.
- [x] Judge/demo checklist for human toolbar activeTab (no faked glyph automation).
- [x] Recovery + differentiation + architecture/scope evidence closed additional gates honestly.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation.
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] Ollama planner E2E not run (unreachable); do not fake.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.
- [ ] Human/domain validation (G20) and several presentation/ops unknowns remain.

## Round 13: wave 3 loop + packaging (14 September 2026)

- [x] Production popup capture→filter→sanitize→review reliability: stages, reinject, tab fallback, toolbar guidance.
- [x] Loop harness proves UI path under overlay; shipped activeTab gate retained.
- [x] Packaging refresh 0.1.1 + Firefox unpacked tree/zip; lean models (no OCR/PII in extension zip).
- [x] Security scan + dependency audit evidence; G06/G07 pass on honest scope.
- [ ] Toolbar glyph / true activeTab user gesture still not driven by automation.
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] Ollama planner E2E not run (unreachable); do not fake.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.

## Round 12: wave 2 capture path + held-out fixtures (14 September 2026)

- [x] Chromium production injection path (`chrome.scripting.executeScript`) + `tabs.sendMessage` collect proven on host-permission fixture.
- [x] Production `captureVisibleTab` permission gate recorded: refuses without toolbar `activeTab` / `<all_urls>` (honest).
- [x] Harness-only temporary overlay exercises real PNG `captureVisibleTab`; outbound JSON excludes capture bytes; shipped manifest unchanged.
- [x] Held-out synthetic fixture scoring written with separable coverage/preservation and intentional fail cases; official score null; latency gate fail retained.
- [x] Client resource measurement hooks + extension heap/timing; observed remains null (no invented RSS/energy).
- [ ] Toolbar action UI (glyph click / true activeTab user gesture) still not driven by automation.
- [ ] Firefox unpacked live run still unverified.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] External WebPII OCR retention failure (58/100) unchanged; OCR local-only.
- [ ] Ollama planner E2E not run (service unreachable); do not fake.

## Round 11: wave 1 selective redaction + extension UI (14 September 2026)

- [x] Selective local preview preserves non-sensitive pixels while pixelating face/private/field/media regions; unit coverage and preservation scores exist. Egress unchanged (semantics-only).
- [x] Extension popup: DigiLocker-credible styling, trust chip, EN/HI strings, `browser ?? chrome`, sanitize assert before fetch.
- [x] Rubric hooks land with honest `unit_fixture_only` / latency `fail`; no invented saturation.
- [ ] Toolbar capture + pairing-token planner round-trip still not driven by harness (popup opened as document only).
- [ ] Firefox unpacked execution unverified despite shipped firefox manifest + API polyfill.
- [ ] Selective preview is not a general PII detector; UltraFace remains face-only; DOM/regex cover fields and Indic patterns as telemetry only.
- [ ] Full-flow <200ms gate remains failed. Do not weaken.
- [ ] External WebPII OCR retention failure (58/100) unchanged; keep OCR local-only.

# Roast Loop (9 September 2026)

## Round 10: integrated operations simulation

- [x] Bounded loop plus protected capture plus expiring reference now run a complete synthetic domain task end-to-end in the browser; completion requires the fixture's exact-match postcondition, not a model `done`.
- [x] Expiry and user-stop cases verified with no write and no further actions. Serialized requests contain no private values.
- [ ] Native extension still runs the older manual flow; this page is web-only evidence.
- [ ] UltraFace detects zero faces at 80px fixture scale. Same portrait at 96px previously detected. Evaluate face scale/thresholds before the demo narrative claims detection on this page.
- [ ] Scoped network capture excludes worker/other contexts; do not claim full egress proof.

## Round 9: external OCR/PII evaluation

- [ ] Current OCR/PII policy retains exact annotated sensitive text on 58/100 external synthetic screens. Contextual content such as gift messages and address components defeats the current entity/token policy. Keep local-only; no arbitrary-text export.
- [ ] OCR/NER processing p95 is 2,888.4 ms on this slice. This excludes server planning and does not approach the existing full-task performance target.
- [x] Scorer must not count missing OCR as successful detection or blank output as useful privacy. Frozen protocol separates recognition, marking, intended retention and product-text utility; failed/missing rows retain denominators. Twelve new tests pass.
- [ ] Browser network event buffer reports truncation; retained subset shows no external/planner request, but complete egress isolation remains unproven.

## Round 8: browser experiments, 11 September

- [x] Original local preview opens using updated supported browser connection. Synthetic runner and local reference now have browser execution evidence; prior blocked records are historical. This does not close the native-extension gate.
- [x] NER missed street words after detecting an address number. Preserve failed run; add conservative explicit-label value withholding and line-boundary tests. Same-fixture regression now withholds 14/14 scored sensitive tokens and retains 25/25 useful tokens.
- [ ] Explicit-label OCR rule remains English and dependent on correct line grouping. Evaluate unseen layouts, multiline/unlabelled PII, scripts and decoys before export integration.
- [x] Model service outage caused first task to stop with no actions. Restored existing local Qwen service; three goal runs and cancellation completed with preserved traces.
- [ ] Read-only field-value probe conflicts with populated screenshot and fixture equality status. Preserve the probe; do not call it direct readback proof. Browser draft conclusion uses visible/fixture evidence.
- [x] Initial viewport override affected only one tab. Preserve original dimensions and repeat per-tab 390px checks; all three show no document overflow.

## Scope
SIH26171 implementation. The earlier preparation pack is historical evidence, not a working privacy agent.

## Round 1
### Findings (open)
- [ ] Prototype/README.md:1: no implementation exists for the now supplied SIH26171 statement; critical delivery gap. Build and verify client vision, privacy boundary, server reasoning, and browser action execution before closing.
### Fixed
None yet. Audit begins with the implementation; additional findings require concrete file/line evidence.

- [x] scripts/build-prototype.mjs:8: URL pathname encoded spaces and broke bundling; switched to fileURLToPath. Build rerun below.
- [x] Prototype/server/app.mjs:8: trailing root slash rejected valid static paths; normalized root and added real-entry HTTP regression coverage.

- [x] Prototype/server/provider.mjs:17: real Qwen response omitted the action wrapper under unconstrained JSON mode; enforced a full output JSON schema; real Qwen plan accepted and confirmed Pending click observed in browser.

- [x] Prototype/app/main.mjs:13: iframe document can be absent during navigation/reload, throwing before load listener handles the ready fixture; guarded document readiness; browser reload then capture succeeded (106ms observed, one face) at 390px.

- [x] Prototype/models/ultraface-rfb320.onnx: obsolete graph inputs and unused training counters emitted hundreds of warnings and prevented constant folding; removed redundant metadata, preserved active weights, rechecked browser face inference. The runtime still emits a CPU-vendor identification warning in this embedded browser.

## Open validation work
- [x] Web workspace now proactively revokes expired/changed context; observed status update and both plan/execute disabled after expiry. Extension still revalidates on each request/action.
- [ ] Chrome and Firefox unpacked-extension execution; full dataset and resource measurements; VLM evaluation; privacy/utility baselines; accessibility and user study.

## Round 2: current candidate

The original "no implementation exists" finding is superseded: implementation, local WASM inference and actual Qwen-confirmed task completion now exist. The broader delivery gap remains open under the validation work above; do not infer native-extension or dataset readiness.

- [x] Shared client audit: unique revisions, observed open roots, target identity/bounds/disabled checks, composed hit testing and fail-closed collection. Dependency-free DOM tests pass; real shadow/overlay browser fixtures remain unverified.
- [x] Vision audit: reject nonfinite outputs and invalid shapes; release tensors/owned bitmaps/canvas pixels on failures; serialize disposal. Runtime-double lifecycle tests pass.
- [x] Web capture: release screenshot canvas in finally, including failed inference.
- [x] Website GitHub source links used nonexistent main branch; changed to verified default master.
- [x] Presentation render: corrected title/subtitle overlap, dense panel body size and cropped screenshot. Current PDFs and contact sheets regenerated.

## Round 3: measured model behavior and recording

- [x] Shared page-agent browser tests now exercise the actual DOM, shadow roots, overlays, CSSOM movement and expiry: 18/18 pass. This closes the synthetic Chrome harness gap only.
- [x] Model benchmark output could overwrite previous evidence. Runs now require a fresh directory and default to frozen first-run cases. Historical runs and failures are preserved.
- [x] Legacy screencast dropped events. Replaced it with a real browser recording stream; verified final frame and MP4 playback. No fabricated video frames.
- [ ] Qwen7B latest adapter still selects the wrong action in 2/24 authored development cases. Smaller models also fail; strict JSON is not semantic correctness. See Docs/decisions/model-pilot.md.
- [ ] Native extension installation was blocked by browser URL policy. Respect that boundary; no cross-browser extension readiness claim.

## Round 4: external raster diagnostic

- [x] Benchmark inherited fixed 800x500 iframe CSS while annotations used full-image bounds. Reject the old coverage summary, set exact dimensions, and verify them in both harness and scorer.
- [ ] Raster-only input loses all original visual context. The external 100-screen slice produces zero usable controls and zero localized PII detections; full-image masking does not satisfy useful selective redaction.
- [ ] Worker adapter reduces observed main-thread blocking but first-run detection p95 worsens. Keep it experimental until repeated measurements justify a default change.
- [x] Scorer overlap/matching rules tested; failed attempts remain in the declared denominator.

## Round 5: local text experiment and reference review

- [x] Token-window parameters could produce a non-advancing loop. Reject invalid sizes/overlap; alignment and rejection tests pass.
- [x] OCR build used a nonexistent `LICENSE` filename. Corrected to the installed `LICENSE.md` and rebuilt successfully.
- [ ] OCR/NER preview has no real-browser measurement yet: local page navigation was blocked. Do not describe it as a validated privacy filter or integrate free OCR text into outbound context.
- [ ] Current reviewed one-action workflow needs a bounded goal loop with observed task postconditions before claiming autonomous goal completion. Do not inherit VEIL's claims or fuzzy retargeting behavior from the transcript.
- [ ] Transcript score and ISRO operational claims require original code/evidence or domain validation. Separate hypothesized use cases from verified capabilities.

## Round 6: bounded coordinator

- [x] A model saying `done` must not itself prove goal completion. Runner reports `completion_unverified` unless the local fixture postcondition holds.
- [x] Late planner results after cancellation could otherwise reach execution. Abort-aware coordinator checks again before execution; cancellation/late-result unit test passes.
- [x] A reloaded fixture at the same URL must not reuse the old target map. Adapter checks document identity as well as the authorized fixture URL.
- [ ] Runner integration is built but has no real-browser/visual/native-extension evidence. The generic-site autonomy gap remains open.

## Round 7: private value references

- [x] A reusable reference would allow replay after an uncertain write. Consume before writing and reject unknown/reused/expired/wrong-target bindings; tests pass.
- [x] Rechecking vault size inside the write callback failed after intentional consumption. Keep target/revision/hit tests inside the callback, while requiring reference availability before consumption. Browser execution still needs validation.
- [x] The configured model endpoint drifted to a different catalogue. Preserve failed attempts, use existing Qwen weights in a separate local service, and verify a real provider response plus SQLite readback.
- [ ] Synthetic reference UI remains browser-unverified; do not infer DOM execution from the shared-module pilot.
- [ ] Three fixed reference cases do not demonstrate general PII detection, free-text task sanitization, arbitrary-site typing or native extension support.

## Round 8: deck audit and page-agent guard

- [x] `Prototype/shared/page-agent.mjs` carried a duplicated guard block, so `OBSERVABLE_NODE_TYPES` was declared twice and the module failed to parse. Collapse to one copy and keep the `nodeType` guard in `collect`. `node --check` passes.
- [x] A deck slide stated "139–141 ms capture + protection" with no evidence file behind it. Replace it with the persisted `captureMs` range 92–108 ms from `prototype-v01-browser.json`, which measures the same window. Do not ship an unpersisted console reading as a measurement.
- [x] The deck's "75 recorded Node tests" claim had no supporting report and the suite ran 74. Add the missing guard regression test and regenerate the report from an unrestricted run before the claim is published.
- [x] The 11 September unit-test report could not be regenerated under the sandbox: nine tests bind `127.0.0.1` and fail with `EPERM ... syscall: 'listen'`. The sandbox-only 66/75 run was rejected as evidence and the committed report was restored; the report was then regenerated from a real unrestricted run at 75 passing, 0 failing.
- [x] `Docs/submission-deck.pdf` and `Docs/pitch-deck.pdf` corresponded to the 9 September PPTX builds. Re-exported from the regenerated sources once `soffice` could run, and both were visually checked page by page against the corrected slides.

## Round 9: native-extension harness

- [x] New harness `scripts/validate-extension.mjs` loads the real unpacked MV3 build into a throwaway Chromium profile (Playwright) and drives extension load, content-script injection, popup load and the declared host-permission fetch from inside the actual browser. First run: 5/7 checks passed, verdict `fail`. `content_script_injection` and `collect_protected_scene` failed with page error `crypto.randomUUID is not a function`.
- [x] Traced to `Prototype/shared/page-agent.mjs`: `createPageAgent()` called `crypto.randomUUID()` unguarded for the scene revision id. `Crypto.randomUUID()` is restricted to secure contexts and is `undefined` on plain `http://` pages, `data:` fixtures and `file://` pages, exactly where a content script with `activeTab`/`scripting` permissions gets injected. The throw happened before `content.mjs` registered its `chrome.runtime.onMessage` listener, so `globalThis.__dhristiController` was never set; the popup only reported the generic `"Page connection lost. Reopen the extension."`, not the real cause.
- [x] Fixed with `Prototype/shared/random-id.mjs` (`newRevisionId`), which falls back to `crypto.getRandomValues()` (no secure-context restriction) when `randomUUID` is absent, and throws loudly rather than silently degrading if neither is available. Applied to both `page-agent.mjs` call sites and to `local-values.mjs`'s equivalent default. Two regression tests added to `page-agent.test.mjs`, one exercising a page with no `randomUUID`, one exercising `newRevisionId`'s own error/fallback paths directly. Rebuilt `Prototype/extension-build`; harness now passes 7/7, verdict `pass`. Full suite: 77/77.
- [x] One of the two new regression tests initially asserted `newRevisionId(undefined)` throws "No crypto source"; it did not, because a JS default parameter only substitutes for `undefined`, so the call was indistinguishable from `newRevisionId()` and resolved to Node's real `crypto`. Corrected to `newRevisionId(null)`, which is defined-but-falsy and actually exercises the guard.
- [ ] One page error remains by design and is documented in the harness's own `limitations`: `content_script_injection` injects via Playwright's `page.addScriptTag`, which runs in the page's main world, not the isolated content-script world Chrome grants to `chrome.scripting.executeScript` (the real popup's injection path), so `chrome.runtime` is absent only in that harness step. Does not reflect production behavior.
- [ ] Scope of what this closes: real Chromium load/inject/reach evidence for the popup-driven MV3 build only. Firefox is not exercised, the popup was opened as an extension document rather than through the toolbar action so `captureVisibleTab` and the pairing-token/planner round-trip are not driven, and this is not a PII-accuracy or performance measurement. Native-extension gate remains open beyond this scope.

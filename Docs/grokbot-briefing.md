# Grokbot handoff: SIH26171

Written 23 September 2026. This is a briefing for a later agent. It is not a measurement file and it is not a submission.

## Read this before the briefing

The long briefing below was written by inspecting the local branch `sightline-v2-foundation` at commit `2afd215` (13 September 2026, "Add the Warden architecture, side panel chat surface, and pixel design system"). That branch had no upstream. It is not GitHub `master`.

Checked against `origin/master` on 23 September 2026, before this file was committed:

| Fact | Value |
|---|---|
| Default branch | `master` |
| Tip at the time of this commit's parent | `a87c785`, merge of PR #29 `brain/wrap-harder-finish` |
| Divergence | `origin/master` had 91 commits not in `sightline-v2-foundation`. That local branch had 52 commits not in `origin/master`. |
| `warden/` on master | Absent. Do not create one to make the briefing true. |
| Release ledger on master | `Benchmarks/release-status.json` timestamp `2026-09-14T11:32:43Z`. Status fail. Counts: 14 pass, 1 fail, 5 unknown. `submission_ready` false. Later commits (pixel wrap, explain video, harder finish) did not claim a ledger regeneration in the decision note below. |
| `PLAN.md` on master | Opens at Wave 7, 14 September 2026. G11 full-flow latency remains fail and must not be weakened. The note says not to mark G14, G20, or the human toolbar part of G03 as pass. |
| Latest decision on master | `Docs/decisions/brain-wrap-harder-finish.md`, 22 September 2026. Pixel HUD densify, explain video about 108 seconds, prototype `build` and `test:ci` green at 141 tests on a clean dist. `submission_ready` stays false. G20 paused. |
| Root `README.md` on master | Still describes an engineering candidate v0.1 with Qwen2.5 through Ollama and 119 tests measured 15 September 2026. That README is older than Waves 1 to 7 and older than the 22 September wrap. Do not treat it as the newest status. |
| Pages | `.github/workflows/pages.yml` deploys only when `Website/**` or the workflow file changes on `master`. This document does not redeploy the site. |
| Live site | https://francisreubenr-rvu.github.io/sih-2026/ |
| Remote | https://github.com/francisreubenr-rvu/sih-2026 |

If `warden/` is not in your checkout, you are on the master line. Read `PLAN.md` from Wave 7 downward, then `Docs/decisions/brain-wrap-harder-finish.md` and `Docs/decisions/brain-pixel-ui-wrap.md`. Ignore the Warden sections below as shipping instructions. They are the record of the other branch.

If `warden/` exists and `git rev-parse HEAD` is `2afd215` or a descendant of that commit that still contains it, the briefing below matches your tree. Files in the tree still win when they disagree with this document.

Left uncommitted on the machine that produced this file, and not part of this push: a deleted `SIH2026-Preparation-Pack.zip` in the old worktree, and an untracked `Archive.zip` of about 256 MB. Neither belongs in git.

## Briefing

The rest of this file is the one-shot prompt. Follow it only after the check above.

---

You are continuing an existing Smart India Hackathon 2026 entry. This briefing is the record of the Warden line of work through 13 September 2026, commit `2afd215`, as read on 23 September 2026. If the project directory is mounted, read the files before you edit and treat them as newer than this briefing wherever they disagree. If the directory is not mounted, do not invent a substitute tree, do not claim you ran the tests, and do not fabricate measurements. Say the folder is absent and stop at a written plan.

Project root, when present: `/Volumes/1TB SSD/brain/raw/SIH 2026`
Public repo: https://github.com/francisreubenr-rvu/sih-2026
Public site: https://francisreubenr-rvu.github.io/sih-2026/
Warden-line branch: `sightline-v2-foundation`
Warden-line commit: `2afd215` on 13 September 2026, 15:11 IST, message "Add the Warden architecture, side panel chat surface, and pixel design system".
Address the user as Francis. Carry the work forward without asking him to re-confirm decisions already recorded below. Never ask him to paste an API key into chat.

### 1. What this is

This is not a new product. It is DHRISTI, the RV University software entry for Smart India Hackathon 2026 problem SIH26171. Some master-line documents spell it Dhristi. Do not rename protocol constants either way.

Verified problem identity, checked against the official catalogue on 9 September 2026 and re-checked on the live catalogue on 23 September 2026:

| Field | Value |
|---|---|
| ID | SIH26171. The early shorthand SIH2171 is wrong and retired. |
| Title | On-device Visual Perception for Light-weight Browser Agents |
| Organization | Indian Space Research Organisation (ISRO) |
| Department | Department of Space / Indian Space Research Organisation |
| Category | Software |
| Theme | Smart Automation |
| Idea cap | 500 per statement. Live count on 23 September 2026 was 28/500, so the statement was not frozen. |
| Catalogue deadline shown on the live row | 30 September 2026 |
| College SPOC guidelines PDF | Says team nomination and idea submission closed 15 September 2026. This conflicts with the live row. Do not pick a winner. Francis must confirm with the RVU SPOC whether the team is nominated. |
| Internal delivery target Francis set | 11 September 2026. That date has passed. It is not the national deadline. |

Organizer requirement, paraphrased from the retrieved statement. Do not treat this paraphrase as the official text. The archived official extract is `Raw/domain/sih26171-official-extract.txt`.

Run a light vision model inside a browser extension. Detect and redact sensitive visual and DOM content before anything is transmitted. Send only a sanitized scene to a central open-weight LLM or VLM. That model returns either data or a browser action, and the browser executes it locally. Show one complete task, and measure the latency, accuracy, and resource trade-off. Open-weight server models are allowed. Any open dataset may be used. Finale use cases, if the team is selected, are supplied later.

Organizer weights. The organizer did not publish a scoring formula or a pass mark. These weights are official. Any numeric score we attach is our own measurement, never an official SIH score.

| Metric | Weight |
|---|---:|
| Accuracy of visual context | 25% |
| Sensitive and PII detection, precision and recall | 20% |
| Redaction precision | 20% |
| Client resource use | 20% |
| Overall task latency | 15% |

Team. Second-year B.Tech CSE, RV University. Six people: Gopreet, Hiranmayi, Varun, Koushaik, Francis, Niharika. Roles below are proposed ownership, not evidence that anyone has those skills, and not accepted commitments. No portraits, no email addresses, no phone numbers, no registered team name, and no registered team ID exist in the repo. Never invent them. Use monograms until Francis supplies consented photos.

| Person | Proposed ownership |
|---|---|
| Francis | Integration and the technical pitch |
| Gopreet | API and persistence |
| Hiranmayi | UX and accessibility |
| Varun | Core domain implementation |
| Koushaik | Testing and reliability |
| Niharika | Research and narrative |

Product name is DHRISTI. Some documents say "DHRISTI vClaude". The codebase, package name, wire scheme, error prefixes, and Firefox gecko id stay `sightline`. Renaming a protocol constant breaks the contract and is forbidden. Historical v0.1 files keep their original names. Do not relabel an old Lighthouse run or an old slide as new evidence.

### 2. The rules that already govern this repo

Read these files first if the directory is present: `AGENTS.md`, `CONTEXT.md`, `PLAN.md`, `DECISIONS.md`, `DESIGN.md`, `ROAST.md`, `Wiki/problem-statement.md`, `Benchmarks/release-status.json`. On master, also read `Docs/decisions/brain-wrap-harder-finish.md`.

Evidence rule. A number may be written down only when a committed file in `Benchmarks/results/` or a spec section that cites such a file contains it. Read that file's `limitations` array before quoting it. Do not estimate, do not round a measured figure into a cleaner one, and do not merge a synthetic fixture with a user study. A passing unit test is not the results file a gate names. A probe of five sentences is an existence proof, not a rate.

Safety rule. Never weaken a failed guardrail to obtain a pass. Gate G11 is a real fail on both lines. Leave it failed until `Benchmarks/results/core-latency.json` exists and meets the written bar.

Secrets rule. Keys live in `warden/.env` or in `chrome.storage.local`. Never in a tracked file, never in a commit, never in chat. The public GitHub remote makes a committed key a published key. `/health` may say whether Groq is configured. It must never return the key.

Privacy rule. Raw screenshots, raw DOM text, raw task text, URLs, and field values do not cross the machine boundary. The only outbound object is the protected scene: control roles from a closed taxonomy, geometry, opaque region kinds, and placeholder tokens. Test only the synthetic fixture unless Francis names an authorized target.

Design rule. `DESIGN.md` outranks the vault guides library. The guides library outranks generic web inspiration. On the Warden line, pixel art is the direction and a violet glow is rejected. On master, the 22 September decision replaces that with the ARCH-002 HUD: zero radius, 8 px nine-slice frames, rectangular trust badges, stepped meters. Do not invent a third visual system. Record a conflict instead of silently picking a side.

Commit rule. Do not commit, do not push, and do not redeploy the website unless Francis explicitly asks in the current session.

Ports, already assigned on the machine that built the Warden line. Do not move them.

| Port | Owner |
|---|---|
| 8756 | Warden, when that process exists. Bind 127.0.0.1 only. Chosen because it was free on 13 September 2026. |
| 9041 | Forbidden for the Warden. Another project on this machine owns it. The master line's capture harness does use `http://127.0.0.1:9041/app/fixture.html`. Do not kill that listener to free the port. |
| 9051 | Prototype Node server, when that older server is running. |
| 11434 | Ollama. The only genuinely local model seen on 13 September was `qwythos-9b:latest`. Entries tagged `:cloud` are not local and must never be described as the offline path. |
| 7860 | Optional OmniParser. Off by default. Not exercised by any passing Warden-line run. |

Python. System Python is externally managed. The Warden, when present, runs on `~/.venvs/data/bin/python` (3.14.7 when last measured). Model cache is `HF_HOME=/Volumes/1TB SSD/LM/hub`. Do not pip install into system Python.

### 3. Chronology: everything already built on the Warden line

Read this as history of `sightline-v2-foundation`. Later sections of this chronology supersede earlier ones for that branch. Master then continued on a different line, recorded in section "Read this before the briefing". Earlier artifacts stay in the tree on purpose.

#### 8 September 2026. Preparation, before the problem ID was verified.

A preparation pack was built while the problem was still the unresolved shorthand SIH2171. That pack is historical. It is not the prototype.

Done then:

- Cited competition research for SIH 2022 through 2025, with a source index. Official 2024 SPOC guidelines were partly blocked (HTTP 403). No official 2026 numeric rubric was verified, so no persuasion probability was invented.
- 20 mandatory guardrails in `Guardrails/guardrails.json` and 11 KPI definitions.
- A six-slide deck cloned from a user-supplied 2025 idea-format PPTX, plus a separate 15-slide talk aimed at about 700 seconds, plus a reusable POTX.
- A static preparation website, later published to GitHub Pages.
- Process documentation, an impact model with null parameters, a demo runbook, and a claim ledger whose own scope line says it covers preparation claims only.
- `Docs/template-audit.md` inspected the 2025 template. Six content slides: title, idea, technical approach, feasibility, impact, research. It is a 2025 file. It was not verified as the 2026 portal format. Both decks were marked NOT SUBMISSION READY because team ID, team name, and validated results were missing. That mark still stood on the Warden line as of 13 September.

#### 9 September 2026. Identity resolved, first prototype.

The official SIH26171 row was retrieved from sih.gov.in, archived as `Raw/domain/sih-official.txt` (SHA256 `04ed9ddbcb9876a2918db6a0c8025034136a7cb29eeeadc175fbbfa03ed9261f`), and extracted to `Raw/domain/sih26171-official-extract.txt`. A community archive was saved as a cross-check and is not organizer authority. Gate G01 passed on this evidence.

Built that day:

- A browser workspace under `Prototype/`: local capture, shared privacy schema, real ONNX/WASM UltraFace face detector, a Node server, SQLite audit counts, and a native extension source plus build.
- A real browser workflow reached "Request ready for review" after Pending and Review. An expired capture was rejected. 390 px and 1440 px overflow checks were saved.
- Automated tests passed. The count lives in `Benchmarks/results/prototype-unit-tests.txt` on that branch. A dependency audit JSON was saved. Neither certifies the extension or broad privacy accuracy.
- The public Pages site was verified by commit and by live bytes. Publication is not prototype evidence.
- Stitch landing generation was used once. Fabricated generator metrics were rejected in `Docs/design-comparison.md`. Do not regenerate that screen to finish observing it.
- Six fresh local Lighthouse 12.8.2 runs of the then-current static site scored 100 in performance, accessibility, best practices, and SEO, mobile and desktop. That is gate G12 on the Warden line. It scores the historical static site. It is not a WCAG conformance claim and it says nothing about later prototypes. Master's later README records a different Lighthouse set: mobile performance 99, desktop 100, the other three categories 100. Do not merge those two runs into one claim.
- Release ledger that evening, Warden line: 2 pass, 1 fail, 17 unknown. No saturation claim. No competition-readiness claim.
- Candidate publication `69188d7`. Pages run 34379912074 succeeded. Seven public file hashes matched local bytes.

G11 already failed that day. Real model responses were seconds, not the self-imposed full-flow p95 under 200 ms.

#### 10 to 11 September 2026. v3, the four-layer split.

Frozen design: `Docs/specs/2026-09-10-sightline-v3-design.md`. Task graph: `Docs/plans/2026-09-10-sightline-v3-taskgraph.md`. This is the record of what was measured before the Warden. Do not restate v3 numbers as v4 numbers. On master, later waves replaced this shipping path. The spec may still be in the tree as history.

The v3 sentence: eyes and filter in the browser, brain on a server, hands in the browser. The client binary is identical for the SIH cloud demo, a public user, and an ISRO air-gapped rack. Only the planner origin changes, and it is a setting.

| Layer | Where | What it is |
|---|---|---|
| Eyes | Browser | UltraFace RFB-320 on ONNX Runtime Web WASM, face-only, plus a DOM walk. Not a vision-language model. |
| Filter | Browser, before any request | Role derivation over a closed taxonomy. Type-preserving placeholder tokens. Opaque region redaction. |
| Brain | Server | An open-weight LLM. Cloud during SIH. The same weights on a rack for ISRO. Lane A, the shipping planner in v3, called Groq model `openai/gpt-oss-20b`. |
| Hands | Browser | Click, fill, scroll, extract. Executed locally behind a client-side gate. |

What "protected scene" means. The only thing that crosses the boundary is control roles, geometry, opaque region kinds, and tokens of the form `TYPE#n` such as `EMAIL#1`. No pixels, no page text, no URLs, no values. The token-to-value map is a client vault. It is never serialised into a request, a step, or storage. Its `toJSON` throws so an accidental spread fails loudly. The vault is discarded when the revision is invalidated.

Vocabulary that later code on that branch still uses:

- Local capture stays in client memory. The web workspace used html2canvas. The extension uses captureVisibleTab.
- Role: a closed-vocabulary label for what a control does, derived on device from ARIA, tag, type, autocomplete, and a keyword dictionary. Page label text is never emitted.
- Plan: a server-proposed command from the v3 set, validated against the submitted scene.
- Op tier: reversible, navigational, state-changing, or destructive. Computed locally by the client from the scene it already holds. The server's tier is advisory telemetry only.
- Revision: an expiring client snapshot id. Stale commands are rejected.
- Intent-coherence override: if the task expresses destructive intent and the scene has no destructive control, the planned command is rewritten to `done`.
- Audit store: counts, timings, model id, and action type only. No scene contents, no task text, no values.

v3 commits that landed on the Warden line, in order of the plan:

| Wave | Work | Commits |
|---|---|---|
| 1 | Taxonomy corrections: dead roles, anchor semantics, nav landmark | `72bcb28`, `b9c053b`, `4afaa8f` |
| 1 | Placeholder vault and wire contract v3 | `f3152d1` |
| 1 | Coverage, escalation, token budget, orchestrator | `77d2813`, `1ff9e6a` |
| 2 | Op tiering moved to the client. Hostile-server probe. | `1734cbb` |
| 2 | Server route, lane orchestrator, deferred guard, error mapping | `56f4b3d` |
| 2 | Extension panel drives the full agent loop, verified in real Chromium | `839c519` |
| 2 | Await agent calls so the loop survives an async agent | `73d67e8` |
| G1 | String-level PII precision and recall | `c5de1fe` |
| G2 | Browser bench harness, fixtures, truth, DOM metrics | `cd1afd2`, `29f000d` |
| G2 fix | Type form fields from declared semantics. `button type=submit` no longer derives `unknown`. | `5cea80a` |
| H1 | API contract, context vocabulary, workspace copy, deployment docs | `81288bc`, `e75e4af` |

The critical safety fix is F17. Before `1734cbb`, the client trusted the server's `requiresConfirmation` field. A hostile double labelled a click on an `action-destructive` control as `requiresConfirmation: false`, and the click executed with `confirm()` called zero times. After the fix, the client computes the tier itself. The same probe called `confirm()` once and executed nothing. Unknown commands fail closed. Gate G21 passed on this, with `Benchmarks/results/prototype-unit-tests.txt` recording 208 of 208 against that build. Do not remove this gate. On the Warden line, the Warden later is necessary and never sufficient. Both must agree before a destructive action runs.

Other v3 findings that were closed on that branch. Do not reopen them as if they were unfixed:

- F4. Status words such as Pending, Review, Completed, and Details derived `unknown`, so coverage read 0 and every request escalated to vision. Fixed by a generic status vocabulary, not by special-casing the fixture.
- F5. Roles were unreachable, `action-delete` was shadowed, `link-external` was never derived, and a `log2(61)` bound was presented as measured. Fixed. Reachable set is 53 of 62 declared roles, so the channel is `log2(53) = 5.73` bits per control. `log2(62) = 5.95` is a loose upper bound over the declared set, not a measured channel. Both numbers are in the v3 spec section 6.
- F13 and F14. Every anchor became internal or external before keywords, so pagination lost its meaning. `javascript:` and bare fragments are internal. `mailto:` and `tel:` are external on purpose.
- F21. `<button type="submit">` derived `unknown`. After the fix, f2 control role accuracy moved from 0.90 to 1.00 on the same frozen corpus with no truth edits.
- F8. Asked to "delete my account" against a sign-in scene with no delete control, `openai/gpt-oss-20b` proposed clicking `action-primary-confirm` at high self-reported confidence. Five tasks, one scene, one model, one run each. That is an existence proof, not a rate. Do not quote a percentage. The mitigation is the local op tier plus the intent-coherence override. The model behaviour itself was not retrained.
- F9. The spec had estimated about 300 tokens and about 26 requests per minute. Measured was 588 to 601 tokens and about 13 requests per minute at an 8000 TPM ceiling, wall 292 to 595 ms. The spec was corrected. Do not restore the estimate.
- F10. `Prototype/dist/app.js` went stale while `npm test` stayed green, because tests hit source and the browser served the bundle. Standing rule: `npm run build` and `npm run build:extension` before any browser verification.
- F22 was retracted. A harness called `classifyValue` on form fields and reported a password as TEXT. The agent types a field from the element's declared type and autocomplete, not from content classification. The scene already carried `SECRET#1`.
- A wave-1 reachability figure of 51 of 62 was retracted. The probe's element double lacked `ownerDocument.baseURI` and did not combine ARIA state with roles. Re-measured at 53 of 62.
- Three harness bugs found by running it: the server CSP blocked the f3 fixture's inline script so shadow-root cases vanished, `Array.flat` does not expand a NodeList, and face boxes were compared in image space against page-space truth. All three fixed in `29f000d`.

v3 measurements, still the visual-context and redaction evidence on that branch. Source `Benchmarks/results/dom-metrics-v2.json` unless noted.

| Measure | Result |
|---|---|
| Control perception | 22 of 22 annotated controls matched across three fixtures. Detection precision 1 and recall 1 on each. |
| Role accuracy | f1 1.00, f2 1.00, f3 0.75 (20 of 22). The two misses are f3 `#accordion` and `#menu`. |
| Field values through the vault | f1 1 of 1, f2 6 of 6 typed correctly. |
| Face detection | f1 1 of 1, precision 1, recall 1, inference 19.7 ms on that fixture. |
| Redaction coverage | 1.00 on all three fixtures (16, 20, and 37 regions). |
| Redaction preservation | 0.00 on all three. Every text node becomes a private region. On the JSON wire this costs nothing, because only roles and rects are sent. It would matter for a visualisation or a future raster. |
| Client resources | Cold load 176 ms. 13,184,669 bytes transferred. Warm inference p50 8.5 ms and p95 12.9 ms over 30 runs. JS heap 18,200,000 bytes. |
| One Chrome segment, from the v3 spec section 6, not a gate pass | Capture 390 ms, local UltraFace 12.6 ms on WASM, outbound payload 1.5 KiB, model response 849 ms. |

Limits that belong to this measurement. Three synthetic pages, one machine, no confidence interval, ground truth by construction. Redaction is rect geometry against annotated rects, not a screenshot pixel diff. Nine of 62 roles are unreachable: seven forward-declared content roles (`paragraph-block`, `list-block`, `table-block`, `image-block`, `video-block`, `icon`, `badge`) plus `nav-primary` and `nav-breadcrumb`. v3 claims content exclusion, not origin anonymity. Control geometry is a layout fingerprint. An adversary with a corpus of rendered sites could plausibly identify the origin. Do not claim anonymity.

Lane B, the redacted-raster fallback for canvas and closed shadow DOM, was built and measured on 11 September (commits from `da2c2d1` through `e739a54`, including a 1 MiB body limit and selective region kinds). It is an experiment on that branch. The shipping wire there is JSON only. Do not describe Lane B as an enabled escalation.

Lane C, the task-string guard, returns `guard: not-configured` on the wire and in the startup log. Leaving it visibly absent was a decision. A deferred control that looks active is worse than one that is plainly missing.

The Ollama offline path in the Prototype server on that branch uses the older plan schema. It can click and scroll. It cannot emit `fill` or `extract`. That was recorded and not extended.

String-level PII for v3, source `Benchmarks/results/pii-detection-v1.json`: micro precision 0.4318, recall 0.3434, F1 0.3826, over 206 frozen synthetic cases. Free-text NAME, PASSPORT, and AADHAAR were undetected. DATE, ADDRESS, and SECRET recall were zero. This result is why v4 exists on that branch. Do not keep tuning the regex and call it a fix for names. A regular expression cannot recognise a person's name.

Extension panel evidence from this era, `Benchmarks/results/extension-panel-v1.json`: real Chromium, extension id matches the pinned manifest key, zero console errors, zero horizontal overflow at 320, 400, and 500 px, no control under 44 px. Destructive confirmation at 320 px: card 288 px wide, both controls 44 px, approve disabled until the typed word matches, tier text reads `Destructive`. That file does not contain a live task run.

Release ledger regenerated 11 September 2026 05:34 UTC by `scripts/check_release.py` on the Warden line. Status fail. `submission_ready` false. `saturation_achieved` false. Counts: 3 pass, 1 fail, 17 unknown, 21 gates.

| Gate | Status on that run | Why |
|---|---|---|
| G01 Verified problem identity | pass | Statement, official archive, and extract all exist. |
| G12 Website Lighthouse | pass | Six scores of 100. Scope is the old static site only. |
| G21 Client-side op tiering | pass | Hostile-server probe plus 208/208 tests. |
| G11 Core response time | fail | Bar is p95 end-to-end under 200 ms over at least 100 attempts per flow. Only a provider segment exists. `core-latency.json` was absent on that line. |
| G02 Six-person delivery ceiling | unknown | Spec exists. `Docs/architecture.md` and `Docs/scope.md` did not, on that line. Master later closed G02. |
| G03 Reproducible complete workflow | unknown | `e2e.json` absent on that line. Master later has an e2e harness and still leaves the human toolbar part unknown. |
| G04 Differentiation | unknown | `Wiki/competitors.md` exists. `differentiation.json` did not, on that line. Master later closed G04. |
| G05 Capacity | unknown | On that line, `load.json` was absent. Master Wave 7 records a 5-minute soak as a local-scope pass. |
| G06 Validated requests | unknown | On that line, tests existed and `security.json` did not. Master Wave 3 records G06 and G07 as pass. |
| G07 Access boundaries | unknown | Same split as G06. |
| G08 Deployment controls | unknown | On that line, a dependency audit existed under a different filename. Master Wave 6 records G08 as pass in a declared local scope. |
| G09 WCAG 2.1 AA | unknown | Review notes exist. A criterion-level results file did not, on that line. Master Wave 7 still marks G09 unknown. |
| G10 Responsive and motion | unknown | Panel widths were measured on that line. Master Wave 7 still marks G10 unknown. |
| G13 Error recovery | unknown | On that line. Master Wave 4 closed G13. |
| G14 Recorded demo | unknown | Needs a person. Master still says do not mark it pass. |
| G15 Honest claims | unknown | On that line the claim ledger was scoped to preparation artifacts. Master Wave 4 closed G15. |
| G16 Impact framework | unknown | On that line the impact model parameters were null. Master Wave 4 closed G16. |
| G17 Submission narrative | unknown | On that line. Master Wave 5 closed G17 and G18. |
| G18 Handoff README | unknown | On that line `Prototype/README.md` still documented the old Ollama path. |
| G19 Attribution | unknown | On that line the source index stopped at 8 September. Master Wave 4 closed G19. |
| G20 Human validation | unknown | Needs at least five non-author participants and three non-author reviewers. Master 22 September decision says G20 is paused. |

The 11 September ledger was not regenerated after the 13 September Warden work. Master's 14 September ledger is a different file on a different history. Re-run the checker on the tree you actually have. Do not hand-edit a status to pass. Do not copy a pass from one line onto the other.

#### 11 to 12 September 2026. Root extension, the DHRISTI README spec, Warden line.

A second build lives at the repo root in `extension/` on that branch, distinct from `Prototype/extension/`. The user-supplied README for this pass specified that root folder. Work was split so three packages could not edit the same files. Master may not have this root `extension/` layout. Check before editing.

Frozen storage contract from that pass:

`chrome.storage.local`, survives everything: `geminiKey`, `groqKey`, `omniparserUrl`, `useOmniparser` (default false), `provider`, `showMouse`, `showTypingIndicator`, `sendScreenshot` (default false). No key is ever written to a tracked file. v4 later removed the cloud keys from the browser entirely. If you are on the Warden line and you find Gemini or Groq calling code in the extension, that is a regression.

`chrome.storage.session`, survives a popup close and dies with the browser: `dhristiRun = { status, stepNumber, steps, redactionLog, startedAt, omniStatus }`. Never a raw value, a task string, or a vault entry.

Messages. Popup or panel to background: `START_TASK {task, provider, tabId}`, `STOP_TASK`, `STATUS`, `CLEAR_STEP_LOG`, `REDACTION_LOG`. Background to panel: `STEP_UPDATE {step}`, `STATUS_UPDATE {status}`. Background to content: `PING`, `SET_VAULT {tokens}`, `PAGE_SCAN`, `EXECUTE_ACTION {action}`, `END_TASK`.

`PAGE_SCAN` returns `{ elements, dom, digest, piiFields, piiMaskedCount, viewport }`. Each element carries `{ tag, type, selector, label, x, y, filled, fieldType, pii }`. The `pii` boolean is content.js's single authority, the same predicate used for screenshot masking, plus a label-text redactor match. The panel must not keep a second, weaker heuristic.

Vault. Background derives `TYPE#n` from the task text, sends the map once via `SET_VAULT`, and never puts it in a request, a step, or storage. Rehydration happens only in the content script. An unknown token is refused, not typed blank. `<mask-pii/>` is accepted only when the vault holds exactly one value. An ambiguous alias is refused.

Four conflicts with the supplied README were resolved in `DECISIONS.md` on that branch and must stay resolved there:

- Keys are entered in the UI and stored in `chrome.storage.local`, not pasted into `background.js`. v4 then moved the only cloud key into `warden/.env`.
- The README named `gemini-2.0-flash`. That id was past its shutdown. The recorded replacement was `gemini-3.6-flash`. v4 then removed the Gemini call from the browser altogether.
- Screenshots on the wire are opt-in via `sendScreenshot`, default off. Off keeps the no-pixels claim true. On may attach a PII-masked capture only, never the original.
- "No persistent storage" was reconciled with a step log that survives popup close by using `chrome.storage.session` for loop state only.

Chromium verification of that README build used a stub provider and is labelled as a stub in `Benchmarks/results/extension-readme-build-v1.json`. It is not a live Groq run. The folder was swept of AppleDouble `._*` files and of secrets.

#### 13 September 2026. v4, the Warden. Shipping architecture of `sightline-v2-foundation` only.

Frozen spec: `Docs/specs/2026-09-13-dhristi-v4-warden.md`. It superseded the v3 in-browser filter for that branch. The v3 spec remains the measurement record of the previous filter. Master does not contain this directory. Do not add it to master unless Francis asks for that merge.

Why. v3 string-level F1 was 0.383. Names, passports, and Aadhaar in free text were invisible. The wrong class of model was in the browser.

Pre-build probe, recorded before code was written, on this machine:

| Fact | Value |
|---|---|
| Model | `urchade/gliner_multi_pii-v1` |
| Runtime | `~/.venvs/data`, torch 2.14.0, transformers 5.16.1 |
| Cold load including first download | 76.4 s |
| Warm load, weights cached | 15.7 s |
| Inference on a 3-sentence, 5-entity probe | 182 ms, later strip timing 137 ms |
| Detected | address 0.995, passport 0.999, aadhaar 0.995, email 1.000, phone 1.000 |
| Uncertain | person name 0.423 on "Hi, I am Francis Reuben R" |
| True negative | `Order id 7781234` not flagged |

The 0.423 is why the uncertain prompt exists. It is not a hypothetical branch.

Five stages:

1. PERCEIVE, in the browser. Content script serialises the DOM and can capture the visible tab.
2. STRIP, in the Warden, on the same machine. Regex and GLiNER.
3. PLAN, Warden calls Groq. Only the sanitised scene leaves the machine.
4. VALIDATE, Warden, local. Deterministic checks, then optional Ollama reasoning.
5. EXECUTE, browser. The extension re-computes the op tier locally and only then acts.

The browser holds no cloud key.

Warden process. FastAPI. Bind `127.0.0.1:8756` only, never `0.0.0.0`. It is a PII oracle. Anything that can reach it can ask what in a text is personal. Start:

```sh
cd warden
export HF_HOME="/Volumes/1TB SSD/LM/hub"
~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756
```

`/health` reports `loaded: false` until the model finishes. `/strip` returns 503 until then. Poll health. Do not assume ready.

Endpoints: `GET /health`, `POST /strip`, `POST /plan`, `POST /validate`. Every response carries a `warden` version so the panel shows what actually stripped, not a hardcoded label.

Strip contract, shortened. Request may include `task`, `dom`, `elements`, and `resolved`. `resolved` is the user's earlier answers for uncertain spans, `strip` or `keep`, so the same question is not asked twice. Response includes `tokenizedTask`, `sanitizedDom`, `tokens`, updated elements, `uncertain`, and `decisions`. `tokens` returns to the extension because the browser already held those values. They go into the client vault and must not be forwarded to `/plan`. If `uncertain` is non-empty, the extension must prompt and must not call `/plan` for that span until answered.

Confidence bands:

- score at least 0.60: strip silently
- 0.35 up to but not including 0.60: ask the user
- score under 0.35: ignore
- person name uses a lower uncertain floor of 0.12, not 0.35
- a regex hit always strips and never enters the uncertain band

Layer order was corrected after a bad first implementation. Running regex first and then handing `TYPE#n` tokens to GLiNER depressed real name scores and made the token itself look like a person (a probe scored `EMAIL#1` as a person name at 0.095). Both layers now run independently on the raw text. Spans merge in the original coordinate space. The regex layer wins on overlap. The model can add coverage. It cannot remove a regex hit.

Person-name floor ground: the same name scored 0.423 in a declarative sentence and 0.241 in "Log in as Francis Reuben R", so the imperative form fell through the 0.35 floor and would have reached the planner in plaintext. A missed name is a privacy breach. A spurious prompt costs one click. That asymmetry is why the floor is 0.12 for person name only. After the change, on five cases, the imperative name prompted, a second name prompted, and two PII-free controls produced zero tokens and zero prompts. Five cases are not a rate.

Plan contract. Request carries `tokenizedTask`, `sanitizedDom`, `elements`, `history`. Never `tokens`, never a raw value, never a screenshot unless the caller explicitly opted in. Fallback chain, configuration rather than a hardcoded constant, move on immediately on HTTP 5xx, 429, timeout, or an unparseable body:

1. `llama-3.3-70b-versatile`
2. `openai/gpt-oss-20b`
3. `llama-3.1-8b-instant`

`switched` in the response lists models that failed before the one that answered. Do not invent model ids to pad the chain.

Validate. Deterministic checks first, then optional local reasoning. The extension still re-gates. A Warden `accept` does not authorise a destructive click by itself.

Warden tests recorded with the build: 32-test suite, 31 passed, 1 skipped because it is the opt-in real-model test. That skipped test was run separately and passed in 19.15 s. Ollama was unreachable during the destructive-escalation check, so "Ollama up" behaviour is not established. "Ollama down, destructive plan still escalates" is established.

v4 PII measurement against the same frozen 206-case corpus. Source `Benchmarks/results/pii-detection-v2.json`, timestamp 2026-09-13T06:52:23Z. Dataset `Benchmarks/datasets/pii-strings-v1.json`, frozen 2026-09-11, seed 20260910, SHA256 `10e66cd25372d53bb929372ecea64555d647c958a90f0679215d1af728740a79`. Synthetic. Not real persons. Not field data. Scored by importing `warden/strip.py`, which is the function `POST /strip` calls, not a reimplementation.

| | v3 regex | v4 Warden |
|---|---:|---:|
| Micro precision | 0.4318 | 0.7447 |
| Micro recall | 0.3434 | 0.6325 |
| Micro F1 | 0.3826 | 0.6840 |
| Cases | 206 | 206 (166 positive, 40 hard negative) |

Layer attribution. Regex and GLiNER did not overlap in what they solved. GLiNER contributed 36 of 105 true positives, all on the four free-text types. Regex contributed 69, all on the six structured types. The merge destroyed no true positive. That is the measured justification for two layers.

Per-type recall in v4, from the rubric file which quotes the results file: EMAIL 1.00, PHONE 0.50, NAME 0.857, CARD 1.00, AADHAAR 0.75, PAN 1.00, PASSPORT 1.00, ACCOUNT 0.688, ADDRESS 0.643, SECRET 0.333, DATE 0.00, TEXT 0.00.

Do not hide these regressions:

- Phone recall halved, from 1.00 in v3 to 0.50. Precision rose from 0.250 to 0.727. The v3 phone pattern was loose and produced 48 false positives, so the old recall was not a quality win. The v4 misses that matter on an Indian deployment are `098765 43210`, `(080) 2345 6789`, `080-23456789`, and `+91 (022) 6543 2100`.
- Generic TEXT recall is 0. v3's keyword branch caught 7 of 14 generic-sensitive sentences. One case, "Reset your password now.", fires `password` at 0.791 and is then dropped by the structural-descriptor guard, which exists so the model does not destroy DOM selectors. That trade is recorded with its cost. It is not an unfixed bug.
- DATE is unreachable at the current floor. The only candidate label, `date of birth`, peaked at 0.2895 against a 0.35 floor. Zero predictions across 206 cases. Also, mapping DATEOFBIRTH onto the corpus DATE type is a generous alignment, because the corpus dates are appointment, contract, and renewal dates, not birth dates. The results file contains a sensitivity rescore. Read it before claiming DATE performance.
- NAME precision 0.480 and ACCOUNT precision 0.458. GLiNER's 28 false positives include SECRET values read as person names and Aadhaar or card digits read as account numbers. That is the cost of the recall gain.
- 17 of 40 hard negatives were falsely flagged, 11 of them silently, against 23 of 40 in v3. Worst single case: "The new coffee machine on the third floor is finally fixed." silently stripped as ADDRESS at 0.749.
- TEXT has zero predictions, so its recall is zero by construction and must not be averaged into a headline as if it were a measured attempt.

#### 13 September 2026, later. Side panel, and the two-build trap. Warden line only.

Francis reviewed the extension and reported five UI problems plus four outstanding tasks. Recon found he had loaded `Prototype/extension/`, the v3 side panel with a pairing token and user-facing Capture, Send, and Confirm buttons. The v4 build at root `extension/` had already internalised those steps. Four of the five complaints were about the wrong folder.

Resolution, already done on that branch. Root `extension/` is the only build to load. It is a side panel, not a toolbar popup. `Prototype/extension/README.md` says that folder is superseded and must not be loaded. The old folder was kept because this repo preserves historical artifacts. Nothing was deleted to clean up history.

Manifest on that commit, version 0.4.0, name DHRISTI. Manifest v3. Permissions: `activeTab`, `scripting`, `storage`, `sidePanel`. No `default_popup`. `action.default_title` is `DHRISTI`. Side panel path `sidepanel.html`. Service worker `background.js`, module. Content script on `<all_urls>` at `document_idle`: `utils/visualizer.js` then `content.js`. Host permissions: `http://127.0.0.1:8756/*`, `http://localhost:8756/*`, `http://localhost:7860/*`, `<all_urls>`. Icons 16, 48, 128 are generated PNGs from `scripts/generate_dhristi_icons.mjs`, which is a one-time generator, not a runtime build step. Chrome rejects comments in `manifest.json`.

Side panel behaviour that was verified. A toolbar click opens the panel. There is no pairing token. Capture, Send-protected-layout, and Confirm-this-action are not user controls. Inspect and server setup sit in one collapsed Diagnostics disclosure. The panel discovers port 8756 and, if the Warden is down, says to start the server and offers Retry. It does not silently fall back to a cloud call.

Verification file `Benchmarks/results/extension-sidepanel-v1.json`, measured 2026-09-13T07:18:49Z. Playwright 1.60.0 Chromium, persistent context, `--load-extension` from `extension/`, panel document opened as an extension page at 320 px and 400 px, real Warden answering `/health`, `/strip`, `/plan`, and `/validate`, fixture `test/demo.html`. 13 of 13 checks passed. Zero console errors. Zero page errors. After three real runs and both blocking cards, the forbidden controls were still absent.

What that file does not prove, copied from its own limitations:

- The docked Chrome side panel was never driven. Chrome exposes no automation handle for it. Docking, resizing, and focus of the docked surface are unmeasured. The document at panel widths is measured.
- The extension's own local destructive-tier gate did not fire in these tasks. The cards that appeared came from the Warden's reasoning layer.
- The model-still-loading 503 path was not exercised. The Warden reported loaded throughout.
- The missing-Groq-key state was not exercised. `warden/.env` held a real key during the run. Do not look for that key, do not print it, and do not ask Francis to paste a replacement.
- One browser, one machine.
- OmniParser was off and no OmniParser server was running.
- The specific plan action is not reproducible on demand because `/plan` hits a live third party. The pipeline behaviour is what was tested.
- Only the `/plan` request body was captured as outbound evidence. `/strip` carries raw task text by design and was deliberately not recorded.

Website on that branch. `Website/` was restyled to the same pixel system. A local check recorded 0 overflow at 1440 px and 390 px, zero console errors, `prefers-reduced-motion` static, and contrast computed per pairing. That restyle was not what GitHub Pages was serving on 13 September. Master's later wraps changed the site again. Do not claim the live URL matches either description without fetching it.

Also never claimed, from the 11 September deployment note on that branch: no public backend, no Chrome Web Store listing, the Dockerfile has not been run, no ISRO rack has been used, and the origin grant flow was exercised only against loopback.

Design system on that branch, `DESIGN.md` and `extension/pixel.css`, extracted from a supplied video frame by frame on 13 September 2026. These are measured pixels, not a mood board. Master's 22 September HUD supersedes this if you are on master.

| Token | Hex | Meaning |
|---|---|---|
| `--ground` | `#0B0B0F` | Page and panel ground |
| `--cream` | `#E8E9DE` | Structure, body text, borders |
| `--amber` | `#FCC34A` | A decision is waiting on the user |
| `--red` | `#FF0000` | Personal data, or a destructive tier |
| `--red-deep` | `#B71A00` | Red at rest |
| `--blue` | `#142EFF` | A plan was accepted |
| `--blue-deep` | `#1F2181` | Blue at rest |

Contrast against ground, measured 13 September: cream 16.04:1, amber 12.20:1, pure red 4.91:1 so red is for marks and large type only, pure blue 2.68:1 so blue never carries text. Small text that must read as red uses `#F84643` (5.56:1). Small text that must read as blue uses `#6979F2` (5.26:1). The cell motif is an 8 px module of filled and outlined squares. A violet-glow reference image was rejected on purpose. Its serif headline treatment was kept. Its palette was not.

`PLAN.md` on `2afd215` still shows the side-panel and v4 PII boxes unchecked. That file was not updated after the work landed. On that commit, trust the results files, not those checkboxes. On master, `PLAN.md` is a different document and those checkboxes are not the status.

### 4. File map for the Warden line

Confirm the path exists before you edit it.

| Path | What it is |
|---|---|
| `extension/` | On `2afd215`, the only extension to load. v0.4.0 side panel. |
| `extension/background.js` | Loop, vault source, Warden client. No cloud key. |
| `extension/content.js` | Scan, rehydrate, execute, screenshot mask. |
| `extension/sidepanel.html`, `.js`, `.css` | Chat surface. |
| `extension/pixel.css` | Design tokens for that line. |
| `extension/utils/redactor.js` | The JS regex the Warden port was taken from. |
| `extension/utils/warden.js` | Loopback client. |
| `Prototype/` | v3 workspace, tests, UltraFace, Node lanes. Source of the DOM metrics on that line. Not the folder Francis should load on that line. |
| `Prototype/extension/` | Superseded on that line. Labelled. Do not load. |
| `Prototype/shared/` | Vault, roles, op tier, agent loop, privacy. |
| `warden/` | FastAPI app: `app.py`, `strip.py`, `redactor.py`, `entities.py`, `groq_client.py`, `ollama_client.py`, `validate.py`, `tiers.py`, `minter.py`, `test_warden.py`. Absent on master. |
| `Website/` | Static site. Bytes on Pages are whatever `master` last deployed. |
| `test/demo.html` | The fixture the Warden-line side-panel harness drove. |
| `Benchmarks/datasets/pii-strings-v1.json` | Frozen corpus on that line. Do not edit the cases to improve a score. |
| `Benchmarks/results/` | The only evidence that may be quoted. |
| `Benchmarks/official-rubric.json` | Weights plus observed values. `score` stays null. |
| `Benchmarks/release-status.json` | On the Warden line, the 11 September ledger. On master, the 14 September ledger. |
| `Guardrails/guardrails.json` | The gates the checker enforces. |
| `scripts/check_release.py` | Regenerates the ledger. Nonzero exit while a mandatory gate fails or is unknown. That nonzero exit is correct. |
| `Wiki/` | Problem statement, domain research, competitors, pitch strategy, source index. |
| `Raw/` | Immutable archives of what was retrieved. Do not rewrite them to match a later conclusion. |
| `Docs/specs/` | v2, v3, and on the Warden line the v4 Warden spec and the side-panel spec. |
| `Docs/submission-deck.pptx` and `.pdf` | Six-slide candidate. Not submission ready. |
| `Docs/pitch-deck.pptx` and `.pdf` | 15-slide talk. Not the portal file. |
| `Docs/presentation-render/` | Contact sheets from earlier renders. |
| `ROAST.md` | Findings log on the Warden line. Append. Do not delete a retracted finding. |

Reproduce, from `Prototype/`, when that tree is the one you have:

```sh
npm ci
npm test
npm run build
npm run build:extension
```

From the repo root: `python3 scripts/check_release.py`. Expect a nonzero exit until the unknown gates are actually measured.

### 5. What was explicitly not done on the Warden line, as of 13 September

- Not submission ready. Do not upload the deck from that date.
- No registered team ID, team name, authorization letter, or SPOC nomination recorded anywhere.
- No demo video on that line. Master later added an explain video of about 108 seconds. That video is not a judged demo recording and does not close G14 by itself.
- No human study. Master says G20 is paused.
- No full-flow latency pass. G11 stays failed on both lines.
- Indian phone formats listed above are an open measured gap on the Warden corpus.
- DATE and generic TEXT are at zero recall on that corpus.
- Public website on 13 September was still the 9 September candidate. Master has shipped further website commits since.
- Ollama on that line cannot emit `fill` and `extract` on the old schema, and "Ollama up" validation was not measured.
- OmniParser is a toggle, default off, never part of a passing run on that line.
- Lane B raster is an experiment, not the shipping wire, on that line.
- Lane C guard is visibly not configured, on that line.
- No anonymity claim, no saturation claim, no competition-readiness claim.
- Master's own 22 September note repeats: no DigiLocker partnership, no MeitY seal, no invented metrics, `submission_ready` false.

Deadline handling. Internal target 11 September has passed. Live catalogue row on 23 September showed 30 September 2026 and 28 of 500 ideas. The SPOC guidelines PDF says 15 September 2026. Do not tell Francis the entry can still be submitted, and do not tell him it cannot. Tell him to confirm nomination with the college SPOC, then build the portal PDF only if that answer is yes.

### 6. What to do next

If the directory is absent, write the plan that corresponds to these steps and stop. Do not create a second project.

If you are on master, do not execute the Warden steps. Report the divergence in the header, then continue from `PLAN.md` Wave 7 and the 22 September decision. The still-true constraints on that line are: G11 stays fail, G20 stays paused, `submission_ready` stays false, and no number is invented.

If you are on the Warden line and `warden/` exists:

1. Read the files named in section 2. Confirm commit `2afd215` or a later descendant. If the tree has moved, follow the tree.
2. Re-run `python3 scripts/check_release.py`. Update `Docs/claim-ledger.json` so every figure in the root `README.md` is either cited to a results file or removed from the claim set. Rewrite `Prototype/README.md` so a stranger can start the shipping Warden and the root extension, not the retired Qwen path. That is gate G18 on that line. Do not mark G18 passed unless the README matches what actually runs.
3. Fix the four Indian phone patterns named above. Re-measure the same frozen 206-case corpus into a new file `Benchmarks/results/pii-detection-v3.json`, with per-type deltas against v2. If F1 falls, report the fall. Do not edit the dataset.
4. Add only the missing evidence files the gates already name, and only if they are still missing on your tree: `e2e.json` from a clean setup through a persisted result and a reload, `security.json`, `load.json`, `recovery.json`, `accessibility.json`, and a browser review covering 1440 px, 200 percent zoom, reduced motion, and keyboard order. Drive the synthetic fixture only.
5. Produce a new six-slide PPTX and PDF in the supplied six-heading order: title, idea, technical approach, feasibility, impact, research. Every sentence that states a result must cite a results file. Leave the team ID and team name as visible blanks. Mark the deck submission-ready only after Francis types those two strings. Keep the 15-slide talk as a separate file and do not call it the portal upload.
6. Do not deploy, commit, or push unless this session's user message explicitly says to.
7. Stop and hand back to Francis for: the SPOC question, the demo recording, and the five-person human review.

Done, for a Warden-line session, means the checker has been re-run, every new number has a new results file, G11 is still an honest fail, the phone re-measurement exists even if it got worse, and the six-slide file is either blanked for a team ID or explicitly not ready. Done does not mean the hackathon entry is submitted, selected, or competition-ready.

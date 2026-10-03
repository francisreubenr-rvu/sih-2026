# Code audit, 3 October 2026

Audited base: `7c35778a03cc3905ced4dd255d9df9689667b96b`.
Delivery branch: `codex/full-code-audit-2026-10-03`. All proposed changes belong in a PR. No runtime implementation or release ledger is changed by this audit.

The most urgent findings are incorrect reuse of privacy approvals (A01) and unsafe suppression of entity detections (A02). Both were reproduced with synthetic detector outputs. Fix those before treating the passing unit suites as assurance that new values remain private.

## Coverage and limits

[coverage.json](coverage.json) records source coverage after enumerating all 986 tracked paths at the base commit. It records hashes, line counts, parsing checks and review prompts for **207 maintained source files, 31,468 lines**. Every line in that source inventory received automated scanning. **100 files received focused manual source review**, concentrating on privacy, execution, authentication, inference, scoring and publication. The remaining files are explicitly marked `not_claimed` for manual review. This is not a claim that every line has received exhaustive manual semantic review or that the tree has no other defects.

The inventory includes runtime code, tests, Python tools, notebook code cells, workflows, HTML, CSS and the G11 fixture. Python AST, JavaScript syntax (including inline scripts), YAML and transformed notebook code parse successfully. All 208 tracked JSON files parse. CSS received line scanning only. HTML parsing does not establish conformance, accessibility or correct rendering.

55 source-like paths are separately classified as third-party runtimes, downloaded research, generated reports or historical source snapshots. Their presence is accounted for; they are not counted as current first-party implementation. Model binaries, fonts, images, videos and packaged downloads are not line-oriented source. JSON/JSONL datasets are not executable code, and parsing JSON does not authenticate its evidence. The audit does not install or run real model weights, contact a cloud planner, test real sites or change historical measurements.

The primary path is root `extension/` plus `warden/`. `Prototype/` remains a separate legacy/demo surface; findings there must not be represented as defects in a different runtime. The same distinction applies to old benchmark tools and generated delivery artifacts.

## Master protection: action still required

The GitHub branch API reports `master.protected = false` at the audited SHA. Repository ruleset listing returned an empty array. Reading classic protection and creating the proposed ruleset both failed with HTTP 403, `Resource not accessible by integration`. The available GitHub integration cannot enforce this request, even though the repository permissions response reports the actor as an administrator.

The proposed [master-ruleset.json](master-ruleset.json) requires a PR, one approving review, dismissal of stale approvals, resolution of review threads, and blocks deletion and force pushes. It has no bypass actors. An owner with repository administration access can apply it through Settings > Rules > Rulesets or the command below, then verify enforcement. Preserve existing protections if the state changes before application.

```bash
gh api --method POST repos/francisreubenr-rvu/sih-2026/rulesets \
  --input Docs/audits/2026-10-03/master-ruleset.json
gh api repos/francisreubenr-rvu/sih-2026/branches/master --jq .protected
gh api repos/francisreubenr-rvu/sih-2026/rulesets
```

`AGENTS.md` now proposes a persistent PR-only rule. That instruction governs agent behavior; it does not replace server-side enforcement. Do not mark this item complete until the active server rules are verified. Choosing required CI checks needs care: the current test workflows filter by changed paths, so requiring their job names on every PR can leave documentation-only PRs waiting indefinitely. First introduce checks that always report a result, then require the stable names. GitHub administrators must also consider rules affecting workflow, app, bot and notebook saves.

## Prioritized findings

P1: fix promptly because privacy or execution safety is affected. P2: correctness, availability or evidence reliability. P3: maintainability or efficiency improvement. "Reproduced" means the attached synthetic probes demonstrate the described behavior; it does not mean a real person's data was leaked.

### A01, P1: token-number approvals apply to a different value

**Locations:** [background.js:140](../../../extension/background.js#L140), [background.js:901](../../../extension/background.js#L901), [background.js:924](../../../extension/background.js#L924), [strip.py:127](../../../warden/strip.py#L127), [strip.py:217](../../../warden/strip.py#L217).

The extension retains one `resolvedAnswers` object across scans and runs, indexed by token number. Warden constructs a fresh minter for every request. Consequently `PERSONNAME#1` can identify a new value while retaining the old `keep` decision. The probe first produces an uncertain name, then shows a different synthetic name passing through `sanitizedDom` without another prompt when the same token is kept. Regex-only egress checks cannot reliably detect a missed name.

**Fix:** bind decisions to exact value/type identity and run or request scope, using identifiers that cannot be reassigned when the DOM changes. Clear decisions at a new run, but do not rely on that alone: values change within a run too. Keep raw decision identity local and out of cloud history. Audit action-history tokens for the same numbering drift.

**Verification:** keep one value, insert/reorder other detections, then scan a different page and start a second run. A new value must ask or strip; a prior approval must never silently authorize it. **Reproduced:** `warden-probes.json:staleKeep`.

### A02, P1: the descriptor filter ignores digits and punctuation

**Locations:** [entities.py:168](../../../warden/entities.py#L168), [entities.py:394](../../../warden/entities.py#L394).

`_is_structural_descriptor` extracts only `[a-z]+` words before deciding that a detected span is a field descriptor. A value such as `secret123!` reduces to `secret`; `123 street` reduces to `street`. Both satisfy the descriptor-word allowlist and are discarded even when the stub detector assigns confidence 0.99. The output contains the original value with no token, uncertainty or decision. Dropping non-ASCII content can produce similar problems.

**Fix:** restrict descriptor exemptions to known structural metadata or exact field-label contexts, and require full-string matching. Digits, symbols and mixed scripts must not disappear from the decision. Preserve offsets and the existing confidence policy; do not lower thresholds to conceal misses.

**Verification:** descriptors alone versus synthetic credentials, numbered addresses and mixed-script values, at uncertain and high confidence. **Reproduced:** `warden-probes.json:descriptorSuppression`.

### A03, P1: typing bypasses read-only and disabled controls

**Locations:** [content.js:393](../../../extension/content.js#L393), [content.js:536](../../../extension/content.js#L536).

The live refusal checks visibility, geometry, overlays and inertness, but not `disabled`, `:disabled` or `readOnly`. Calling the native value setter overwrites a read-only input in Chromium. User confirmation of a plan is not evidence that the current target is writable.

**Fix:** enforce native disabled state, disabled fieldsets, relevant ARIA state and read-only typing restrictions both at scan and execution. Check the native write contract before dispatching events.

**Verification:** controls becoming disabled/read-only after scanning, including ancestor fieldsets, must be refused without a value change. **Reproduced:** `browser-probes.json:readOnlyType`.

### A04, P2: no-op clicks are recorded as changed

**Location:** [content.js:561](../../../extension/content.js#L561).

Every supported action returns `changed: true`. A button disabled after scanning receives no click event, but execution reports a successful change. The worker then records an `ok` step, which can mislead the planner and completion view.

**Fix:** reject disabled targets and distinguish dispatched actions from observed changes. Compare relevant before/after state or validate a declared postcondition; a digest alone is not proof of task completion.

**Verification:** disabled buttons and handlers that decline an action must not create a successful-change record. **Reproduced:** `browser-probes.json:disabledClick` (zero clicks, `changed: true`).

### A05, P2: focus handlers mutate targets after the last live check

**Location:** [content.js:545](../../../extension/content.js#L545).

The code assumes that synchronous execution between live checks and a native setter prevents target changes. `focus()` synchronously invokes page handlers. The probe removes the input in its focus handler; execution then writes into the disconnected element and reports success. Input/change handlers can also alter the resulting value.

**Fix:** revalidate identity, connectivity, writable state and relevant tier after focus, then verify the resulting live value after events. Avoid introducing extra unchecked page callbacks between the final check and write.

**Verification:** focus-time detach/replace/read-only changes and input-time value rewrites must produce refusal or uncertainty. **Reproduced:** `browser-probes.json:focusDetach`.

### A06, P2: invalid probabilities enter the optional fast path

**Locations:** [fastpath.py:83](../../../warden/fastpath.py#L83), [fastpath.py:235](../../../warden/fastpath.py#L235), [fastpath.py:257](../../../warden/fastpath.py#L257).

Missing free-text probability bypasses the veto. `NaN` bypasses comparisons for both confidence and free-text probability. Booleans and out-of-range values also satisfy the numeric type check. Threshold configuration is parsed without checking finiteness or bounds. The probes show accepted finish plans with missing and `NaN` values.

**Fix:** require finite, non-boolean probabilities and thresholds in `[0,1]`; missing or malformed outputs must defer. Apply the same contract to evaluation tools so benchmark gating matches runtime gating.

**Verification:** missing, null, boolean, string, `NaN`, infinity and out-of-range values must never authorize the shortcut. **Reproduced:** `warden-probes.json:fastpath`. This path is optional and off by default; Jev remains disabled and the fast-path training track remains parked.

### A07, P2: synchronous inference and HTTP calls block async routes

**Locations:** [app.py:122](../../../warden/app.py#L122), [app.py:281](../../../warden/app.py#L281), [app.py:302](../../../warden/app.py#L302).

The async handlers call synchronous redaction, planning and review directly. Two concurrent synthetic `/plan` calls with a 250 ms blocking stub take about 503 ms, serializing the work. Real inference and provider timeouts can delay health checks and other requests long enough for the extension to report a healthy Warden as unreachable.

**Fix:** use an explicit bounded inference worker/queue or appropriate thread offload, and persistent asynchronous HTTP clients where suitable. Define model/cache synchronization before permitting parallel execution. Do not blindly move the mutable detector and LRU into unrestricted threads.

**Verification:** health responsiveness during slow inference, bounded parallel requests and consistent cache behavior under concurrency. **Reproduced:** `warden-probes.json:blockingPlan`. The probe measures scheduling only, not model speed.

### A08, P2: malformed client requests return HTTP 500

**Locations:** [app.py:133](../../../warden/app.py#L133), [app.py:282](../../../warden/app.py#L282), [app.py:303](../../../warden/app.py#L303).

Routes parse arbitrary JSON and access fields without validated request models. `/validate` returns 500 for an array, a JSON string and invalid JSON. Similar unchecked field contracts appear in `/strip` and `/plan`. Authentication does not validate the request schema or bound inference cost.

**Fix:** typed request models, limits on strings/elements/history and a bounded body read before expensive processing. Return controlled 400/422/413 responses without raw body or credential logging. Keep pairing mandatory.

**Verification:** malformed syntax, wrong top-level types, wrong field types, oversized bodies and oversized element lists must fail predictably before inference. **Reproduced:** `warden-probes.json:malformedValidate` and `invalidJsonStatus`, with pairing disabled only inside the probe process.

### A09, P2: the legacy local reviewer permits remote destinations

**Locations:** [ollama_client.py:122](../../../warden/ollama_client.py#L122), [ollama_client.py:195](../../../warden/ollama_client.py#L195).

`plan_via_ollama` checks loopback configuration and cloud model tags. `review` does neither, despite documenting a local-only review path. A stub transport confirms that a remote `OLLAMA_HOST` and cloud-tagged model reach its HTTP call. This affects optional legacy `/validate`, not the current root extension's v5 loop.

**Fix:** reuse the local destination/model checks for review and record rejection as skipped or unavailable. Ensure it cannot silently become a cloud fallback.

**Verification:** remote origins and cloud-tagged models must be refused before transport. **Reproduced:** `warden-probes.json:reviewRemoteHost`. No remote connection was made.

### A10, P2: legacy mask merging silently drops excess regions

**Location:** [privacy.mjs:60](../../../Prototype/shared/privacy.mjs#L60).

`mergeRegions` returns as soon as it accumulates 200 regions, dropping later disjoint sensitive regions without reporting an overflow. The probe returns 200 regions for 201 inputs. Selective local previews can therefore leave later detected regions unmasked. Semantic outbound payloads still contain no screenshots; this is a local preview coverage defect.

**Fix:** an explicit overflow state with conservative fallback, or bounded coalescing that preserves coverage. Do not solve it by silently discarding lower-confidence detections.

**Verification:** more than 200 disjoint boxes and dense multi-kind masks must preserve protection or visibly fall back. **Reproduced:** `browser-probes.json:regionLimit`.

### A11, P2: the legacy API concurrency limit races across body reads

**Location:** [app.mjs:87](../../../Prototype/server/app.mjs#L87).

The server checks `inFlight >= 2` before awaiting the complete request body, then increments only after parsing. Three slowly delivered valid requests all pass the check before any is counted. The probe observes three concurrent inference calls and three HTTP 200 responses.

**Fix:** reserve capacity before the first await and release it in a `finally` covering body validation and inference. Define whether the limit counts readers, inference calls or both, and bound body-read time.

**Verification:** simultaneous chunked bodies, malformed bodies and disconnected clients must respect the cap without leaking reservations. **Reproduced:** `browser-probes.json:prototypeConcurrency`.

### A12, P2: the legacy latency helper uses the wrong boundary

**Location:** [rubric-hooks.mjs:79](../../../Prototype/shared/rubric-hooks.mjs#L79).

`scoreLatency` reports pass at exactly 200 ms using `<=`. The current G11 rule requires `<200` ms, and the newer G11 artifact scorer enforces that strict boundary. The legacy helper therefore disagrees at the acceptance boundary. This does not change the currently failed release ledger.

**Fix:** align the predicate and tests with the declared rule; keep scope distinctions for microbenchmarks and full-flow results.

**Verification:** values below, equal to and above 200 ms must yield matching outcomes. **Reproduced:** `browser-probes.json:latencyBoundary`.

### A13, P2: the live G11 harness does not pair its fresh extension

**Location:** [g11-warden-option-c-harness.mjs:139](../../../scripts/g11-warden-option-c-harness.mjs#L139).

The planner probe signs requests, but the collector creates a fresh browser profile without setting the extension's `wardenPairing` value. Root extension startup now requires a saved pairing code. The collector sends `START_TASK` and discards its response, so a refusal can consume the polling deadline instead of producing a useful run. It also must arrange the declared fixture permissions rather than assume a fresh profile has them.

**Fix:** provision pairing through the supported settings flow, grant only the synthetic fixture access, check the start response, and bind each trace to its accepted run. Retain mandatory pairing and the immutable budget.

**Verification:** an empty-profile loaded-extension run must either collect authenticated clocks or fail immediately with the specific setup cause. **Source-confirmed; live collector not run in this audit.** Existing harness tests inject collection and do not establish that fresh-profile setup works.

### A14, P2: planner finish is promoted to task success without a postcondition

**Locations:** [background.js:874](../../../extension/background.js#L874), [background.js:1493](../../../extension/background.js#L1493).

A finish action sets `state.status = 'finished'` and a successful terminal trace after merely clearing the content vault. Local intent coherence can also replace a mismatched destructive plan with finish. There is no equivalent to the legacy synthetic task loop's observed completion oracle. A declined/no-op action or an off-task planner can thus lead to misleading completion wording.

**Fix:** distinguish planner termination from verified task completion. Require task-specific observable evidence where available; otherwise report completion as unverified and include the stopping reason.

**Verification:** wrong navigation, rejected writes and unsupported tasks followed by finish must not be shown as verified success. **Source-confirmed; do not interpret existing `finished` counts as independently verified task completion.**

### A15, P2: older raster scoring accepts inconsistent observation identity

**Locations:** [score-raster-benchmark.py:28](../../../scripts/score-raster-benchmark.py#L28), [score-raster-benchmark.py:44](../../../scripts/score-raster-benchmark.py#L44).

The dictionary silently overwrites duplicate row IDs. Successful latency statistics use every supplied `ok` row, including rows that need not belong to the frozen manifest. Validation is substantially weaker than the newer text scorer's identity, hash, geometry and numeric checks. Incorrect or duplicate observations can alter scores without a clear error.

**Fix:** reject duplicate/unknown observations and mismatched dataset/image identity; validate geometry, confidence and timings before scoring. Derive performance statistics from the same accepted population as coverage. Replace correctness-critical `assert` checks with explicit validation because `python -O` removes assertions.

**Verification:** duplicate, unknown, mismatched and non-finite rows must fail; missing/failed rows must remain accounted for. **Source-confirmed; historical evidence retained unchanged.**

### A16, P2: human-evaluation counts accept duplicate identities

**Locations:** [g20_summarize.py:18](../../../scripts/g20_summarize.py#L18), [g20_summarize.py:54](../../../scripts/g20_summarize.py#L54), [g20_summarize.py:68](../../../scripts/g20_summarize.py#L68).

The summarizer counts individually valid rows without enforcing unique participant/reviewer IDs or distinct participants. Five copies of one synthetic participant and three copies of one reviewer satisfy the row counts. ID validation only checks a prefix; dates are only tested for truthiness. This can overstate the human-evaluation bar.

**Fix:** validate identity format, unique sessions/persons as required by the protocol, dates and required fields, and reject duplicate rows. Keep Francis's explicit confirmation and real non-author evidence necessary for G20.

**Verification:** duplicate IDs/persons must not increase eligibility. **Reproduced:** `warden-probes.json:g20DuplicateIdentity`. These are clearly labelled synthetic fixtures; no participant ledger was written or participant session claimed.

## Additional source-backed improvements

| Area | Location | Improvement and reason |
|---|---|---|
| P2, stopped-run isolation | `extension/background.js:901,1531` | Recheck run ownership immediately after awaited strip/persistence calls and bind cleanup to the original run/tab. A stop/new run during either await can leave a stale prompt or cleanup acting on newer global state. Source-supported race candidate; a controlled delayed-response/storage reproduction is still needed. |
| P2, privacy retention | `warden/entities.py:278`, `extension/background.js:168,212` | The model LRU retains up to 4,096 raw text chunks without a TTL; transcript entries retain raw task and uncertain previews across runs. Set explicit retention/clear rules, bound sizes, and offer local forgetting. In-memory data still has a lifetime even when it is never persisted. |
| P2, fixed waits | `extension/utils/visualizer.js:79`, `extension/content.js:559`, `extension/background.js:35` | Cursor movement defaults to 380 ms and is awaited; clicks wait another 250 ms, and later steps add 400 ms settling. Make decorative animation non-blocking and use bounded observed settling. These waits alone frustrate a 200 ms full-flow budget. Measure the same full flow after changes, including inference and execution. |
| P2, portable setup | `extension/background.js:76` | The displayed startup command hardcodes an external macOS volume and a personal virtual environment. Use the documented portable setup and optional environment configuration. The model loader already handles the external-volume default conditionally. |
| P2, current-run evidence | `extension/sidepanel.js:958`, `extension/background.js:524,807` | Reset/bind `lastOutbound` to a run. After a new trace is cleared, Sent can fall back to the previous request. Distinguish a prepared/local POST from confirmed cloud dispatch; an egress refusal sends nothing to a model. |
| P2, product claims | `Website/index.html:33,68,72,73,116`, `extension/sidepanel.js:875` | Scope claims to the tested path. The root planner receives sanitized task/DOM/labels/history, including permitted free text and kept values, rather than placeholders alone. Root screenshots use masks without the legacy face detector. Absolute statements about names, faces and free text staying local exceed what these paths establish. |
| P2, benchmark integrity | `scripts/wave7-load-notes.mjs:18,124` | Acceptance compares elapsed time with configurable `SOAK_MS`, so a shortened run can still satisfy the predicate while the declared bar says five minutes. Count distinct session behavior and durable storage accurately; the current harness uses health workers and an in-memory audit array. Keep its diagnostic scope explicit. |
| P2, immutable evidence | `scripts/g11-warden-option-c-harness.mjs:73`, `scripts/e2e-v5/recording-relay.mjs:8`, wave scripts | Fixed filenames overwrite results. The relay clears body logs while appending to an existing timing file, allowing run mixing. Use unique run IDs, exclusive writes and commit/input hashes, as the newer text scorer already does. Never rewrite old evidence to appear current. |
| P3, HTTP resources | `warden/groq_client.py`, `warden/ollama_client.py`, `warden/fastpath.py` | Reuse bounded clients/connections instead of a new synchronous top-level `httpx.post` per call. Separate transient errors from non-retryable failures, cap retry time and measure connection/retry overhead. |
| P3, graphics lifecycle | `extension/utils/redactor.js:304` | Close decoded `ImageBitmap` objects in `finally`; the legacy popup already does so. Avoid retaining screenshot strings longer than the required local preview lifetime. Measure native graphics memory as well as JS heap. |
| P3, update cost | `extension/background.js:212`, `extension/sidepanel.js:233`, `extension/utils/pipeline-trace.js` | Whole-transcript broadcasts and repeated screenshot-bearing trace clones increase serialization work as a session grows. Bound the transcript and use revisioned entry updates or references, while preserving a reliable initial snapshot when reopening the panel. |
| P3, deprecated lifecycle | `warden/app.py:88` | Replace deprecated FastAPI `on_event` startup with a lifespan context and explicit worker shutdown. The current test run emits this deprecation warning. Test-client dependency compatibility also emits a warning; upgrade it as a coordinated change, not a blind dependency bump. |
| P3, policy duplication | tier rules, three token CSS copies, repeated wave scripts | Keep production tier rules and evaluators aligned; one evaluator still has its own approximate regexes. Existing JS/Python parity and token drift checks are useful. Factor shared harness mechanics while retaining historical adapters and original evidence. Do not call a library outdated merely because another framework is newer. |
| P3, dense source | `Prototype/app/*.mjs`, `scripts/score-raster-benchmark.py`, document generators | Many lines combine entire functions or control-flow branches. Format maintained source and extract coherent functions in separate reviewable PRs. This reduces review mistakes; bulk rewrites of historical snapshots do not help. |
| P3, scanner/CI scope | `scripts/wave3-security-scan.mjs`, `.github/workflows/*` | The five handcrafted secret patterns are not a complete secret scanner, and CI does not run the Python scorer suite. Add maintained scanning of tracked changes/history with narrow documented allowances, scorer tests, and PR checks with explicit scope. Pin action revisions if adopting a supply-chain policy. Do not print detected secret values. |

Ruff's `F,E9` scan found seven unused imports in `scripts/build_documents.py` and `scripts/build_pitch.py`, with no syntax or undefined-name errors. These are low-priority cleanup, not privacy fixes. CSS/rendering, accessibility, real model behavior, fresh-profile browser execution and the files marked `not_claimed` still need deeper manual review. No broad dependency or framework migration is justified by this audit alone.

## Validation collected

| Check | Result | Scope |
|---|---|---|
| `cd Prototype && npm run test:ci` | 141 passed; build succeeded | Prototype unit/integration tests with unavailable planner |
| `cd warden && python -m pytest -q -rs test_warden.py` | 159 passed, 6 skipped, 3 warnings | Real-model tests skipped: four local-review, two detector tests |
| `node --test extension/utils/loopback.test.mjs extension/tests/*.test.mjs` | 134 passed | Worker harness and real Chromium content fixtures; not a loaded extension/cloud run |
| G11 harness tests | 13 passed | Config/artifact/stub collection, not a qualifying timing run |
| `python -m unittest discover -s scripts/tests -p 'test_*.py'` | 19 passed | Text/raster scorer unit fixtures |
| Python AST, Node syntax, YAML/notebook parsing | No parse failures | Whole maintained source inventory; CSS line scan only |
| Tracked JSON parsing | 208 passed | Syntax only |
| `python -m ruff check warden scripts --select F,E9` | Seven F401 findings | Unused imports; no automated fixes applied |
| `python scripts/check_release.py --dry-run` | 14 pass / 1 fail / 5 unknown | `submission_ready: false`; ledger not written |

Environment: Node `v24.19.0`, Python `3.12.14`, test dependencies installed from the existing lock/requirements. CI uses Node 22, so these local results do not substitute for remote CI. Passing release evidence was 44 to 173 commits behind the audited base. This audit does not refresh those passes. G11 remains failed, G20 remains unknown and Jev remains disabled.

Reproduction commands (run each probe in a fresh process):

```bash
python Docs/audits/2026-10-03/probe-warden.py
node Docs/audits/2026-10-03/probe-browser.mjs
python Docs/audits/2026-10-03/inventory.py > /tmp/dhristi-source-inventory.json
```

The Python probe uses test-only in-process detector/transport stubs and a pairing-state override. The browser probe uses authored local Chromium fixtures and a stub legacy provider. Neither contacts a real model/provider, prints environment values, stores credentials nor writes to `Benchmarks/`. Saved observations are [warden-probes.json](warden-probes.json) and [browser-probes.json](browser-probes.json). Durations and random scan handles can vary.

## Suggested PR sequence

1. Apply and verify server-side master protection with owner credentials. Land the PR-only agent policy through review.
2. Fix A01/A02 with meaningful privacy regressions covering changing values, not just repeated identical input.
3. Fix A03/A04/A05 and the stop/new-run race with live-browser and delayed-worker tests.
4. Fix Warden request validation, bounded scheduling and local-review destination checks. Keep pairing and egress fail-closed.
5. Repair the fresh-profile G11 harness and completion semantics before collecting new release evidence. Retain the 200 ms gate and real postconditions.
6. Repair legacy/scoring defects, then improve retention, performance and maintainability where measurements justify the change.
7. Continue exhaustive manual review of the remaining inventory files. Each follow-up must name its reviewed files and new evidence; automated coverage must never be relabelled as manual coverage.

Each implementation change needs its own focused PR and updated checkpoints. This audit PR proposes findings and safeguards; it does not close the defects merely by documenting them.

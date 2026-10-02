# Laya as an optional plan reviewer

**Date:** 30 September 2026
**Authority:** Francis, 30 September 2026: fine-tune `convaiinnovations/laya` for Dhristi, as the plan-review check, multilingual checkpoint, trained in the session container (option B).
**Status:** Shipped opt-in (`WARDEN_REVIEWER=laya`), the default reviewer stays Ollama. On 30 September Francis approved three follow-ups, all shipped in the same PR: release of confirmations under the constraint (section "Release"), private weights on Hugging Face, and the `tiers.py` fix.
**Evidence:** `Benchmarks/results/laya-plan-review-v01.json`. Dataset: `Benchmarks/datasets/laya-plan-review-v01/`. Code: `warden/laya_review.py`, `scripts/laya/`.

## What Laya is

A typed-decision classifier (Apache 2.0, Convai Innovations). It takes a state and typed questions (`choice`, `score`, `noul`) and returns calibrated probabilities in one forward pass. It is not a text generator. We use the multilingual checkpoint (mmBERT-base, 322M), because the Hindi labels need it.

The model card says the base checkpoints are close to chance on real decisions until fine-tuned, and over-confident until calibrated. Our zero-shot run agrees (below). The repository is 12 days old and lists 0 downloads against 4,551 likes. We reproduced none of its published benchmarks. The weights are safetensors. The `laya` pip package (0.3.22) was installed in a scratch environment only, with Francis's approval, and was not audited line by line.

## What it answers

For each step `/validate` reviews:

| Question | Asked for | Options |
|---|---|---|
| `tier` | click | navigational / state-changing / destructive |
| `serves_task` | click, type | A: moves the task forward / B: does something the task did not ask for |

`serves_task` is a `choice` with neutral A/B keys rather than a `noul`. The card reports that `noul` answers can follow their false/true labels instead of the input.

The state holds the tokenized task, the action, the target's tokenized label and fieldType, and a type action's vault token. `build_state()` is shared by the Warden and the dataset generator, so the training states have the same shape as the run-time states.

## Contract

The reviewer follows the same rule as the Ollama review, and stub tests pin it:

- It can only turn `accept` into `ask`. It never produces `reject` and never lowers a tier.
- A destructive tier still asks, whatever Laya says.
- An off-task score is ignored for reversible steps.
- A missing model, a load failure, an exception or a non-finite probability each become a SKIPPED check.

## Measured (held-out synthetic test split, CPU)

Test wording is never seen in training, and four goals appear only in the test split. Each ask threshold was fixed at 0.5 before evaluation.

| Tier question (366 rows, 61 distinct controls) | Accuracy | Destructive recall | Destructive precision | Hindi accuracy |
|---|---|---|---|---|
| Warden regex `tiers.py` | 0.506 | 0.300 | 1.000 | 0.306 |
| Laya zero-shot | 0.465 | 0.725 | 0.470 | 0.463 |
| **Laya fine-tuned** | **0.921** | **0.983** | **0.992** | **0.944** |

| Serves-task question (341 rows, 41 tasks, 58 controls) | Accuracy | AUROC | Off-task caught | False-ask rate |
|---|---|---|---|---|
| Laya zero-shot | 0.484 | 0.571 | 0.307 | 0.214 |
| **Laya fine-tuned** | **0.868** | **0.927** | **0.930** | **0.246** |

- **Held-out goals:** tier accuracy 0.909, serves-task accuracy 0.851.
- **Misses:** 56 of 61 held-out controls are majority-correct. Four navigational controls were read as state-changing, which is the safe direction: it adds a confirmation. "Withdraw application" (destructive) was read as state-changing in 2 of 6 pairings. The extension still confirms that step, because state-changing is not unattended.
- **Latency:** one `predict()` with both questions takes p50 171 ms and p95 191 ms on a 4-thread Intel Xeon 2.1 GHz CPU. The Laya card's GPU figures were not measured here.
- **Training:** 3 epochs, 1,474 items, 30.6 minutes on the same CPU. The checkpoint's sha256 is recorded in the results file. The weights are not in Git.

## What the measurement changed

The plan was to add confirmations. The dataset showed that the live gate does not need more of them:

| Gate, test split | Destructive steps unattended | Navigational steps forced to confirm |
|---|---|---|
| Extension F17 (`extension/utils/op-tier.js`, the live loop) | 0 / 120 | **126 / 144** |
| Warden `tiers.py` (`/validate`, not in the v5 loop) | **42 / 120** | 56 / 144 |

- **Extension F17.** It runs a click unattended only when the English label starts with a navigation word. It misses nothing destructive here, but it asks on 88% of genuinely navigational clicks. So in the live loop, a reviewer that can only escalate changes almost nothing.
- **Release simulation (not shipped).** Laya releases a confirmation only when p(navigational) ≥ 0.9, a threshold fixed in advance. It would have released **97 of the 126** unnecessary confirmations and **0** state-changing or destructive steps. Zero-shot Laya at the same threshold released 5 destructive steps, including "Close account". A released step would therefore go through unattended, so this path needs the fine-tuned checkpoint and a decision.
- **Warden `tiers.py`.** It matches the navigation regex against label + fieldType, so a fieldType of `link` satisfies `\blink\b`. Any link without a destructive or submit keyword becomes navigational. This path is outside the v5 loop, so it is recorded in ROAST round 28 (numbered 22 before the merge) and not fixed here.

## Limits

- **The data is synthetic and author-written, and so are the gold labels.** One control per state, with no surrounding scene. These are not annotator-agreement labels and not real pages. The results are not a field estimate.
- **The regex baseline is unflattering by design.** The phrase bank deliberately includes wording outside the regex.
- **Hindi has not been reviewed by a native speaker.**
- **The sample is small and correlated.** Tier rows reuse each held-out control about 6 times.
- **The serves-task calibration temperature is high (7.1).** The model is over-confident on some calibration pairings. The false-ask rate of 0.246 would cost roughly one extra prompt in four on-task steps, if this reviewer acted on live runs.
- **Escalation only reaches `/validate`.** Since v5, the extension's run loop does not call `/validate`, so there Laya only adds questions for older harnesses. Release acts on live runs through `/plan` (section "Release").

## Not changed

- G11 stays fail, G14 unknown, G20 paused, and `submission_ready` false.
- F17 stays mandatory.
- No guardrail status moves on this evidence.

## Release (Francis, 30 September 2026: "Laya can skip confirmations given the constraint")

With `WARDEN_REVIEWER=laya`, the Warden attaches `review` scores to its `/plan` response. They are computed locally, after the planner has answered, on the same tokenized task and element label. Nothing new goes to the planner.

The extension decides whether to release, in `extension/utils/plan-check.js` `layaRelease`. It holds its own thresholds and releases a local `confirm` to unattended only when **all** of these hold:

| Condition | Why |
|---|---|
| The action is a click | typing always confirms |
| The scan tiered the target state-changing by the `unproven` default | no destructive or submit keyword in any descriptor (text, aria, title, value, href, form action), no form submit, no label/name mismatch (`op-tier.js` `classifyClickTargetBasis`) |
| The task does not express destructive intent | same regex as intent coherence |
| The review names `laya-dhristi-plan-review` with `fineTuned: true`, for this exact action and target | zero-shot released destructive steps in the simulation |
| p(navigational) ≥ 0.9, p(destructive) < 0.5, p(off task) < 0.5 | thresholds fixed before evaluation |

Anything missing, malformed or out of range means no release.

- **The tier does not change.** A released step still carries `state-changing`, so the execute-time live re-tier still applies.
- **The release is re-checked at execute time.** The content script also requires that the live element still reads `unproven`. A "Statements" link relabelled "Pay now" after the scan keeps its tier, so without this check it would have run. Now it stops and asks, and a real-Chromium test covers it.
- **Unchanged:** destructive always asks, a failed plan check still rejects, and every other `confirm` still confirms.

**Residual risk accepted with this decision** (narrowed the same day by pairing and the Hindi keywords, section "Follow-ups shipped"). The extension does not authenticate the Warden; any process on `127.0.0.1:8756` is trusted as it.

- Before this change, a spoofed or compromised Warden could propose plans, but it could not make a non-navigational click run unattended.
- Now it can release an `unproven` click by sending a confident review. That includes a destructive label the English keyword rules do not recognise, such as "खाता हटाएं".
- A model error has the same effect. The test split showed 0 wrong releases in 348 confirmations, but the sample is small, synthetic and correlated.
- Mitigations not done here:
  - Hindi (and other-language) destructive keywords in `op-tier.js`, which would move those labels out of `unproven`
  - a pairing secret between the extension and the Warden

Laya is also a second model on the device, an explicit exception to v5's "one model, one job".

- Real-checkpoint smoke run (same CPU): cold model load about 10.8 s on the first `/plan`, then about 200–260 ms per scored step.
- "सहायता केंद्र" (Help centre) during a pay-bill task scored p(navigational) 1.0 but p(off task) 0.97, so it was not released.

## Weights

Private Hugging Face repo `francisreubenr/dhristi-laya-plan-review`, revision `6d3e9c57bfbd438b94b69c3d20feeca6b7a5588d`. Its LFS sha256 matches `checkpoint.model_safetensors_sha256` in the results file. Load it with `WARDEN_LAYA_MODEL=francisreubenr/dhristi-laya-plan-review` and a token that can read it.

## `tiers.py` fix

The navigational rule now matches the label alone, as `op-tier.js` does. On the test split, destructive steps accepted as navigational went from 42/120 to 0/120 (`warden_regex_gate_after_fix` in the results file). The dataset's `regex_tier` column and the results file's `regex` block keep the pre-fix values, as generated at `2d7ad76`.

## Follow-ups shipped (Francis, 30 September 2026)

### Hindi destructive keywords

`extension/utils/op-tier.js` `HI_DESTRUCTIVE`, mirrored in `warden/tiers.py`, adds Devanagari and common transliterations of the English list. That covers हटा (delete or remove), मिटा (erase), डिलीट, रिमूव, निष्क्रिय (deactivate), नष्ट (destroy), unsubscribe, and terminating, closing or cancelling an account, subscription or session. It feeds both the click tier and the destructive-intent check, so these labels tier `destructive` and always ask.

- **Left out deliberately:** bare "रद्द करें" (Cancel) and bare "समाप्त" (also the usual Finish button), as bare "Cancel" is in English.
- **Text is canonicalised before matching:** NFC, with zero-width characters removed. A page cannot hide "हटाएं" behind an invisible joiner.

**Measured on the held-out test split** (`extension_gate_after_hindi_keywords` in the results file):

- Destructive steps the extension tiers `destructive`: 36 of 120 before, 60 of 120 after.
- Hindi destructive steps tiered `destructive`: 0 of 42 before, 24 of 42 after.

The remaining misses use verbs neither list has, in either language: forget (भूल जाएं), leave (छोड़ें), stop sharing (साझा करना बंद करें), discard, withdraw, purge, kick, end membership. Those stay `unproven`. They always confirm when unpaired, and can be released only by a verified fine-tuned review. Widening the list is left to Francis: tuning it to this test set would overfit the evaluation.

### Pairing secret

`warden/pairing.py`, `warden/app.py` middleware and `extension/utils/warden.js`. The secret is shared and never sent:

- Each request carries a fresh nonce and an HMAC-SHA256 request proof.
- Each response carries an HMAC over the nonce, path, status and exact response bytes.
- The Warden refuses unsigned, tampered or replayed POSTs.
- A paired extension refuses any unproven response. A refused `/health` stops the run before any page text is sent.
- `layaRelease` now also requires that the `/plan` response verified. Verification is tracked outside the response object, so a server cannot claim it with a JSON field.

Pairing is opt-in. With no `WARDEN_PAIRING_SECRET`, the Warden behaves as before, and an unpaired extension can never skip a confirmation. Setup: `python warden/pairing.py new`, put the value in `warden/.env`, and paste it into Settings > Pairing code.

**Evidence:**

- Warden pytest: unsigned, tampered, wrong-key and replayed POSTs are refused; responses are signed; a short secret fails closed.
- Extension suite against a fake Warden that signs like `pairing.py`:
  - a matched pair releases, and every request carries a valid proof with no code on the wire;
  - an unsigned or wrong-secret impostor is refused before any `/strip`;
  - an unpaired extension never releases;
  - a Warden that requires pairing refuses an unpaired extension.
- Cross-language check: the real `extension/utils/warden.js` against a real uvicorn Warden. `/health` verified, signed POSTs were accepted, a wrong code was refused, and an unsigned POST got 401.

**Residual risk, narrowed:**

- **Mid-run port takeover.** If an impostor takes the port mid-run after the real Warden answered `/health`, at most one `/strip` body reaches it before its unproven response stops the run.
- **Where the code lives.** The pairing code sits in the extension's `chrome.storage.local`.
- **Unpaired setups.** They remain as trusting as before, minus the release.

## Still open

1. A live run of the release and pairing on the loaded extension, real Warden and Laya. So far: unit, fake-Warden, real-Chromium content tests, a real-checkpoint smoke run and the cross-language pairing check.
2. Destructive verbs missing in both languages (forget, leave, stop sharing, discard, withdraw, purge, revoke), and Hindi submit keywords (भुगतान, भेजें, जमा). Hindi pay/send labels are still `unproven`, so a verified review could release one if Laya misjudged it.
3. Whether pairing should become mandatory rather than opt-in.

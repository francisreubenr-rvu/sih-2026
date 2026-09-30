# Laya as an optional plan reviewer

**Date:** 30 September 2026
**Authority:** Francis, 30 September 2026: fine-tune `convaiinnovations/laya` for Dhristi, as the plan-review check, multilingual checkpoint, trained in the session container (option B).
**Status:** Shipped as opt-in (`WARDEN_REVIEWER=laya`); the default reviewer stays Ollama. Two open questions need Francis (end of this file).
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
- **Warden `tiers.py`.** It matches the navigation regex against label + fieldType, so a fieldType of `link` satisfies `\blink\b`. Any link without a destructive or submit keyword becomes navigational. This path is outside the v5 loop, so it is recorded in ROAST round 22 and not fixed here.

## Limits

- **The data is synthetic and author-written, and so are the gold labels.** One control per state, with no surrounding scene. These are not annotator-agreement labels and not real pages. The results are not a field estimate.
- **The regex baseline is unflattering by design.** The phrase bank deliberately includes wording outside the regex.
- **Hindi has not been reviewed by a native speaker.**
- **The sample is small and correlated.** Tier rows reuse each held-out control about 6 times.
- **The serves-task calibration temperature is high (7.1).** The model is over-confident on some calibration pairings. The false-ask rate of 0.246 would cost roughly one extra prompt in four on-task steps, if this reviewer acted on live runs.
- **Laya does not act on live runs yet.** Since v5, the extension's run loop does not call `/validate`.

## Not changed

- G11 stays fail, G14 unknown, G20 paused, and `submission_ready` false.
- F17 stays mandatory.
- No guardrail status moves on this evidence.

## Open, needs Francis

1. **May Laya release a confirmation?** The live over-asking problem is only helped if the fine-tuned checkpoint may downgrade a confirm to unattended on p(navigational) ≥ 0.9, with the regex destructive rule and plan checks untouched. That weakens F17 as written today. It also conflicts with v5's "one model, one job" on the device.
2. **Where do the weights live?** They are in session scratch only. Proposed: a private Hugging Face repo under Francis's account. Nothing has been uploaded.

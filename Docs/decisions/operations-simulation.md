# Synthetic Earth-observation workflow — implementation and evidence

11 September 2026. A single integrated simulation now ties the verified components together: browser-local capture → conservative protected context → real Qwen planning → revision-checked local actions → expiring local value reference → explicit confirmation → fixture-verified completion.

## What was built

`/app/operations.html` hosts an original synthetic interface (`operations-fixture.html`): an observation desk with a pending basin-assessment report, a synthetic restricted-region map, a NASA public-domain reference portrait, and a local report-contact draft. Start resets the fixture and runs the bounded navigation loop with `review-pending` semantics; when the exact report postcondition is observed, the page binds a one-use email reference, asks `/api/v2/local-plans`, and waits for confirmation. Expiry, page change, stop and deadline all terminate without further authorization.

Design follows the existing validation surfaces with a quieter, editorial composition: a two-column workspace (local original next to protected reconstruction), a single primary action, and a full event trace with exact outgoing requests visible. The footer names Bhoonidhi's catalogue APIs as the comparison baseline and states that this simulation is not an ISRO portal, endorsement, validation of operational savings, or real workflow claim.

## Results

| Case | Result | Time |
|---|---|---|
| Full run | Completed; 2 navigation actions; protected request; confirmed local fill | 30.5 s including pauses between model plans |
| Binding expiry | Stopped at confirmation stage; no write; draft remains empty | 38.2 s from start |
| User stop during planning | Cancelled; no further actions | ~5 s |

The saved run record shows `fixture_exact_contact_match` completion. The serialized v1/v2 requests contain neither the operator's name (`Alex Example`) nor the contact value (`alex.operator@example.test`). The scoped page network capture recorded 25 requests with zero external origins, but it covers only page-context requests on the benchmark tab and is not a complete egress proof.

Timing detail from run 1: Qwen plans took 7,913 / 2,982 / 5,310 ms across three planning calls; local WASM capture/inference calls took 22.8 / 18 / 11 ms. This flow uses the conservative DOM path; the rejected OCR filter is not part of its outbound context. Full-flow timing remains far above the 200 ms guardrail and G11 stays failed.

## Two honest discrepancies

First, the read-only locator probe returned an empty `value` for the filled draft field even though the fixture equality oracle matched and the field was visibly populated. This matches the earlier local-reference probe conflict and is preserved as an unknown property-readback artifact rather than a passing direct check.

Second, UltraFace produced zero face detections on all three captures of this fixture, whose portrait is rendered at 80px. Earlier browser runs detected a face in the same public-domain image at 96px. Treat this as scale-sensitive behavior requiring face-scale evaluation before demos that rely on the detection signal.

## Scope limits

Synthetic fixture only. No arbitrary-site support, no native-extension integration, no held-out task distribution, and no human reviewers. The 200 ms core-flow guardrail remains failed. Evidence: `Benchmarks/results/operations-v01/` (three run records, requests, network capture, screenshots, 390px check).

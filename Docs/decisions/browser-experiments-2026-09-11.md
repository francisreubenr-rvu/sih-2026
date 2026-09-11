# Reference-informed experiments: browser checkpoint

11 September 2026. The updated supported browser connection successfully opened the original local preview URL. The prior navigation failure remains in the historical record. No native-extension installation or alternate-browser workaround was used.

## What changed

The Grok/Perplexity review produced three experiments. They now have actual in-app Chromium evidence, separately from their earlier unit/provider evidence. Complete records, source hashes, failed attempts and screenshots are in [the result directory](../../Benchmarks/results/browser-experiments-2026-09-11/summary.json).

| Experiment | Observation | Limit |
|---|---|---|
| OCR + compact PII model, original policy | 12/14 sensitive tokens identified, 2 address words left readable; 25/25 useful tokens retained | Three authored English development screens; failed privacy case |
| Revised local policy | 14/14 sensitive tokens withheld, 0 retained; 25/25 useful tokens retained | Same screens used for correction; not held-out accuracy |
| Pending → Review task | Two actions and observed local completion, 10,635.5 ms | One synthetic run after restoring the model service |
| Completed queue | One action and observed completion, 3,868.4 ms | One synthetic run |
| Next page | One action and observed completion, 3,440 ms | One synthetic run |
| Cancellation | Stopped during planning, 0 actions | One real-provider cancellation run |
| Local email reference | Expired binding blocked; fresh reference produced confirmed local draft fill | Synthetic email field only; not extension typing |

The first task attempt stopped with `planning_failed` and zero actions because the independent Qwen service on 11436 was no longer running. Restarted that service against existing model weights, leaving app-managed instances unchanged. The failure remains in the denominator and in `task-review-v1.json`. Cold/warm conditions were not controlled; these times are observations, not percentile benchmarks. Full-flow latency below 200 ms remains failed.

## Privacy correction

NER identified `42` in a synthetic address but missed the two following street words. The revised local policy keeps OCR line identity and conservatively withholds values following an exact English sensitive-field label with a colon. A following explicit public-field label terminates that rule. Labels on another OCR line do not spread the rule across lines. Model evidence and existing numeric/email patterns still apply.

This is a development heuristic with identifiable failure modes: missing/misread labels, incorrect OCR grouping, multiline addresses, non-English labels and unlabelled PII. Over-redaction is possible. Rule decisions are not reported as calibrated model confidence. Three new tests cover complete-value withholding, public-field/line boundaries and geometry ordering. The full suite passes 71 tests; build passes.

Revised OCR/NER processing took 200.6, 128.8 and 133.1 ms after 373.9 ms initialization. Earlier processing was 188.9, 120.4 and 132.9 ms after 463.2 ms initialization. Neither is full-task latency; cache state was not controlled. No p95 claim follows from three screens.

The preview remains local-only. Free OCR text, original pixels and arbitrary goals remain excluded from the planner schema. The new browser runs do not establish complete egress isolation or general privacy protection.

## Local reference evidence

Saved serialized requests contain the random reference and field geometry, but not the exact synthetic email. An expired binding disabled confirmation and left the draft empty. A fresh model proposal matched its field/reference pair. Confirmation produced both the fixture's exact-value equality success status and a visibly populated input; apply was disabled afterward.

A read-only browser property probe returned an empty string despite that visible state. The unsuccessful probe is preserved rather than counted as a passing direct readback. The conclusion relies on the visible input and fixture equality oracle. Prior server/SQLite absence checks are separate evidence; no new comprehensive browser network trace was captured.

## Visual and scope checks

Each experiment was checked at an actual 390 px document width with no document-level horizontal overflow. The first viewport attempt changed only the reference tab; its other entries were desktop checks and are not represented as mobile evidence. Per-tab checks corrected this. Browser screenshots are scaled and do not establish a human readability score or WCAG certification.

Native Chrome/Firefox extension execution, broader privacy/utility testing, client resource budgets, independent domain validation and human review remain open. Existing decks, website scores and recording retain their original scope. This checkpoint improves the engineering candidate; it does not establish submission readiness.

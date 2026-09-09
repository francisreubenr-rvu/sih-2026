# Benchmarks — definitions, not results

`definitions.json` and `definitions.csv` contain eleven measurable KPIs and their protocols. All values are currently `null` / blank because no verified SIH2171 prototype or independent participant study exists. Targets are self-imposed, not official SIH weights.

## Recording results

Create `results/<run-id>/` only when a test actually executes. Preserve metric ID, build/commit, timestamp, environment, tool version, sample count, raw samples/report path, computed value, status and limitations. Measurements apply only to that version and environment. Keep automated functionality, local performance, human usability, security review and deployed behavior as distinct evidence.

Count a test as passed only if its actual result meets the frozen acceptance criterion. Excluded or unrun tests do not count as successes. Do not redefine denominators after seeing the outcome. For small human samples, show counts alongside percentages and avoid population-wide inferences.

## Six requested quality measures

| Measure | What it answers | Current state |
|---|---|---|
| Functionality coverage | How much of the frozen acceptance scope actually works? | Unmeasured |
| Flow completion | Can independent users finish the tasks? | Unmeasured |
| Error recovery | Can the application recover correctly from injected faults? | Unmeasured |
| Information architecture clarity | Can people find the key evidence and actions quickly? | Unmeasured |
| Narrative coherence | Do independent reviewers follow the deck's evidence and logic? | Unmeasured |
| Judge persuasion probability | Is there calibrated evidence for a prediction? | Unavailable; remains null |

The separate **judge readiness proxy** is an anchored rubric score out of 100. It may guide rehearsal after reviewers score it. It is **not a percentage chance of persuasion, selection or winning**. No historical labeled judging dataset or calibration study is available; mapping a score of 85 to an 85% chance would fabricate precision. B07's intentionally null probability is excluded from numerical saturation; the other required measurements still need actual evidence.

## Example record shape

This example is a schema illustration, not a measurement:

```json
{
  "metric_id": "B08",
  "build_or_commit": null,
  "timestamp": null,
  "environment": null,
  "instrument_version": null,
  "sample_count": 0,
  "raw_samples_or_report_path": null,
  "computed_value": null,
  "status": "not_measured",
  "limitations": "No executed run"
}
```

## Human scoring discipline

Use non-author participants, neutral task prompts, a fixed time limit and no facilitator coaching. Record task successes and failures rather than impressions alone. For the slide and readiness rubrics: 0 = missing, 1 = contradictory, 2 = present but weak, 3 = clear, 4 = clear with evidence. Keep reviewer ratings individually and report disagreement. Human results are not supplied by the agent.

See `../Guardrails/README.md` for release rejection and iteration saturation rules. The missing problem identity blocks domain-specific acceptance scenarios, differentiator testing and an impact target.

# Sightline / SIH26171 engineering context

Address the user as Francis. Carry authorized work forward without repeated confirmation. Do not invent metrics, participants, citations, photos, capabilities, deployments or novelty claims. User instructions in the conversation take precedence over this project file.

Read `CONTEXT.md`, `PLAN.md` and open findings in `ROAST.md` before edits. Update checkpoints after fixes. Preserve historical research and preparation artifacts with their original scope; do not silently relabel old Lighthouse scores or slides as new evidence.

## Agent skills

### Issue tracker
Local checkpoints in PLAN.md and ROAST.md; feature issues may live in `.scratch/`. See `Docs/agents/issue-tracker.md`. GitHub is the source and publication remote; no external issue/comment notification is necessary for this build.

### Triage labels
Default five state names are local metadata, not a claim that GitHub labels have been created. See `Docs/agents/triage-labels.md`.

### Domain docs
Single context in CONTEXT.md; architectural decisions in `Docs/decisions/`. See `Docs/agents/domain.md`.

## Validation boundaries
- Unit tests, browser harness, native extension, real provider, dataset benchmarks and production deployment are distinct evidence gates.
- Keep raw screen data and credentials out of server requests, logs, fixtures, Git and screenshots meant for public sharing.
- Test only the synthetic fixture unless the user supplies an authorized target.
- Never weaken a failed guardrail to obtain a pass. Record evidence and iterate.

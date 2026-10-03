# Dhristi / SIH26171 engineering context

Address the user as Francis. Carry authorized work forward without repeated confirmation. Do not invent metrics, participants, citations, photos, capabilities, deployments or novelty claims. User instructions in the conversation take precedence over this project file.

Read `CONTEXT.md`, `PLAN.md` and open findings in `ROAST.md` before edits. Update checkpoints after fixes. Preserve historical research and preparation artifacts with their original scope; do not silently relabel old Lighthouse scores or slides as new evidence.

As of 2026-09-23 the primary path is the fundamentals restructure in `Docs/decisions/brain-fundamentals-restructure.md`, not further HUD wrap polish. `warden/` and root `extension/` are present from PR #31 and PR #32; do not invent a second copy. G11 stays fail and `submission_ready` stays false until a results file and an explicit Francis confirmation say otherwise. G20 was unpaused by Francis on 2026-10-02; its status stays unknown until `Benchmarks/results/human-evaluation.json` holds real sessions with non-author participants, and no participant may be invented.

Decision of 2026-10-03 (Francis): the final submission date is 2026-10-03, and the submission is a pitch PPTX and a YouTube demo video, not the prototype. This replaces the 2026-10-16 working deadline set on 2026-10-02. The gates still bound what the deck and video may claim: G11 fail and the unknown gates ship as an honest gap list.

Decisions of 2026-10-02 (Francis): The Jev fast path is disabled in code (`warden/fastpath.py` `JEV_ENABLED = False`) but kept; re-enabling it needs a new decision, not an environment variable. Installing packages and models this work needs is approved, provided nothing destructive happens in the container. Extension-Warden pairing is required (`warden/pairing.py`).

## UI rules (Francis, binding)
- No dark colours for backgrounds on any surface. Dark is for text and thin lines only.
- Every colour interaction must follow colour-theory principles. See `DESIGN.md`, "Binding UI rules" and "Colour theory used here".
- Follow `Docs/design/design-playbook.md` for every UI change (strategy → hierarchy → type → colour → verify); `DESIGN.md`, "Design playbook", records how it applies here. `scripts/check-signal-tokens.mjs` enforces the token side.

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

# v5: redaction on the device, planning in the cloud, decisions in the browser

**Date:** 29 September 2026
**Authority:** Francis, 29 September 2026. The idea he restated: Dhristi is a privacy-led autonomous browser tool. The local machine runs one model for one job, redaction, so that job can use a bigger model. Everything else can run online. The front end should show how the system works without leaning on backend work.
**Supersedes:** the PR #35 brief's lock "planner = local Ollama on 11434" and `PLAN.md`'s 23 September "Phase 1 planner default is Ollama". Ollama stays as the explicit offline mode (`WARDEN_PLANNER=ollama`). Contract: `Docs/specs/2026-09-29-dhristi-v5-local-redaction-cloud-planner.md`.

## What was wrong (found on master `4f9a583`, reproduced in this container)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| 1 | GLiNER saw only the start of the page | The whole serialized DOM (up to 30 KB) went to `predict_entities` in one call; the model window is 384. With the real model, "Welcome back Priya Raghunathan" and "Signed in as Arjun Mehta" each score person name 0.49 on their own line, and **both return nothing** inside a 41-line page | Names on any non-trivial page reached the planner in plaintext with no prompt |
| 2 | Element labels skipped the model | `/strip` returned `elements[].label` untouched; the extension re-redacted labels with its regex pass only, which has no name detection | Same leak, through the element list |
| 3 | Warden could not load off the author's Mac | `entities.load_model` forced `HF_HOME=/Volumes/1TB SSD/LM/hub` | Model load fails on any other machine |
| 4 | A backend hop per step that the browser already covered | `/validate` re-ran schema, selector, tier and intent checks the extension enforces itself (F17), plus an optional Ollama pass of up to 15 s | Latency and a second authority for the same decision |
| 5 | Screenshot captured and masked every step for nothing | Only OmniParser used it, and OmniParser is off by default | Wasted work; the masked capture was never shown |

## Decided

1. **Warden = local redaction + guarded relay.** `/strip` scores the page in chunks that fit the model window, tokenizes element labels with the same tokens as the page text, and gives a repeated value one token. `/plan` defaults to the cloud planner (Groq). Before any model is called, an egress guard runs the deterministic PII patterns over every string in the request and refuses with 422 on a hit, so a leak in an earlier layer stops at the machine boundary instead of reaching the cloud.
2. **The browser owns every decision about acting.** The run loop no longer calls `/validate`. Plan schema checks moved into `extension/utils/plan-check.js`. The F17 tier gate stays local, and destructive steps always ask a person. `/validate` remains in the Warden for older harnesses only.
3. **The front end shows the boundary.** The side panel has a live pipeline (Perceive → Redact on device → Plan in cloud → Check on device → Act) with measured times. It also shows the exact body that left the browser, the tokens kept on the device (a value appears only on an explicit reveal), the masked screenshot, and the check list. On the page itself, labelled boxes mark every value that was replaced before planning.

## Trade-offs accepted

- **Sanitized page text now reaches a third party.** That is the point of the design, and the reason the redaction layer had to be fixed first. The residual risk is a PII type that neither GLiNER nor the patterns detect. The egress guard catches only what the patterns recognise, so it is a backstop, not a guarantee.
- **The cloud key lives in `warden/.env` on the user's machine.** The browser never holds it.
- **Without a key, runs are refused.** The panel names both fixes: add `GROQ_API_KEY`, or start the Warden with `WARDEN_PLANNER=ollama`. They are not silently re-routed.

## Not changed

G11 stays fail, G14 unknown, G20 paused, and `submission_ready` false. No guardrail status moves on the strength of this change.

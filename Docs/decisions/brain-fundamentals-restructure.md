# Brain — Fundamentals restructure (halt wrap path; freeze Warden target)

**Date:** 2026-09-23  
**Branch:** `brain/fundamentals-warden-pivot`  
**Authority:** Francis, this session. Halt the master wrap-finish path. Target fundamentals are the Warden / v4 architecture recorded in `Docs/grokbot-briefing.md`.  
**This change:** docs only. No new `warden/` or root `extension/` code in this PR. Those trees are already on master from PR #31 and PR #32. No Pages redeploy. No ledger edits.

## Francis locks (2026-09-23)

Settled. Do not reopen these three without a new decision from Francis.

1. **Merge strategy = Option C.** `Prototype/` and the Website HUD stay the measurement and demo surface. Add a real `warden/` only when it is sourced from an existing tree. Do not invent stubs. Choose one shipping extension surface later. `Prototype/extension` is not the shipping Warden extension.
2. **Halt wrap.** Freeze HUD and Pages polish until Phase 0 docs and the ARCH land. This PR is the Phase 0 docs. ARCH is still outstanding, so polish stays frozen.
3. **Phase 1 planner default = Ollama local.** Planner origin is a setting. Ollama on loopback is the offline default. No cloud keys in the browser. Groq is optional host-env only, and is never described as offline.

## Already on master (PR #31 and PR #32)

The locks above are unchanged. Two of them have landed as code on master `ae20024`. This PR does not re-do that work and does not invent a second copy.

- **Option C landed** in PR #31 (`11cb4de`, `Docs/decisions/brain-option-c-warden-port.md`). Real `warden/` and root `extension/` were imported from the public archive `https://github.com/francisreubenr-rvu/sih26171-dhristi` branch `sightline-v2-foundation` at `2afd215d795d781f74c8a45468a86eedfa58253e`. Not stubs. `Prototype/`, `Website/`, the wrap HUD, and `Prototype/extension/` stayed. `Prototype/extension` is still not the shipping Warden extension. Root `extension/` is the candidate side panel. One shipping extension surface is still unchosen.
- **Ollama `/plan` default landed** in PR #32 (`ae20024`, `Docs/decisions/brain-warden-ollama-plan-harden.md`). `POST /plan` uses loopback Ollama unless `WARDEN_PLANNER=groq`. Ollama down does not call Groq. Install-time extension host permissions are loopback (`8756` and `7860`).
- **Halt wrap** still holds. HUD and Pages polish stay frozen. ARCH for that freeze is still outstanding.
- G11 stays **fail**. G20 stays **paused**. `submission_ready` stays **false**. None of #31, #32, or this PR flips those.

## Halt

As of 2026-09-23, wrap and polish are not the primary engineering path on master.

The shipping surface that exists today stays where it is:

- `Prototype/` (workspace, tests, native extension source under `Prototype/extension/`)
- `Website/`
- Japanese pixel HUD wrap from PR #29 (`a87c785`, decision `Docs/decisions/brain-wrap-harder-finish.md`)

Those files are historical shipping chrome and prototype code. They are not deleted. HUD and Pages polish stay frozen until Phase 0 docs and the ARCH land, per the locks above. This PR is the Phase 0 docs.

`Docs/grokbot-briefing.md` (commit `8b2298e`) is the handoff. Its Warden sections record `sightline-v2-foundation` at `2afd215`. That tree is now on master through the PR #31 import above. This decision does not copy it again.

## Target fundamentals (Warden / v4)

Target pipeline, taken from the briefing's description of `sightline-v2-foundation@2afd215` and present as the PR #31 import. This PR does not re-verify that code:

1. **PERCEIVE** — browser content script serialises the DOM and can capture the visible tab.
2. **STRIP** — Warden, same machine. Regex and GLiNER. Uncertain spans prompt before plan.
3. **PLAN** — Warden calls the configured open-weight provider. Only the sanitised scene leaves the machine.
4. **VALIDATE** — Warden, local. Deterministic checks, then optional local reasoning.
5. **EXECUTE** — browser. The extension re-computes the op tier locally and only then acts.

Binding constraints that travel with that target:

- The browser holds no cloud key. A key, when one exists, lives in `warden/.env` or equivalent local config, never in a tracked file and never in chat.
- The only outbound object is the protected scene: control roles from a closed taxonomy, geometry, opaque region kinds, and placeholder tokens. Raw screenshots, raw DOM text, raw task text, URLs, and field values do not cross the machine boundary.
- Client op-tier gate **F17** remains mandatory. The client computes reversible / navigational / state-changing / destructive from the scene it already holds. The server's tier is advisory. A Warden `accept` does not authorise a destructive click by itself. Unknown commands fail closed. Do not remove this gate.

Verified on this branch after rebase onto master `ae20024`: `warden/` is present and root `extension/` is present. The 91 / 52 split below is the briefing's recorded figure against `origin/master` at `a87c785`. It was not recomputed after #31 and #32.

## Divergence (master vs Warden line)

| Fact | Master after #31/#32 (`ae20024`) | Warden line (`sightline-v2-foundation@2afd215`, as recorded in `Docs/grokbot-briefing.md`) |
|---|---|---|
| `warden/` | Present via PR #31, imported from that commit. FastAPI on `127.0.0.1:8756`. Do not invent a second package. | Present on that commit. FastAPI on `127.0.0.1:8756`. |
| Root `extension/` | Present via PR #31. Candidate Warden side panel. `Prototype/extension/` remains measurement/demo and is not that side panel. One shipping surface is still unchosen. | Present on that commit. Side panel v0.4.0. The briefing says that folder is the only build to load on that line, and `Prototype/extension/` is labelled superseded there. |
| History split | Briefing, checked against `origin/master` at parent tip `a87c785` before `8b2298e`: **91** commits on `origin/master` not in `sightline-v2-foundation`, **52** commits on that local branch not in `origin/master`. That branch had no upstream. Not recomputed in this PR. | Same recorded split. |
| Release ledger | `Benchmarks/release-status.json` timestamp `2026-09-14T11:32:43Z`. Status **fail**. Counts **14 pass / 1 fail / 5 unknown**. `submission_ready` **false**. `saturation_achieved` false. Pixel wrap, explain video, and harder finish did not regenerate this file. The ledger is stale relative to 22 September chrome and stale relative to any Warden-line measurement. Do not hand-edit a status. | Briefing records an 11 September ledger on that line (3 pass, 1 fail, 17 unknown) that was not regenerated after the 13 September Warden work. Different file, different history. Do not copy a pass from one line onto the other. |
| `README.md` | Still describes engineering candidate v0.1, Qwen2.5 through Ollama, and **119** tests measured 15 September 2026. Older than Waves 1–7 and older than the 22 September wrap. Not the newest status. | Briefing says that line's root README and `PLAN.md` checkboxes were also behind the results files. |
| `PLAN.md` | Opens with this fundamentals section, then the Option C and Ollama checkpoints from #31/#32, then Wave 7. | Side-panel and v4 PII boxes were still unchecked on `2afd215` after the work landed. Trust results files on that commit, not those boxes. |
| Visual system | ARCH-002 HUD for Website and Prototype. Root `extension/pixel.css` is the imported side-panel chrome. See conflict below. | Pixel tokens in that line's `DESIGN.md` / `extension/pixel.css`, now in this tree as root `extension/pixel.css`. |

## Design conflict (recorded, not resolved)

Do not invent a third visual system. This PR does not restyle Website, popup, or app chrome.

**Shipping chrome on master** is ARCH-PIXEL-HUD-002 (`Docs/decisions/brain-arch-pixel-hud-002.md`, applied in `Docs/decisions/brain-wrap-harder-finish.md`):

- Palette tokens in root `DESIGN.md`: `--ink` `#101827`, `--navy` `#162b46`, `--paper` `#f3ead8`, `--mist` `#c7d5d2`, `--saffron` `#d88732`, `--trust` `#5c8b63`.
- Geometry: `--radius: 0` on HUD chrome, **8px nine-slice** `HudFrame`, **4px** fill inset, hard shadow `2px 2px 0`, rectangular `TrustBadge`, `SegmentMeter`.
- Brand Hybrid C (viewfinder bug / aperture lockup). DigiLocker names are color and rhythm tokens only.

**Warden-line tokens**, quoted from `Docs/grokbot-briefing.md` (measured on that branch 13 September 2026). The imported side panel carries them in root `extension/pixel.css`. This PR did not remeasure the hex values:

| Token | Hex | Meaning on that line |
|---|---|---|
| `--ground` | `#0B0B0F` | Page and panel ground |
| `--cream` | `#E8E9DE` | Structure, body text, borders |
| `--amber` | `#FCC34A` | A decision is waiting |
| `--red` | `#FF0000` | Personal data or destructive tier |
| `--red-deep` | `#B71A00` | Red at rest |
| `--blue` | `#142EFF` | A plan was accepted |
| `--blue-deep` | `#1F2181` | Blue at rest |

That line also uses an 8px filled/outlined cell motif and rejects a violet glow. Small-text substitutes `#F84643` and `#6979F2` are recorded there because pure red and pure blue fail body-text contrast.

Conflict: the two palettes do not share hex values or token names. Master HUD is paper/navy/saffron with zero-radius nine-slice frames. The Warden line is near-black ground, cream structure, amber/red/blue status. Root `DESIGN.md` on master still says stepped corners of 2–4px; ARCH-002 already overrides HUD chrome to radius 0. Neither document is the Warden palette.

Until Francis picks a side in a later decision, **ARCH-002 remains the chrome for Website and Prototype**. Root `extension/pixel.css` keeps the imported side-panel palette. Neither surface silently adopts the other hex set, and this PR does not invent a third visual system.

## Hard constraints (unchanged)

- **G11** stays **fail**. Ledger reason: planner-inclusive full-flow versus 200 ms; `core-latency.json` exists and the budget is not weakened. No pass until a results file meets the written bar.
- **G20** stays **paused** (22 September decision). The 14 September ledger still says `unknown` with zero non-author participants. This PR does not edit that status.
- **`submission_ready` stays false.** `saturation_achieved` stays false. Official rubric score stays null.
- No DigiLocker, MeitY, or partner theater. No fabricated metrics, participants, citations, photos, or deployments.
- SPOC nomination is Francis-only. Catalogue row and college SPOC PDF disagree on the close date. Do not pick a winner in docs.
- Do not weaken a failed guardrail to obtain a pass.
- Do not commit secrets, `.env`, or keys.

## Next engineering phases

Ordered. This PR does not perform them. Status is against master `ae20024`, not a new claim.

| Phase | Work | Status |
|---|---|---|
| A | Architecture merge design: how PERCEIVE→STRIP→PLAN→VALIDATE→EXECUTE sits on the master prototype without dropping F17, the protected-scene wire, or the ARCH-002 conflict note. | Partly recorded in `Docs/decisions/brain-option-c-warden-port.md`. F17 is imported source in `extension/background.js`. It is not newly wired to the Prototype server, and this PR adds no design. |
| B | Bring the Warden package and the root side panel from a real tree. Do not invent files. | Done on master by PR #31 from archive `2afd215`. Do not import them again. |
| Planner | Phase 1 `/plan` default is local Ollama. | Done on master by PR #32. |
| C | Reconcile `Prototype/extension/` (measurement/demo popup) with root `extension/` (Warden side panel). Keep both folders. Label which build loads. | Still open. |
| D | Re-measure PII v3 on the frozen corpus **if and when** strip exists, into a new results file. If F1 falls, report the fall. Do not edit the dataset to improve a score. | Not done. `Benchmarks/results/` only. v3/v4 figures in the briefing are that line's record, not a new measurement here. |
| E | Evidence gates only when real results files exist. Re-run `scripts/check_release.py` on the tree you have. Nonzero exit while a mandatory gate fails is correct. | Not done. No hand-edited pass. |

## Non-goals for this PR

- No edits to `warden/` code, tests, or `.env`. Those files are already on master from PR #31 and PR #32.
- No edits to root `extension/` code. That tree is already on master from the same PRs.
- No Pages redeploy and no `Website/**` change (Pages deploys when `Website/**` or the workflow file changes on `master`).
- No `submission_ready` flip.
- No edits to G11, G14, G03, or G20 status in `Benchmarks/release-status.json`.
- No rewrite of `Benchmarks/results/` history.
- No deletion of `Prototype/` or other historical artifacts.
- No claim that Prototype tests were run for this change.

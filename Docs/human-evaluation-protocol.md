# Human evaluation protocol (G20), v5 side panel

**Status:** recruitment **resumed** (Francis, 2026-10-02) after a pause from 2026-09-15. **Zero** non-author sessions are recorded. G20 stays `unknown` until `Benchmarks/results/human-evaluation.json` holds real, anonymized sessions that meet the bar below. Never invent a participant, a score or a quote.

**Window:** sessions 5 to 10 October 2026, logging by 11 October, so the result can enter the ledger before the 16 October working deadline.

**Correction, 3 October 2026:** the submission is today (pitch PPTX and YouTube video), so no G20 session can be cited in it. The protocol stays for any later round.

**Guardrail G20:** at least **5** representative **non-author** participants perform the frozen tasks, and at least **3** **non-author** reviewers score the narrative with the anchored rubric. Below that, the status stays `unknown`, with no claim of benchmark saturation.

**Forms:** `Docs/human-evaluation-forms.md`. **Log:** `Benchmarks/results/human-evaluation.json`. **Check:** `python3 scripts/g20_summarize.py` reports whether the logged sessions meet the bar. It never edits the ledger; moving G20 needs Francis's confirmation.

The 15 September version of this protocol tested the older Prototype popup (toolbar capture, protect, trust chip). It is in git history (`git log -- Docs/human-evaluation-protocol.md`). The product people would use is now the root `extension/` side panel with the Warden, so the tasks below test that.

---

## Who

- **Participants (P1, P2, …):** people who did not write Dhristi code, claims or copy. Classmates and lab peers are fine if they did not build it. Team members never count. Their practice runs go under `team_rehearsal`.
- **Narrative reviewers (R1, R2, …):** non-authors who read the README and the public site and score how honestly the privacy boundary and its limits are explained. A reviewer can also be a participant.
- Names stay in the facilitator's private notes. Only `P#` and `R#` reach git.

## Setup (facilitator, about 10 minutes before each session)

1. Start the Warden with GLiNER loaded and pairing set (`warden/README.md`, "Pairing with the extension"). Planner: the default Groq chain.
2. Load the unpacked root `extension/` in Chrome and open the side panel.
3. Serve the two synthetic pages from `scripts/e2e-v5/`, one at a time: `fixture.html` (profile) and `fixture-statements.html` (bank). All names, emails and numbers on them are invented.
4. Write the pairing code on a card. Never paste it into any shared document.

## Frozen tasks (synthetic pages only)

The facilitator reads each task aloud, then stays silent unless asked. For each task, mark **unaided**, **with help** or **fail**, and the time taken.

| # | Task said to the participant | What it tests | Success means |
|---|---|---|---|
| T1 | "Connect the extension to the local service using this code." | Pairing in Settings | Pairing code saved; the panel says the Warden proved it |
| T2 | On the profile page: "Ask it to update the contact email to the address on this card, and save." | The full loop with prompts | Email saved; each confirmation answered on purpose |
| T3 | When the uncertain-data card appears: "Decide what to do with each item." | Strip/keep decisions | The person's name is stripped; the participant can say why |
| T4 | "Open the panel's Sent view. Did the email address leave this computer?" | Reading the boundary | Correct answer: no, only a token did |
| T5 | On the bank page: "Ask it to open the account statements." | A step that runs without asking | Statements open; the participant notices it did not ask |
| T6 | Back on the profile page: "Now ask it to delete the account." | A destructive step | The participant sees the question and stops or skips |

T6 uses the profile page's English "Delete account" button. In the 2 October rehearsal run (`e2e-v5-boundary-v04.json`, C1), the planner did not find the bank page's Hindi delete link: it clicked "Account statements" and stopped. GLiNER may also flag "account" in the task as a possible account number (35% in that run). A participant who keeps it is making a reasonable choice; note what they decide.

After the tasks, ask the two comprehension questions on the sheet and the four Likert items.

## Anchored rubric (narrative reviewers)

| Score | Meaning |
|---:|---|
| 1 | Confusing; the privacy boundary is unclear |
| 2 | Partly understood; major doubts |
| 3 | Adequate with help |
| 4 | Clear boundary; minor issues |
| 5 | Clear, trustworthy, would demo as it stands |

Reviewers also note any overclaim. The honest limits to look for:
- G11 fails (the 200 ms budget);
- the evidence is synthetic fixtures only;
- GLiNER sometimes flags ordinary labels;
- Laya's numbers come from author-written data.

## Data handling

- Anonymized IDs only. Never store real personal data, credentials or real screens in the repo.
- Append sessions to `human-evaluation.json` only after they happen, using the shapes in the forms.
- `team_rehearsal.sessions` is for team practice and never counts.

## Explicit non-goals

- No invented participants, scores, quotes or timings.
- No G20 or G11 flip from this document, and no `submission_ready: true`.
- Authors and primary copywriters never count.

# Human evaluation forms (G20), v5 side panel

Print or copy one participant sheet per session. Protocol: `Docs/human-evaluation-protocol.md`. The 15 September forms (Prototype popup) are in git history.

## Session header (facilitator)

- Session ID: `S__`, date (UTC):
- Participant ID: `P__` (never a name)
- Non-author confirmed (did not write Dhristi code, claims or copy): yes / no. If no, log the session under `team_rehearsal` only.
- Mode: in person / remote with the facilitator driving
- Extension commit, Warden commit:

## Participant task sheet

| Task | Result (unaided / with help / fail) | Time (mm:ss) | Notes (behaviour, not opinions) |
|---|---|---|---|
| T1 pair the extension | | | |
| T2 profile email update | | | |
| T3 uncertain-data decisions | | | |
| T4 Sent view: did the email leave? | | | |
| T5 open statements (no prompt) | | | |
| T6 delete account (prompt) | | | |

## Comprehension (record the answer verbatim, then mark correct / incorrect)

1. "Which parts of your data left this computer during the email task?" Correct means it names tokens or placeholders, not the email itself.
2. "Why did it ask you before some steps and not others?" Correct means it connects asking with the risk of the step.

## Likert (1 = strongly disagree, 5 = strongly agree)

| Item | Score |
|---|---|
| I could tell what stayed on my computer and what left it | |
| When it asked me to confirm, the question made sense | |
| It asked me too often (higher = more burden) | |
| It was honest about what it cannot do | |

Free text: the one moment that confused you most.

## Narrative reviewer sheet (at least 3 non-authors)

- Reviewer ID: `R__`, date (UTC):
- Read: README at commit `____`, public site at revision `____`
- Rubric score (1 to 5, anchors in the protocol):
- Strengths:
- Overclaims or risks:
- Would you demo it as it stands? yes / no

## Logging

Append one object per real session to `Benchmarks/results/human-evaluation.json`, in the shapes given by `participant_entry_template_v5` and `narrative_reviewer_entry_template`. Then run `python3 scripts/g20_summarize.py`.

## Invite (copy and edit; send from your own account, never commit names)

> Subject: 25 minutes to try a student privacy prototype (synthetic data only)
>
> Hi ____, I'm Francis from RV University. Our Smart India Hackathon prototype, Dhristi, is a browser assistant that strips personal data on your computer before anything goes to the cloud planner. I need feedback from people who did not build it. You would try six short tasks on made-up web pages (no real accounts or personal data) and answer a few questions, about 25 minutes, in person or on a call where I drive the browser. Would a slot between 5 and 10 October work for you?
>
> Separately, would you be willing to spend 15 minutes reading our README and website and scoring how clearly they explain the privacy limits? That can be done in your own time.

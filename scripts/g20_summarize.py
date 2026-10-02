"""Check Benchmarks/results/human-evaluation.json against the G20 bar.

G20: at least 5 non-author participants who performed the frozen tasks, and at least 3
non-author narrative reviewers with a rubric score. This prints what is logged and whether the
bar is met. It never edits the guardrail ledger: moving G20 needs Francis's confirmation.

    python3 scripts/g20_summarize.py
"""

import json
import sys
from pathlib import Path

LOG = Path(__file__).resolve().parents[1] / "Benchmarks" / "results" / "human-evaluation.json"
TASKS = ["T1_pair", "T2_profile_email", "T3_uncertain_decisions", "T4_sent_view", "T5_statements_no_prompt", "T6_delete_prompt"]


def problems_with_participant(p: dict) -> list:
    out = []
    if not str(p.get("id", "")).startswith("P"):
        out.append("id must be P<n>")
    if p.get("non_author") is not True:
        out.append("non_author must be true (team sessions go under team_rehearsal)")
    if not p.get("date_utc"):
        out.append("date_utc missing")
    tasks = p.get("tasks") or {}
    for t in TASKS:
        result = (tasks.get(t) or {}).get("result")
        if result not in ("unaided", "with_help", "fail"):
            out.append(f"{t}: result must be unaided, with_help or fail")
    return out


def problems_with_reviewer(r: dict) -> list:
    out = []
    if not str(r.get("id", "")).startswith("R"):
        out.append("id must be R<n>")
    if r.get("rubric_score") not in (1, 2, 3, 4, 5):
        out.append("rubric_score must be 1 to 5")
    if not r.get("date_utc"):
        out.append("date_utc missing")
    return out


def main() -> int:
    log = json.loads(LOG.read_text(encoding="utf-8"))
    participants = log.get("participants") or []
    reviewers = log.get("narrative_reviewers") or []
    valid_p, valid_r = [], []
    for p in participants:
        issues = problems_with_participant(p)
        print(f"{p.get('id', '?')}: {'ok' if not issues else '; '.join(issues)}")
        if not issues:
            valid_p.append(p)
    for r in reviewers:
        issues = problems_with_reviewer(r)
        print(f"{r.get('id', '?')}: {'ok' if not issues else '; '.join(issues)}")
        if not issues:
            valid_r.append(r)

    need_p = log.get("acceptance", {}).get("required_participants", 5)
    need_r = log.get("acceptance", {}).get("required_narrative_reviewers", 3)
    print(f"participants: {len(valid_p)}/{need_p} valid; narrative reviewers: {len(valid_r)}/{need_r} valid")
    if valid_p:
        for t in TASKS:
            counts = {k: sum((p["tasks"][t]["result"] == k) for p in valid_p) for k in ("unaided", "with_help", "fail")}
            print(f"  {t}: {counts}")
    met = len(valid_p) >= need_p and len(valid_r) >= need_r
    print("G20 bar met: yes (the ledger still needs Francis's confirmation)" if met else "G20 bar met: no; status stays unknown")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Assemble Benchmarks/results/e2e-v5-boundary-v04.json from one e2e-v5 session.

Inputs (all produced by the run, outside the repo):
  --runs DIR        one sub-directory per run, each holding run.mjs's summary.json
  --cloud FILE      the recording relay's log: every body that reached the cloud planner
  --negative FILE   optional JSON written by hand from the wrong-pairing-code check

Personal values are counted by searching the relay log for the fixtures' synthetic values. The
values are synthetic; the count, never the matches, goes into the results file.

    python3 scripts/e2e-v5/compose_v04.py --runs <dir> --cloud <file> [--negative <file>] --out <json>
"""

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The synthetic personal values on fixture.html and fixture-statements.html.
SYNTHETIC_VALUES = {
    "fixture.html": ["priya.r@example.com", "Priya", "Raghunathan", "98765", "43210"],
    "fixture-statements.html": ["Arjun", "Mehta", "arjun.m@example.com", "91234", "56780"],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True)
    ap.add_argument("--cloud", required=True)
    ap.add_argument("--negative")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    cloud_lines = Path(args.cloud).read_text(encoding="utf-8").splitlines()
    cloud_text = "\n".join(cloud_lines).lower()
    timing_path = Path(args.cloud + ".timing")
    timings = [json.loads(l) for l in timing_path.read_text().splitlines()] if timing_path.exists() else []

    runs = []
    for summary in sorted(Path(args.runs).glob("*/summary.json")):
        s = json.loads(summary.read_text(encoding="utf-8"))
        runs.append({
            "run": summary.parent.name,
            "fixture": s["fixture"],
            "task": s["task"],
            "finished": s["finished"],
            "final_status": s["finalStatus"],
            "prompts": s["prompts"],
            "released": s["released"],
            "released_notes": s["releasedNotes"],
            "uncertain_decisions": s.get("uncertainDecisions", []),
            "duration_ms": s["durationMs"],
            "errors": s["errors"],
            "steps": [t for t in s["transcript"] if t.startswith(("PLAN ", "CHECK ", "EXECUTE ", "Laya released"))],
        })

    values = sorted({v for vs in SYNTHETIC_VALUES.values() for v in vs})
    personal_hits = {v: cloud_text.count(v.lower()) for v in values}
    ms = sorted(t["ms"] for t in timings if t.get("status") == 200)

    result = {
        "schema": "e2e-v5-boundary-v04",
        "measured": True,
        "evidence_scope": "synthetic fixtures only (scripts/e2e-v5/fixture*.html); one container; real Warden, real Groq",
        "commit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
        "stack": {
            "extension": "root extension/ loaded unpacked in Chromium (harness adds <all_urls> host permission only)",
            "warden": "warden/ with urchade/gliner_multi_pii-v1 loaded, pairing required",
            "pairing": "required; code entered through Settings > Pairing code",
            "reviewer": "WARDEN_REVIEWER=laya, WARDEN_LAYA_MODEL=francisreubenr/dhristi-laya-plan-review (private Hub)",
            "planner": "Groq chain, first model qwen/qwen3.8-27b, via the loopback recording relay",
            "fast_path": "off (Jev disabled in code)",
        },
        "cloud": {
            "requests": len(cloud_lines),
            "personal_values_found": sum(personal_hits.values()),
            "per_value_counts": personal_hits,
            "planner_round_trip_ms": {"n": len(ms), "min": ms[0] if ms else None, "median": ms[len(ms) // 2] if ms else None,
                                      "max": ms[-1] if ms else None},
        },
        "runs": runs,
        "negative_checks": json.loads(Path(args.negative).read_text()) if args.negative else None,
        "limits": [
            "Synthetic fixtures only; a handful of runs; not a field estimate.",
            "Prompts are answered by the harness (proceed, or strip except previews in E2E_KEEP), not by a person.",
            "The harness adds <all_urls> host permission in place of the optional grant a click gives.",
        ],
        "guardrails_changed": [],
    }
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("cloud",)}, indent=1))
    for r in runs:
        print(r["run"], r["fixture"], r["finished"], "prompts", r["prompts"], "released", r["released"], r["final_status"])


if __name__ == "__main__":
    main()

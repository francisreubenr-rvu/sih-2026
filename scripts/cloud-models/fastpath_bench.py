"""Accuracy and latency of the decision-model fast path (warden/fastpath.py), with the real LLM
chain as the fallback it defers to.

For every case it records the backend's raw answer (choice, its probability, the free-text
probability), so the confidence threshold can be swept afterwards without new calls, and the LLM
chain's answer on the same case. Keys come from the environment and are never written.

    python scripts/cloud-models/fastpath_bench.py --backends jev,laya --reps 3 \
        --out Benchmarks/results/fastpath-bench-v01.json
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fastpath  # noqa: E402
import groq_client  # noqa: E402
from bench import _scrub, is_correct, pct, plan_key  # noqa: E402
from cases import PLAN_CASES  # noqa: E402
from cases_heldout import HELDOUT  # noqa: E402

THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]


def body_of(case):
    return {k: case[k] for k in ("tokenizedTask", "sanitizedDom", "elements", "history")}


def raw_decision(backend, case):
    """The backend's answer with no threshold applied."""
    os.environ["WARDEN_FAST_PATH_MIN_CONFIDENCE"] = "0"
    rec = fastpath.decide(body_of(case), backend)
    return {k: rec.get(k) for k in ("choice", "confidence", "freeTextProbability", "latencyMs", "model")}


def used_at(row, t):
    return (row.get("choice") not in (None, fastpath.ESCAPE)
            and not (isinstance(row.get("freeTextProbability"), (int, float)) and row["freeTextProbability"] >= 0.5)
            and isinstance(row.get("confidence"), (int, float)) and row["confidence"] >= t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backends", default="jev,laya")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--llm-reps", type=int, default=1)
    ap.add_argument("--sleep", type=float, default=2.5)
    ap.add_argument("--out", default=None)
    ap.add_argument("--llm-from", default=None, help="reuse the LLM rows of an earlier results file instead of calling Groq")
    ap.add_argument("--laya-model", default=None, help="local Laya checkpoint dir (sets WARDEN_FAST_PATH_LAYA_MODEL)")
    args = ap.parse_args()
    if args.laya_model:
        os.environ["WARDEN_FAST_PATH_LAYA_MODEL"] = args.laya_model

    sets = [("design", c) for c in PLAN_CASES] + [("heldout", c) for c in HELDOUT]
    doc = {"backends": {}, "llm": {}}

    # LLM fallback: the Warden's real Groq chain on each case, or the rows of an earlier run.
    if args.llm_from:
        doc["llm"] = json.load(open(args.llm_from))["llm"]
        doc["llm_from"] = args.llm_from
    for split, c in ([] if args.llm_from else sets):
        rows = []
        for _ in range(args.llm_reps):
            t0 = time.monotonic()
            try:
                r = groq_client.plan_via_groq(body_of(c))
                key = plan_key(r["plan"])
                rows.append({"ms": round((time.monotonic() - t0) * 1000, 1), "key": key, "model": r["model"],
                             "switched": r["switched"], "correct": is_correct(key, c["accept"])})
            except Exception as exc:  # noqa: BLE001
                rows.append({"ms": round((time.monotonic() - t0) * 1000, 1), "error": _scrub(str(exc))[:160], "correct": False})
            time.sleep(args.sleep)
        doc["llm"][c["id"]] = rows
        print("llm", c["id"], [r.get("key") or r.get("error", "")[:40] for r in rows], flush=True)

    for backend in args.backends.split(","):
        if backend == "laya":
            fastpath.warm()
        per_case = {}
        for split, c in sets:
            rows = []
            for _ in range(args.reps):
                try:
                    r = raw_decision(backend, c)
                    r["correct"] = bool(r["choice"]) and is_correct(r["choice"], c["accept"])
                except Exception as exc:  # noqa: BLE001
                    r = {"error": _scrub(str(exc))[:160], "correct": False}
                rows.append(r)
                if backend == "jev":
                    time.sleep(0.2)
            per_case[c["id"]] = {"split": split, "needs_llm": bool(c.get("needs_llm")), "rows": rows}
            print(backend, c["id"], [(r.get("choice"), round(r.get("confidence") or 0, 2), round(r.get("freeTextProbability") or 0, 2)) for r in rows[:1]], flush=True)
        name = f"laya:{os.path.basename(args.laya_model.rstrip('/'))}" if backend == "laya" and args.laya_model else backend
        doc["backends"][name] = {"cases": per_case, "summary": summarize(per_case, doc["llm"])}
        print(name, json.dumps(doc["backends"][name]["summary"]["heldout"]["0.9"]), flush=True)

    doc = {
        "id": Path(args.out).stem if args.out else "fastpath-bench",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "harness": "scripts/cloud-models/fastpath_bench.py",
        "scope": ("Synthetic, already-tokenized scenes. 'design' = scripts/cloud-models/cases.py (the cases the fast path "
                  "was designed against); 'heldout' = scripts/cloud-models/cases_heldout.py (written afterwards, not used "
                  "to tune it). Jev is TypeSafe's cloud API; Laya ran on this container's CPU (4 cores, no GPU). Latency "
                  "is wall-clock from a cloud container (location not verified) and is not the G11 full flow."),
        "llm_chain": list(__import__("config").GROQ_MODEL_CHAIN),
        "reps": args.reps, "llm_reps": args.llm_reps,
        **doc,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(doc, indent=1) + "\n")
        print("wrote", args.out)


def summarize(per_case, llm):
    out = {}
    for split in ("design", "heldout", "all"):
        ids = [cid for cid, v in per_case.items() if split == "all" or v["split"] == split]
        rows = [(cid, r) for cid in ids for r in per_case[cid]["rows"] if "error" not in r]
        errors = sum(1 for cid in ids for r in per_case[cid]["rows"] if "error" in r)
        lat = [r["latencyMs"] for _, r in rows]
        by_t = {}
        for t in THRESHOLDS:
            used = [(cid, r) for cid, r in rows if used_at(r, t)]
            wrong = [(cid, r) for cid, r in used if not r["correct"]]
            llm_ok = {cid: (sum(x["correct"] for x in llm[cid]) / len(llm[cid])) if llm.get(cid) else 0.0 for cid in ids}
            hybrid = [(r["correct"] if used_at(r, t) else llm_ok[cid]) for cid, r in rows]
            by_t[str(t)] = {
                "decisions": len(rows),
                "fast_path_used": len(used),
                "coverage": round(len(used) / len(rows), 3) if rows else None,
                "fast_path_correct": len(used) - len(wrong),
                "fast_path_precision": round((len(used) - len(wrong)) / len(used), 3) if used else None,
                "wrong_when_used": sorted({cid for cid, _ in wrong}),
                "wrong_on_needs_llm": sorted({cid for cid, _ in wrong if per_case[cid]["needs_llm"]}),
                "hybrid_accuracy": round(sum(hybrid) / len(hybrid), 3) if hybrid else None,
                "llm_only_accuracy": round(sum(llm_ok[cid] for cid, _ in rows) / len(rows), 3) if rows else None,
            }
        out[split] = {"errors": errors, "raw_top_choice_accuracy": round(sum(r["correct"] for _, r in rows) / len(rows), 3) if rows else None,
                      "p50_ms": pct(lat, 0.5), "p95_ms": pct(lat, 0.95), **by_t}
    return out


if __name__ == "__main__":
    main()

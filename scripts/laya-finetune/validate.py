"""Score a Laya checkpoint on generated validation steps through the Warden's own decision path, so
checkpoints can be compared without touching the benchmark cases.

Each step goes through warden/fastpath.decide (laya.Agent, compact keys, the threshold and
free-text gate the Warden applies) with the threshold at 0, so every threshold is computed from
one pass. Steps whose page, task and history also appear in TRAIN are dropped first, so the score
is on steps the model has not seen. They still come from the same generator, so this measures fit
and calibration on the training distribution; the held-out benchmark
(scripts/cloud-models/fastpath_bench.py) is what measures wording the model has not seen.

    WARDEN_LAYA_DEVICE=cuda python scripts/laya-finetune/validate.py <checkpoint_dir> <val.jsonl> \
        --train <train.jsonl> --out <checkpoint_dir>/validation.json

A checkpoint passes when, at the Warden's 0.9, it acts on at least one step, is wrong on none, and
acts on no step that needs free text: the bar Jev met on the held-out benchmark.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))

import fastpath  # noqa: E402

THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]
GATE = 0.9


def body_key(body):
    return json.dumps(body, sort_keys=True)


def auroc(pos, neg):
    """P(a free-text step scores above a token-only step); ties count half."""
    if not pos or not neg:
        return None
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return round(wins / (len(pos) * len(neg)), 4)


def acts(row, t):
    return (row["choice"] not in (None, fastpath.ESCAPE)
            and not (isinstance(row["free_p"], (int, float)) and row["free_p"] >= 0.5)
            and isinstance(row["confidence"], (int, float)) and row["confidence"] >= t)


def by_family(rows):
    """Steps, acted, wrong and free-text steps acted on at the Warden's threshold, per generator family
    (v5 data; v4 rows have no family)."""
    out = {}
    for r in rows:
        f = out.setdefault(r.get("family") or "unknown", {"steps": 0, "acted": 0, "wrong": 0, "acted_on_free_text": 0})
        f["steps"] += 1
        if acts(r, GATE):
            f["acted"] += 1
            f["wrong"] += not r["correct"]
            f["acted_on_free_text"] += r["free_text"]
    return out


def summarize(rows):
    by_t = {}
    for t in THRESHOLDS:
        acted = [r for r in rows if acts(r, t)]
        wrong = [r for r in acted if not r["correct"]]
        by_t[str(t)] = {
            "acted": len(acted),
            "wrong": len(wrong),
            "acted_on_free_text": sum(r["free_text"] for r in acted),
            "precision": round(1 - len(wrong) / len(acted), 4) if acted else None,
            "coverage": round(len(acted) / len(rows), 4) if rows else None,
        }
    free = [r["free_p"] for r in rows if r["free_text"] and isinstance(r["free_p"], (int, float))]
    tok = [r["free_p"] for r in rows if not r["free_text"] and isinstance(r["free_p"], (int, float))]
    g = by_t[str(GATE)]
    return {
        "steps": len(rows),
        "free_text_steps": sum(r["free_text"] for r in rows),
        "top_choice_right": sum(r["correct"] for r in rows),
        "free_text": {
            "auroc": auroc(free, tok),
            "mean_p_on_free_text_steps": round(sum(free) / len(free), 4) if free else None,
            "mean_p_on_token_steps": round(sum(tok) / len(tok), 4) if tok else None,
            "token_steps_gated_at_0.5": sum(p >= 0.5 for p in tok),
            "free_text_steps_missed_at_0.5": sum(p < 0.5 for p in free),
        },
        "by_threshold": by_t,
        "passes_at_0.9": g["acted"] > 0 and g["wrong"] == 0 and g["acted_on_free_text"] == 0,
        "by_family_at_0.9": by_family(rows),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("val")
    ap.add_argument("--train", default=None, help="drop validation steps whose body also appears here")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    os.environ["WARDEN_FAST_PATH"] = "laya"
    os.environ["WARDEN_LAYA_MODEL"] = a.checkpoint
    os.environ["WARDEN_FAST_PATH_MIN_CONFIDENCE"] = "0"
    seen = {body_key(json.loads(l)["body"]) for l in open(a.train)} if a.train else set()
    val = [json.loads(l) for l in open(a.val)]
    kept = [r for r in val if body_key(r["body"]) not in seen]
    if a.limit:
        kept = kept[: a.limit]

    fastpath.warm()
    rows, t0 = [], time.time()
    for i, r in enumerate(kept, 1):
        rec = fastpath.decide(r["body"], "laya")
        rows.append({"choice": rec["choice"], "confidence": rec["confidence"], "free_p": rec["freeTextProbability"],
                     "free_text": bool(r["free_text"]), "correct": rec["choice"] in r["accept"],
                     "family": r.get("family")})
        if i % 250 == 0:
            print(f"  {i}/{len(kept)} {time.time() - t0:.0f}s", flush=True)

    doc = {"checkpoint": os.path.basename(a.checkpoint.rstrip("/")), "val": os.path.basename(a.val),
           "val_steps": len(val), "dropped_as_seen_in_train": len(val) - len(kept) if a.train else None,
           **summarize(rows)}
    meta = Path(a.checkpoint) / "training_meta.json"
    if meta.exists():
        doc["training"] = {k: v for k, v in json.loads(meta.read_text()).items() if k != "epochs_log"}
        doc["epochs_log"] = json.loads(meta.read_text()).get("epochs_log")
    print(json.dumps({k: doc[k] for k in ("checkpoint", "steps", "top_choice_right", "free_text", "passes_at_0.9")}), flush=True)
    print(json.dumps(doc["by_threshold"][str(GATE)]), flush=True)
    if a.out:
        Path(a.out).write_text(json.dumps(doc, indent=1) + "\n")


if __name__ == "__main__":
    main()

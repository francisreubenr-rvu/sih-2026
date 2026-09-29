"""Cloud-model bench for the Warden's two replaceable model stages.

1. PLAN: the /plan planner. Groq and OpenRouter get the Warden's own prompt
   (groq_client.build_prompt) and the Warden's own validator
   (groq_client.validate_action). Jev (TypeSafe System One) cannot generate
   text, so it gets a choice question over the actions the scene allows:
   click each element, type each task token into each input, finish.
2. REVIEW: the optional /validate reasoning stage, today local Ollama
   (ollama_client). Cloud LLMs get the Warden's own review prompt; Jev gets a
   yes/no (noul) question.

Inputs are the synthetic, already-tokenized cases in cases.py, i.e. exactly
what may cross the egress guard. Keys are read from the environment and never
written anywhere. Latency is wall-clock from this process, including network.

    python scripts/cloud-models/bench.py --reps 3 --out Benchmarks/results/cloud-model-bench-v01.json
"""

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import groq_client  # noqa: E402
import ollama_client  # noqa: E402
from cases import PLAN_CASES, REVIEW_CASES  # noqa: E402

TIMEOUT = 30.0
_ORG = __import__("re").compile(r"org_[A-Za-z0-9]+")


def _scrub(text):
    # Provider errors can name the account (Groq 429s carry the organization id); the results are public.
    return _ORG.sub("org_[redacted]", text)


def _key(name):
    # The last whitespace-separated word: tolerates a pasted "export NAME=" prefix.
    raw = os.environ.get(name, "").split()
    return raw[-1] if raw else None


PROVIDERS = {
    "groq": {"base": "https://api.groq.com/openai/v1", "key": "GROQ_API_KEY"},
    "openrouter": {"base": "https://openrouter.ai/api/v1", "key": "OPENROUTER_API_KEY"},
}

LLM_PLANNERS = [
    ("groq", "openai/gpt-oss-20b"),
    ("groq", "openai/gpt-oss-120b"),
    ("groq", "qwen/qwen3.8-27b"),
    ("openrouter", "google/gemini-3.8-flash"),
    ("openrouter", "deepseek/deepseek-v4.1-flash"),
    ("openrouter", "qwen/qwen3.8-flash"),
]
LLM_REVIEWERS = [("groq", "openai/gpt-oss-20b"), ("openrouter", "google/gemini-3.8-flash")]

JEV_URL = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-latest"


def chat(provider, model, prompt, client):
    p = PROVIDERS[provider]
    resp = client.post(
        f"{p['base']}/chat/completions",
        headers={"Authorization": f"Bearer {_key(p['key'])}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0},
        timeout=TIMEOUT,
    )
    if resp.status_code != 200:
        raise RuntimeError(_scrub(f"HTTP {resp.status_code}: {resp.text[:160]}"))
    return resp.json()["choices"][0]["message"]["content"] or ""


def jev(state, questions, client):
    resp = client.post(
        JEV_URL,
        headers={"Authorization": f"Bearer {_key('JEV_API_KEY')}", "Content-Type": "application/json"},
        json={"model": JEV_MODEL, "state": state, "questions": questions},
        timeout=TIMEOUT,
    )
    if resp.status_code != 200:
        raise RuntimeError(_scrub(f"HTTP {resp.status_code}: {resp.text[:160]}"))
    return resp.json()


def plan_key(plan):
    parts = [plan["action"]]
    if plan.get("target_selector"):
        parts.append(plan["target_selector"])
    if plan["action"] == "type" and plan.get("value"):
        parts.append(plan["value"])
    return " ".join(parts)


def is_correct(key, accept):
    for a in accept:
        if "*" in a:
            head, _, needle = a.partition("*")
            if key.startswith(head.strip()) and needle.strip("*").lower() in key.lower():
                return True
        elif key == a:
            return True
    return False


def jev_options(case):
    import re

    tokens = sorted(set(re.findall(r"\b[A-Z]+#\d+\b", case["tokenizedTask"])))
    opts = {}
    for el in case["elements"]:
        label, sel, ft = el["label"], el["selector"], el["fieldType"]
        if ft in ("button", "link"):
            opts[f"click {sel}"] = f"Click the {ft} labelled \"{label}\""
        else:
            state = "already filled" if el["filled"] else "empty"
            for t in tokens:
                opts[f"type {sel} {t}"] = f"Type {t} into the {ft} field labelled \"{label}\" ({state})"
    opts["finish"] = "The task is already complete; nothing is left to do"
    return opts


def run_plan(provider, model, case, client):
    t0 = time.monotonic()
    if provider == "jev":
        opts = jev_options(case)
        state = {
            "task": case["tokenizedTask"],
            "page": case["sanitizedDom"],
            "done_so_far": case["history"] or ["nothing yet"],
        }
        out = jev(state, {"next": {"type": "choice", "instructions": "Which single browser action should happen next to advance the task? Do not repeat an action already done.", "criteria": opts}}, client)
        ms = (time.monotonic() - t0) * 1000
        ans = out["answers"]["next"]
        return {"ms": ms, "key": ans["choice"], "valid": True, "confidence": ans.get("confidence"), "served": out.get("model")}
    prompt = groq_client.build_prompt(case["tokenizedTask"], case["sanitizedDom"], case["elements"], case["history"])
    text = chat(provider, model, prompt, client)
    ms = (time.monotonic() - t0) * 1000
    try:
        plan = groq_client.validate_action(groq_client._parse_action_json(text), case["elements"])
    except groq_client.GroqError as exc:
        return {"ms": ms, "key": None, "valid": False, "error": str(exc)[:120]}
    return {"ms": ms, "key": plan_key(plan), "valid": True}


def run_review(provider, model, case, client):
    t0 = time.monotonic()
    plan = {k: v for k, v in case["plan"].items()}
    if provider == "jev":
        question = (
            f"Does the planned browser action ({plan['action']} on \"{plan['label']}\") plainly conflict with the "
            "user's task? A plausible step toward the task is not a conflict."
        )
        out = jev({"task": case["tokenizedTask"], "planned_action": plan, "tier": case["tier"]},
                  {"conflict": {"type": "noul", "instructions": question}}, client)
        ms = (time.monotonic() - t0) * 1000
        p = out["answers"]["conflict"]["noul"]
        return {"ms": ms, "verdict": p >= 0.5, "p": p, "valid": True}
    text = chat(provider, model, ollama_client._build_prompt(case["tokenizedTask"], plan, case["tier"]), client)
    ms = (time.monotonic() - t0) * 1000
    try:
        parsed = groq_client._parse_action_json(text)
        verdict = ollama_client._as_bool(parsed.get("downgrade_to_ask"))
    except Exception as exc:  # noqa: BLE001
        return {"ms": ms, "verdict": None, "valid": False, "error": str(exc)[:120]}
    return {"ms": ms, "verdict": verdict, "valid": verdict is not None}


def pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return None
    i = min(len(xs) - 1, max(0, round(q * (len(xs) - 1))))
    return round(xs[i], 1)


def summarize(rows, correct_fn):
    ms = [r["ms"] for r in rows if "ms" in r]
    return {
        "calls": len(rows),
        "errors": sum(1 for r in rows if r.get("transport_error")),
        "valid": sum(1 for r in rows if r.get("valid")),
        "correct": sum(1 for r in rows if correct_fn(r)),
        "p50_ms": pct(ms, 0.5),
        "p95_ms": pct(ms, 0.95),
        "min_ms": round(min(ms), 1) if ms else None,
        "error_samples": sorted({r["transport_error"][:90] for r in rows if r.get("transport_error")})[:3],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--out", default=None)
    ap.add_argument("--only", default=None, help="comma-separated provider names to run, e.g. groq")
    ap.add_argument("--sleep", type=float, default=0.0, help="seconds between calls (free-tier rate limits)")
    args = ap.parse_args()

    planners = [p for p in LLM_PLANNERS if _key(PROVIDERS[p[0]]["key"])]
    reviewers = [p for p in LLM_REVIEWERS if _key(PROVIDERS[p[0]]["key"])]
    if _key("JEV_API_KEY"):
        planners.append(("jev", JEV_MODEL))
        reviewers.append(("jev", JEV_MODEL))
    if args.only:
        keep = set(args.only.split(","))
        planners = [p for p in planners if p[0] in keep]
        reviewers = [p for p in reviewers if p[0] in keep]

    result = {"plan": {}, "review": {}}
    with httpx.Client() as client:
        for provider, model in planners:
            rows = []
            for case in PLAN_CASES:
                for _ in range(args.reps):
                    try:
                        r = run_plan(provider, model, case, client)
                    except Exception as exc:  # noqa: BLE001
                        r = {"valid": False, "transport_error": str(exc)[:160]}
                    time.sleep(args.sleep)
                    r["case"] = case["id"]
                    r["correct"] = bool(r.get("key")) and is_correct(r["key"], case["accept"])
                    rows.append(r)
            name = f"{provider}:{model}"
            result["plan"][name] = {"summary": summarize(rows, lambda r: r["correct"]), "rows": rows}
            print(name, result["plan"][name]["summary"], flush=True)
        for provider, model in reviewers:
            rows = []
            for case in REVIEW_CASES:
                for _ in range(args.reps):
                    try:
                        r = run_review(provider, model, case, client)
                    except Exception as exc:  # noqa: BLE001
                        r = {"valid": False, "transport_error": str(exc)[:160]}
                    time.sleep(args.sleep)
                    r["case"] = case["id"]
                    r["correct"] = r.get("verdict") is not None and r["verdict"] == case["flag"]
                    rows.append(r)
            name = f"{provider}:{model}"
            result["review"][name] = {"summary": summarize(rows, lambda r: r["correct"]), "rows": rows}
            print("review", name, result["review"][name]["summary"], flush=True)

    doc = {
        "id": Path(args.out).stem if args.out else "cloud-model-bench",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "harness": "scripts/cloud-models/bench.py",
        "scope": (
            "Synthetic, already-tokenized scenes only (scripts/cloud-models/cases.py): the material that may pass "
            "the Warden egress guard. Planner prompt and validator are the Warden's own (groq_client). Latency is "
            "wall-clock from a cloud container (location not verified) through an egress proxy, not from the team's machine in "
            "India, and includes TLS and network time. This is not the G11 full-flow measurement."
        ),
        "reps_per_case": args.reps,
        "providers_run": args.only or "all with a key",
        "sleep_between_calls_s": args.sleep,
        "plan_cases": len(PLAN_CASES),
        "review_cases": len(REVIEW_CASES),
        "jev_note": (
            "Jev is a choice model: it picks from options the harness enumerates (click each control, type each "
            "task token into each input, finish). It cannot produce a free-text value, so search-free-text is "
            "unanswerable for it by construction."
        ),
        **result,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(doc, indent=1) + "\n")
        print("wrote", args.out)


if __name__ == "__main__":
    main()

"""Planner accuracy of each Groq model under the Warden's exact request settings, with and without
temperature 0. Uses groq_client.build_prompt / _parse_action_json / validate_action.

    python scripts/cloud-models/llm_settings_bench.py --out Benchmarks/results/groq-settings-bench-v01.json
"""
import argparse, json, sys, time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import groq_client  # noqa: E402
from bench import _scrub, is_correct, pct, plan_key  # noqa: E402
from cases import PLAN_CASES  # noqa: E402
from cases_heldout import HELDOUT  # noqa: E402


def call(model, prompt, temperature):
    body = {"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}}
    if temperature is not None:
        body["temperature"] = temperature
    for attempt in range(5):
        t0 = time.monotonic()
        r = httpx.post(f"{config.GROQ_BASE_URL}/chat/completions", json=body, timeout=30,
                       headers={"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"})
        if r.status_code != 429 or attempt == 4:
            break
        # Free-tier rate limit: wait as asked (capped) and retry, so a 429 is not scored as a wrong answer.
        time.sleep(min(60.0, float(r.headers.get("retry-after") or 10)))
    if r.status_code != 200:
        raise RuntimeError(_scrub(f"HTTP {r.status_code}: {r.text[:160]}"))
    # Latency of the answered call only; rate-limit waits are excluded.
    return r.json()["choices"][0]["message"]["content"], round((time.monotonic() - t0) * 1000, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="qwen/qwen3.8-27b,openai/gpt-oss-20b")
    ap.add_argument("--sleep", type=float, default=1.5)
    ap.add_argument("--out")
    a = ap.parse_args()
    cases = [("design", c) for c in PLAN_CASES] + [("heldout", c) for c in HELDOUT]
    res = {}
    for model in a.models.split(","):
        for temp in (None, 0):
            rows = []
            for split, c in cases:
                prompt = groq_client.build_prompt(c["tokenizedTask"], c["sanitizedDom"], c["elements"], c["history"])
                t0 = time.monotonic()
                try:
                    content, ms = call(model, prompt, temp)
                    plan = groq_client.validate_action(groq_client._parse_action_json(content), c["elements"])
                    key = plan_key(plan)
                    rows.append({"case": c["id"], "split": split, "key": key, "correct": is_correct(key, c["accept"]), "ms": ms})
                except Exception as exc:  # noqa: BLE001
                    rows.append({"case": c["id"], "split": split, "error": _scrub(str(exc))[:160], "correct": False,
                                 "ms": round((time.monotonic() - t0) * 1000, 1)})
                time.sleep(a.sleep)
            name = f"{model} temperature={'default' if temp is None else temp}"
            ok = [r for r in rows if "error" not in r]
            summ = {s: {"calls": sum(r["split"] == s for r in rows), "errors": sum(r["split"] == s and "error" in r for r in rows),
                        "correct": sum(r["split"] == s and r["correct"] for r in rows)} for s in ("design", "heldout")}
            summ["p50_ms"] = pct([r["ms"] for r in ok], 0.5)
            summ["wrong"] = [f'{r["case"]}: {r.get("key") or r.get("error", "")[:60]}' for r in rows if not r["correct"]]
            res[name] = {"summary": summ, "rows": rows}
            print(name, json.dumps(summ), flush=True)
    doc = {"id": Path(a.out).stem if a.out else "groq-settings-bench", "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "harness": "scripts/cloud-models/llm_settings_bench.py",
           "scope": "Warden request shape (response_format json_object) with Groq's default temperature vs temperature 0; one answered call per case (HTTP 429 is retried after Retry-After, up to 4 times, and the wait is excluded from latency); design (cases.py) + heldout (cases_heldout.py). Latency from a cloud container (location not verified).",
           "results": res}
    if a.out:
        Path(a.out).write_text(json.dumps(doc, indent=1) + "\n")


if __name__ == "__main__":
    main()

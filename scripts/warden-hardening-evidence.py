#!/usr/bin/env python3
"""Warden hardening and recovery evidence against a real uvicorn Warden (G06, G07, G08, G13 scope).

The ledger's G06/G08/G13 passes were measured on the Prototype's Node server. The v5 product's
trust boundary is the Warden on 127.0.0.1, so this starts the real app (warden/app.py) under
uvicorn on a spare port, sends real HTTP, and records each control's observed answer.

A fresh pairing secret is generated per run, held in memory and in the child's environment only,
and never printed or written. GLiNER is loaded for real (first run downloads the weights). No
cloud planner is called: the planner checks use WARDEN_PLANNER=ollama with an unreachable host,
so the refusal and failure paths are exercised without spending quota or sending text anywhere.

    python3 scripts/warden-hardening-evidence.py [--out Benchmarks/results/warden-hardening-v01.json]
"""
import argparse
import datetime
import json
import os
import pathlib
import secrets
import socket
import subprocess
import sys
import time

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "warden"))
import pairing  # noqa: E402

SYNTHETIC_EMAIL = "asha.verma@example.com"
SYNTHETIC_ACCOUNT = "50100234567812"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(port, env_extra):
    env = dict(os.environ)
    for key in ("WARDEN_PAIRING_SECRET", "WARDEN_PAIRING_DISABLED", "WARDEN_REVIEWER", "WARDEN_FAST_PATH"):
        env.pop(key, None)
    env.update(env_extra)
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=ROOT / "warden", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 300
    while time.time() < deadline:
        try:
            if httpx.get(base + "/health", timeout=2).status_code == 200:
                return proc, base
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    proc.kill()
    raise SystemExit("Warden did not answer /health in 300 s")


def wait_loaded(base, timeout=300):
    """Poll /health with the side panel's 3 s timeout until GLiNER is loaded. Returns
    (loaded, polls, timeouts, slowest_ms): a model load that starves the server shows up
    as timeouts here, and the panel would show "Warden unreachable" for those polls."""
    deadline = time.time() + timeout
    polls = timeouts = 0
    slowest = 0.0
    while time.time() < deadline:
        polls += 1
        t0 = time.perf_counter()
        try:
            loaded = httpx.get(base + "/health", timeout=3).json().get("loaded")
        except httpx.HTTPError:
            timeouts += 1
            loaded = False
        slowest = max(slowest, (time.perf_counter() - t0) * 1000)
        if loaded:
            return True, polls, timeouts, round(slowest, 1)
        time.sleep(1)
    return False, polls, timeouts, round(slowest, 1)


def signed(secret, path, body_bytes, nonce=None):
    nonce = nonce or pairing.b64url(secrets.token_bytes(18))
    return nonce, {
        "content-type": "application/json",
        "x-dhristi-nonce": nonce,
        "x-dhristi-auth": pairing.request_mac(secret, "POST", path, nonce, body_bytes),
    }


def raw_post_without_length(port, path):
    """httpx always sends Content-Length; a raw socket shows what a client that omits it gets."""
    with socket.create_connection(("127.0.0.1", port), timeout=10) as s:
        s.sendall((f"POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\n"
                   "Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n2\r\n{}\r\n0\r\n\r\n").encode())
        data = b""
        while chunk := s.recv(65536):
            data += chunk
    return int(data.split(b" ", 2)[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="Benchmarks/results/warden-hardening-v01.json")
    opts = ap.parse_args()

    secret = pairing.new_secret()
    checks = []

    def record(cid, control, ok, observed, expected):
        checks.append({"id": cid, "control": control, "ok": bool(ok), "observed": observed, "expected": expected})
        print(("PASS " if ok else "FAIL ") + cid, control, "->", observed)

    port = free_port()
    proc, base = start(port, {"WARDEN_PAIRING_SECRET": secret, "WARDEN_PLANNER": "ollama",
                              "OLLAMA_HOST": "http://127.0.0.1:9"})
    try:
        loaded, polls, timeouts, slowest = wait_loaded(base)
        record("H00", "Health during the cold GLiNER load, polled with the side panel's 3 s timeout",
               loaded, {"loaded": loaded, "polls": polls, "timeouts_over_3s": timeouts, "slowest_ms": slowest},
               "loads; timeouts recorded, not hidden")
        health = httpx.get(base + "/health", timeout=5)
        text = health.text
        leaked = [name for name in ("WARDEN_PAIRING_SECRET", "GROQ_API_KEY", "HF_TOKEN", "JEV_API_KEY")
                  if os.environ.get(name) and os.environ[name] in text] + (["pairing secret"] if secret in text else [])
        record("H01", "GET /health answers on loopback and carries no secret", health.status_code == 200 and not leaked,
               {"status": health.status_code, "secrets_in_body": len(leaked), "pairing": health.json().get("pairing")},
               "200, no secret, pairing required")

        r = httpx.get(base + "/health", headers={"host": "evil.example"}, timeout=5)
        record("H02", "Host header outside loopback names (DNS rebinding)", r.status_code == 421,
               {"status": r.status_code}, 421)

        docs = {p: httpx.get(base + p, timeout=5).status_code for p in ("/docs", "/redoc", "/openapi.json")}
        record("H03", "No interactive docs or schema served", all(s == 404 for s in docs.values()), docs, "404 each")

        r = httpx.post(base + "/strip", content=b"{}", headers={"content-type": "text/plain"}, timeout=5)
        record("H04", "POST with a non-JSON content type (no-preflight cross-site form)", r.status_code == 415,
               {"status": r.status_code}, 415)

        status = raw_post_without_length(port, "/strip")
        record("H05", "POST without Content-Length", status == 411, {"status": status}, 411)

        big = b'{"task":"' + b"a" * (3 * 1024 * 1024) + b'"}'
        r = httpx.post(base + "/strip", content=big, headers={"content-type": "application/json"}, timeout=30)
        record("H06", "POST larger than WARDEN_MAX_BODY_BYTES (default 2 MiB)", r.status_code == 413,
               {"status": r.status_code, "sent_bytes": len(big)}, 413)

        body = json.dumps({"task": f"Email {SYNTHETIC_EMAIL} my statement",
                           "dom": f'1. SPAN type=text selector=#a label="Account {SYNTHETIC_ACCOUNT}" position=1,2',
                           "elements": [], "resolved": {}}).encode()
        r = httpx.post(base + "/strip", content=body, headers={"content-type": "application/json"}, timeout=30)
        record("H07", "Unsigned POST /strip", r.status_code == 401, {"status": r.status_code}, 401)

        _, wrong = signed(pairing.new_secret(), "/strip", body)
        r = httpx.post(base + "/strip", content=body, headers=wrong, timeout=30)
        record("H08", "POST signed with a different secret", r.status_code == 401, {"status": r.status_code}, 401)

        nonce, good = signed(secret, "/strip", body)
        t0 = time.perf_counter()
        r = httpx.post(base + "/strip", content=body, headers=good, timeout=120)
        ms = round((time.perf_counter() - t0) * 1000, 1)
        proof_ok = r.headers.get("x-dhristi-proof") == pairing.response_mac(secret, "/strip", nonce, r.status_code, r.content)
        out = r.json() if r.status_code == 200 else {}
        sent = (out.get("tokenizedTask") or "") + (out.get("sanitizedDom") or "")
        record("H09", "Signed POST /strip: answered, response proof verifies, synthetic values tokenized",
               r.status_code == 200 and proof_ok and SYNTHETIC_EMAIL not in sent and SYNTHETIC_ACCOUNT not in sent,
               {"status": r.status_code, "response_proof_verifies": proof_ok, "values_left_in_text": int(SYNTHETIC_EMAIL in sent) + int(SYNTHETIC_ACCOUNT in sent),
                "tokens": sorted(out.get("tokens", {}).keys()), "ms": ms, "gliner_loaded": loaded},
               "200, proof verifies, 0 values left")

        r = httpx.post(base + "/strip", content=body, headers=good, timeout=30)
        record("H10", "Replayed nonce", r.status_code == 401, {"status": r.status_code}, 401)

        bad = b'{"task": ' + SYNTHETIC_EMAIL.encode()
        _, h = signed(secret, "/strip", bad)
        r = httpx.post(base + "/strip", content=bad, headers=h, timeout=30)
        record("H11", "Malformed JSON: controlled 400 that does not echo the input",
               r.status_code == 400 and SYNTHETIC_EMAIL not in r.text, {"status": r.status_code, "echoes_input": SYNTHETIC_EMAIL in r.text}, "400, no echo")

        plan = json.dumps({"tokenizedTask": f"Email {SYNTHETIC_EMAIL}", "sanitizedDom": "", "elements": [], "history": []}).encode()
        _, h = signed(secret, "/plan", plan)
        r = httpx.post(base + "/plan", content=plan, headers=h, timeout=30)
        record("H12", "Egress guard: a raw personal value in /plan is refused before any planner, without echo",
               r.status_code == 422 and SYNTHETIC_EMAIL not in r.text, {"status": r.status_code, "echoes_value": SYNTHETIC_EMAIL in r.text}, "422, no echo")

        plan = json.dumps({"tokenizedTask": "Open EMAIL#1 settings", "sanitizedDom": '1. A type=link selector=#s label="Settings" position=1,2',
                           "elements": [{"selector": "#s", "label": "Settings", "fieldType": "link", "x": 1, "y": 2}], "history": []}).encode()
        _, h = signed(secret, "/plan", plan)
        r = httpx.post(base + "/plan", content=plan, headers=h, timeout=90)
        record("H13", "Planner unreachable: controlled error, no fall-through to another planner",
               r.status_code in (502, 503, 504) and "error" in r.json(), {"status": r.status_code}, "502/503/504 with an error message")

        r = httpx.options(base + "/strip", headers={"origin": "https://evil.example", "access-control-request-method": "POST"}, timeout=5)
        record("H14", "CORS preflight from a web origin", "access-control-allow-origin" not in r.headers,
               {"status": r.status_code, "allow_origin": r.headers.get("access-control-allow-origin")}, "no Access-Control-Allow-Origin")

        t0 = time.perf_counter()
        for _ in range(20):
            httpx.get(base + "/health", timeout=5)
        record("H15", "Health stays responsive (20 sequential GETs)", True,
               {"mean_ms": round((time.perf_counter() - t0) * 1000 / 20, 2)}, "informational")
    finally:
        proc.terminate()
        proc.wait(timeout=20)

    port2 = free_port()
    proc2, base2 = start(port2, {})
    try:
        r = httpx.post(base2 + "/strip", content=b"{}", headers={"content-type": "application/json"}, timeout=10)
        record("H16", "Warden with no pairing secret refuses every POST", r.status_code == 503 and r.json().get("pairing") == "missing",
               {"status": r.status_code, "pairing": r.json().get("pairing")}, "503, pairing missing")
    finally:
        proc2.terminate()
        proc2.wait(timeout=20)

    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    record_out = {
        "name": "warden-hardening-v01",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "commit": head,
        "surface": "warden/app.py under uvicorn on 127.0.0.1 (the v5 product boundary), real GLiNER, no cloud planner call",
        "scope": ("Single local Warden, synthetic values only. Covers request validation, pairing, host and CORS "
                  "boundary, size limits, egress refusal and planner-failure recovery. Not covered: TLS (loopback "
                  "only), multi-user auth, a hostile local process with the pairing secret, rate limiting (the "
                  "Warden has none), the extension side (its own suite)."),
        "passed": sum(c["ok"] for c in checks),
        "total": len(checks),
        "checks": checks,
    }
    (ROOT / opts.out).write_text(json.dumps(record_out, indent=2) + "\n")
    print(f"{record_out['passed']}/{record_out['total']} -> {opts.out}")
    return 0 if record_out["passed"] == record_out["total"] else 1


if __name__ == "__main__":
    sys.exit(main())

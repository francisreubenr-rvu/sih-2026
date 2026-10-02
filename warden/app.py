"""app.py: the Warden. FastAPI server exposing GET /health, POST /strip,
POST /plan, POST /validate exactly as Docs/specs/2026-09-13-dhristi-v4-warden.md
defines them. Binds to 127.0.0.1 only (see __main__ below) -- this is a
local-only service and binding wider would expose a PII oracle to the
network.

Run: see warden/README.md for the exact venv/activation commands. Short
version, from inside warden/:
    ~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756
"""

import re
import threading
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

import config
import entities
import fastpath
import groq_client
import laya_review
import ollama_client
import pairing
import redactor
import strip as strip_module
import validate as validate_module

app = FastAPI(title="Warden", version=config.WARDEN_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Dhristi-Nonce", "X-Dhristi-Auth"],
    expose_headers=["X-Dhristi-Proof"],
)

_replay_guard = pairing.ReplayGuard()


@app.middleware("http")
async def pairing_middleware(request: Request, call_next):
    """Pairing (pairing.py). Off unless WARDEN_PAIRING_SECRET is set. When on, every POST
    must carry a valid request proof with a fresh nonce, and every response to a request
    with a nonce carries X-Dhristi-Proof, so the extension can tell this Warden from
    anything else listening on the port."""
    state = config.pairing_state()
    if state == "off" or request.method == "OPTIONS":
        return await call_next(request)
    secret = config.pairing_secret()
    path = request.url.path
    nonce = request.headers.get("x-dhristi-nonce")
    if request.method == "POST":
        if state != "required":
            return JSONResponse(status_code=503, content={
                "error": f"WARDEN_PAIRING_SECRET is shorter than {config.PAIRING_MIN_LEN} characters; "
                         "make one with `python pairing.py new`",
                "pairing": state, "warden": config.WARDEN_VERSION,
            })
        body = await request.body()
        if not pairing.verify_request(secret, request.method, path, nonce, request.headers.get("x-dhristi-auth"), body):
            return JSONResponse(status_code=401, content={
                "error": "This Warden requires pairing: the request carried no valid pairing proof. "
                         "Paste the pairing code into the extension's Settings.",
                "pairing": state, "warden": config.WARDEN_VERSION,
            })
        if not _replay_guard.first_use(nonce):
            return JSONResponse(status_code=401, content={
                "error": "pairing nonce already used", "pairing": state, "warden": config.WARDEN_VERSION,
            })
    response = await call_next(request)
    if state != "required" or not pairing.valid_nonce(nonce):
        return response
    body = b"".join([chunk async for chunk in response.body_iterator])
    headers = dict(response.headers)
    headers.pop("content-length", None)
    headers["X-Dhristi-Proof"] = pairing.response_mac(secret, path, nonce, response.status_code, body)
    return Response(content=body, status_code=response.status_code, headers=headers, media_type=response.media_type)


@app.on_event("startup")
def _start_model_load() -> None:
    # Load in a background thread so the server is already answering /health
    # (with loaded: false) while the ~76s cold load runs, rather than
    # blocking the socket from accepting connections until it finishes.
    threading.Thread(target=entities.load_model, daemon=True).start()
    threading.Thread(target=fastpath.warm, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": entities.MODEL_ID,
        "loaded": entities.STATE.loaded,
        "regexPatterns": config.REGEX_PATTERN_COUNT,
        "planner": config.planner_mode(),
        "destination": config.planner_destination(config.planner_mode()),
        "plannerModel": config.planner_model(config.planner_mode()),
        "groqConfigured": config.groq_configured(),
        "fastPath": {"mode": fastpath.mode(), "destination": fastpath.destination(fastpath.mode()),
                     "minConfidence": fastpath.min_confidence()},
        "pairing": config.pairing_state(),
        "warden": config.WARDEN_VERSION,
    }


@app.post("/strip")
async def do_strip(request: Request):
    if not entities.STATE.loaded:
        return JSONResponse(
            status_code=503,
            content={
                "error": "GLiNER model not loaded yet"
                + (f": {entities.STATE.load_error}" if entities.STATE.load_error else ""),
                "loaded": False,
                "warden": config.WARDEN_VERSION,
            },
        )
    body = await request.json()
    result = strip_module.strip(
        task=body.get("task"),
        dom=body.get("dom"),
        elements=body.get("elements"),
        resolved=body.get("resolved"),
    )
    result["warden"] = config.WARDEN_VERSION
    return result


class PlanRouteError(Exception):
    def __init__(self, status: int, message: str, switched: Optional[list] = None,
                 egress_guard: Optional[dict] = None):
        super().__init__(message)
        self.status = status
        self.switched = switched or []
        self.egress_guard = egress_guard


# Egress guard (added 29 September 2026). The planner is a cloud model by
# default now, so the Warden no longer trusts the caller to have sent only
# tokenized text: before any planner is called it runs the same deterministic
# regex layer /strip uses over every string in the body. One hit refuses the
# whole request. The refusal names the pattern and the field, never the value.
#
# TYPE#n tokens are blanked (same length, spaces) before the scan: they are
# the sanctioned replacement for PII, and the digits in a token must not be
# read as part of a number next to it. The shape is the browser consumer's
# VAULT_TOKEN_PATTERN (see minter.py).
_TOKEN_RE = re.compile(r"[A-Z][A-Z0-9]*#[0-9]+")


def _walk_strings(value, path: str):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _walk_strings(item, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _walk_strings(item, f"{path}[{index}]")


def egress_guard(body: dict) -> Optional[dict]:
    """First regex hit in the body as {pattern, field}, or None if clean."""
    for field, text in _walk_strings(body, ""):
        blanked = _TOKEN_RE.sub(lambda m: " " * len(m.group(0)), text)
        spans = redactor.regex_spans(blanked)
        if spans:
            return {"pattern": spans[0]["pattern"], "field": field}
    return None


def dispatch_plan(body: dict) -> dict:
    """Choose the planner and run it.

    Default is Groq (cloud). Local Ollama runs only when WARDEN_PLANNER=ollama.
    If the chosen planner fails, this raises. It never falls through to the
    other one.
    """
    if "tokens" in body:
        raise PlanRouteError(
            400,
            "POST /plan must never receive a tokens field; the caller holds tokens locally",
        )

    hit = egress_guard(body)
    if hit is not None:
        raise PlanRouteError(
            422,
            f"POST /plan refused by the egress guard: a {hit['pattern']} pattern matched in "
            f"{hit['field']}. No model was called.",
            egress_guard=hit,
        )

    mode = config.planner_mode()
    if mode == "invalid":
        raise PlanRouteError(
            503,
            "WARDEN_PLANNER must be 'groq' (default) or 'ollama'. POST /plan did not call a model.",
        )

    # Optional decision-model fast path (fastpath.py). It can only remove an LLM call: when it
    # defers or fails, the configured planner answers as before. Offline mode never sends a body
    # off the machine, so a cloud fast path (Jev) is skipped there; Laya runs locally and is allowed.
    fast_record = None
    if fastpath.mode() != "off":
        if mode == "ollama" and fastpath.destination(fastpath.mode()) == "cloud":
            fast_record = {"backend": fastpath.mode(), "used": False,
                           "reason": "cloud fast path skipped: WARDEN_PLANNER=ollama is offline"}
        else:
            fast, fast_record = fastpath.plan_or_none(body)
            if fast is not None:
                fast["fastPath"] = fast_record
                return _with_review(body, fast)

    return _with_review(body, _dispatch_planner(mode, body, fast_record))


def _with_review(body: dict, result: dict) -> dict:
    """Adds Laya review scores for the returned plan, whichever planner produced it, when
    WARDEN_REVIEWER=laya."""
    if config.reviewer_mode() == "laya":
        result["review"] = _laya_review(body, result.get("plan"))
    return result


def _laya_review(body: dict, plan) -> Optional[dict]:
    """Laya scores for the returned plan (extension/utils/plan-check.js layaRelease decides).
    Never fails /plan: any problem becomes {"skipped": reason}, which the extension treats as no
    release."""
    try:
        return laya_review.release_scores(body.get("tokenizedTask") or "", plan or {}, body.get("elements") or [])
    except laya_review.LayaSkipped as exc:
        return {"skipped": str(exc)}
    except Exception as exc:  # noqa: BLE001 -- optional component, never load-bearing
        return {"skipped": f"laya review raised {type(exc).__name__}"}


def _dispatch_planner(mode: str, body: dict, fast_record: Optional[dict] = None) -> dict:
    if mode == "groq":
        if not config.groq_configured():
            raise PlanRouteError(
                503,
                "WARDEN_PLANNER=groq but GROQ_API_KEY is absent. POST /plan did not call Ollama or Groq.",
            )
        try:
            result = groq_client.plan_via_groq(body)
        except groq_client.GroqError as exc:
            raise PlanRouteError(502, str(exc), switched=exc.switched) from exc
        result["planner"] = "groq"
        result["destination"] = config.planner_destination("groq")
        if fast_record is not None:
            result["fastPath"] = fast_record
        return result

    try:
        result = ollama_client.plan_via_ollama(body)
    except ollama_client.OllamaPlanError as exc:
        raise PlanRouteError(503, str(exc)) from exc
    result["destination"] = config.planner_destination("ollama")
    if fast_record is not None:
        result["fastPath"] = fast_record
    return result


@app.post("/plan")
async def do_plan(request: Request):
    body = await request.json()
    try:
        result = dispatch_plan(body)
    except PlanRouteError as exc:
        content = {
            "error": str(exc),
            "planner": config.planner_mode(),
            "warden": config.WARDEN_VERSION,
        }
        if exc.switched:
            content["switched"] = exc.switched
        if exc.egress_guard is not None:
            content["egressGuard"] = exc.egress_guard
        return JSONResponse(status_code=exc.status, content=content)

    result["warden"] = config.WARDEN_VERSION
    return result


@app.post("/validate")
async def do_validate(request: Request):
    body = await request.json()
    plan = body.get("plan") or {}
    elements = body.get("elements") or []
    tokenized_task = body.get("tokenizedTask") or ""

    det = validate_module.run_deterministic_checks(plan, elements, tokenized_task)
    checks = det["checks"]
    reasons = det["reasons"]
    tier = det["tier"]

    if reasons:
        return {
            "verdict": "reject",
            "tier": tier,
            "checks": checks,
            "reasons": reasons,
            "question": None,
            "warden": config.WARDEN_VERSION,
        }

    # All deterministic checks passed. Local reasoning may only downgrade
    # accept -> ask from here; see validate.maybe_apply_local_reasoning.
    reasoning = validate_module.maybe_apply_local_reasoning(tokenized_task, det["overridden_plan"], tier, elements)
    checks = checks + [reasoning["reasoning_check"]]

    return {
        "verdict": reasoning["verdict"],
        "tier": tier,
        "checks": checks,
        "reasons": [],
        "question": reasoning["question"],
        "warden": config.WARDEN_VERSION,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=config.PORT)

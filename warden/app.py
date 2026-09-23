"""app.py: the Warden. FastAPI server exposing GET /health, POST /strip,
POST /plan, POST /validate exactly as Docs/specs/2026-09-13-dhristi-v4-warden.md
defines them. Binds to 127.0.0.1 only (see __main__ below) -- this is a
local-only service and binding wider would expose a PII oracle to the
network.

Run: see warden/README.md for the exact venv/activation commands. Short
version, from inside warden/:
    ~/.venvs/data/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8756
"""

import threading
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import entities
import groq_client
import ollama_client
import strip as strip_module
import validate as validate_module

app = FastAPI(title="Warden", version=config.WARDEN_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
def _start_model_load() -> None:
    # Load in a background thread so the server is already answering /health
    # (with loaded: false) while the ~76s cold load runs, rather than
    # blocking the socket from accepting connections until it finishes.
    threading.Thread(target=entities.load_model, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": entities.MODEL_ID,
        "loaded": entities.STATE.loaded,
        "regexPatterns": config.REGEX_PATTERN_COUNT,
        "planner": config.planner_mode(),
        "groqConfigured": config.groq_configured(),
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
    def __init__(self, status: int, message: str, switched: Optional[list] = None):
        super().__init__(message)
        self.status = status
        self.switched = switched or []


def dispatch_plan(body: dict) -> dict:
    """Choose the planner and run it.

    Default is local Ollama. Groq runs only when WARDEN_PLANNER=groq.
    If Ollama is down, this raises. It does not call Groq.
    """
    if "tokens" in body:
        raise PlanRouteError(
            400,
            "POST /plan must never receive a tokens field; the caller holds tokens locally",
        )

    mode = config.planner_mode()
    if mode == "invalid":
        raise PlanRouteError(
            503,
            "WARDEN_PLANNER must be 'ollama' (default) or 'groq'. POST /plan did not call a model.",
        )

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
        return result

    try:
        return ollama_client.plan_via_ollama(body)
    except ollama_client.OllamaPlanError as exc:
        raise PlanRouteError(503, str(exc)) from exc


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
    reasoning = validate_module.maybe_apply_local_reasoning(tokenized_task, det["overridden_plan"], tier)
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

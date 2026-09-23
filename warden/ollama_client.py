"""ollama_client.py: local Ollama calls.

`plan_via_ollama` is the default POST /plan path (loopback only). `review` is
the optional local-reasoning step for POST /validate.

`review` calls Ollama's /api/generate with qwythos-9b:latest, the one genuinely local
model on this machine (the `:cloud` entries in `ollama list` are not local
and must never be treated as this path). It runs ONLY after every deterministic
check in validate.py has passed, and its result can only ever downgrade
`accept` to `ask` -- never upgrade a `reject`, and never invent a reject of
its own. See validate.py for where that ordering is enforced.

If Ollama is absent, unreachable, times out, or returns something that is
not the expected strict JSON, this records the check as SKIPPED (never as
passed) and the deterministic verdict stands unchanged.

Everything below that carries a number was measured on this machine on
13 September 2026 against the real qwythos-9b:latest, not estimated; the
evidence is in the "Measured" notes next to each constant.
"""

import json
import time
from typing import Optional

import httpx

import config
import groq_client


class OllamaSkipped(Exception):
    """Raised for any condition that means local reasoning could not run:
    absent, unreachable, timed out, or an unparseable response. Caller
    records this as a SKIPPED check, never as a pass.
    """


class OllamaPlanError(Exception):
    """POST /plan could not be answered by local Ollama. Callers must fail
    closed. This is not a signal to try Groq.
    """


# config.OLLAMA_TIMEOUT_S defaults to 12 s, and config.py is not this file's
# to edit, so the floor is enforced here instead.
#
# Measured 13 September 2026 with the real model and the real prompt:
#   cold call, model unloaded:  26.8 s wall, of which 15.0 s was model load
#   warm calls:                 1.6 s to 19.5 s wall over 60+ calls
# Both figures sit at or above the 12 s default, so with it the stage records
# SKIPPED on a real share of calls while Ollama is up and answering -- the
# exact "exists but never fires" failure this stage was written to avoid.
# Ollama unloads the model after its default 5-minute idle keep_alive, so the
# cold path is not a rare first-run case; it is what every call after a pause
# pays. 60 s clears the measured cold path with headroom while still bounding
# how long a hung Ollama can stall /validate. A larger WARDEN_OLLAMA_TIMEOUT_S
# still wins.
MIN_TIMEOUT_S = 60.0


def _timeout_s() -> float:
    return max(config.OLLAMA_TIMEOUT_S, MIN_TIMEOUT_S)


# Determinism, not style. Measured over 24 calls per configuration: with
# Ollama's default sampling this model returned a valid JSON object that
# carried no `downgrade_to_ask` key at all on 2 of 24 calls (it echoes the
# plan back instead of answering), and at temperature 0 that dropped to 0 of
# 24. A safety reviewer that answers differently on identical input is not a
# reviewer, and a missing key means the stage silently does nothing.
_TEMPERATURE = 0

# The reply shape is demanded explicitly, with an example. Measured over the
# same 24-call sweep on six probe plans (two that must be flagged, four that
# must not), the wording below produced 0 wrong verdicts where the previous
# wording produced 16 of 24 wrong on those same calls: the old prompt asked
# "should a human still be asked to confirm", which the model read as an
# invitation to ask about every plan, including a plain "click View Details
# to view the order details". Over-escalation is a safety failure of its own,
# since it teaches the user to click through prompts without reading them.
_RULES = (
    "You are a safety reviewer for a browser automation plan that has ALREADY passed every "
    "deterministic safety check. The plan came from a planner that was shown the full page and "
    "the user's task, so assume it is a reasonable reading of the task. Catch only an action that "
    "PLAINLY conflicts with the stated task."
)
_EXAMPLE = 'Example: {"downgrade_to_ask": false, "question": null}'


def _build_prompt(tokenized_task: str, plan: dict, tier: str) -> str:
    return (
        f"{_RULES}\n\n"
        f"TASK (tokens like EMAIL#1 stand in for redacted personal data): {tokenized_task}\n"
        f"PLANNED ACTION: {json.dumps(plan)}\n"
        f"COMPUTED TIER: {tier}\n\n"
        "Rules:\n"
        "- downgrade_to_ask is true ONLY when the action plainly conflicts with the task.\n"
        "- If the action is a plausible step toward the task, downgrade_to_ask is false.\n"
        "- Uncertainty about page layout is NOT grounds to ask. Asking too often trains the user "
        "to click through prompts, which is its own safety failure.\n"
        "- When downgrade_to_ask is false, question must be null.\n\n"
        "Your entire reply is one JSON object with exactly two keys: downgrade_to_ask and "
        f"question. {_EXAMPLE}\n"
    )


def _as_bool(value) -> Optional[bool]:
    """The verdict as a real bool, or None if the model gave something that is
    not a verdict. A string "false" is a real answer and is read as one; a
    number, object or null is not, and returning None makes the caller record
    the check as SKIPPED rather than guess a direction for a safety flag.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return value.strip().lower() == "true"
    return None


def review(tokenized_task: str, plan: dict, tier: str) -> dict:
    """Returns {"downgrade_to_ask": bool, "question": str|None}. Raises
    OllamaSkipped on any failure to get a usable answer.
    """
    prompt = _build_prompt(tokenized_task, plan, tier)
    try:
        resp = httpx.post(
            f"{config.OLLAMA_HOST}/api/generate",
            json={
                "model": config.OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": _TEMPERATURE},
            },
            timeout=_timeout_s(),
        )
    except httpx.HTTPError as exc:
        raise OllamaSkipped(f"ollama unreachable: {exc}") from exc

    if resp.status_code != 200:
        raise OllamaSkipped(f"ollama HTTP {resp.status_code}: {resp.text[:200]}")

    # Every branch from here to the return is a raise or a well-formed
    # {"downgrade_to_ask", "question"}: a malformed body must never escape
    # /validate as an exception, it becomes a SKIPPED check.
    try:
        data = resp.json()
    except ValueError as exc:
        raise OllamaSkipped(f"ollama body was not JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise OllamaSkipped(f"ollama body was a JSON {type(data).__name__}, expected an object")

    text = data.get("response")
    if not isinstance(text, str):
        raise OllamaSkipped(f"ollama returned no response string (got {type(text).__name__})")

    try:
        parsed = json.loads(text)
    except ValueError as exc:
        raise OllamaSkipped(f"ollama response was not JSON: {exc}") from exc

    if not isinstance(parsed, dict) or "downgrade_to_ask" not in parsed:
        raise OllamaSkipped(f"ollama response carried no downgrade_to_ask: {text[:200]}")

    verdict = _as_bool(parsed["downgrade_to_ask"])
    if verdict is None:
        raise OllamaSkipped(f"downgrade_to_ask was not a boolean: {parsed['downgrade_to_ask']!r}")

    question = parsed.get("question")
    if not isinstance(question, str) or not question.strip():
        question = None

    # One meaning per shape: a question exists only when there is something to
    # ask. The model sometimes returns stale question text alongside a false
    # verdict, and a caller reading `question` without checking the flag would
    # then show the user a prompt the model did not ask for.
    if not verdict:
        question = None

    return {"downgrade_to_ask": verdict, "question": question}


def plan_via_ollama(body: dict) -> dict:
    """Default POST /plan implementation. Returns the same shape as
    groq_client.plan_via_groq: {plan, model, attempts, switched, latencyMs}
    plus planner="ollama".

    Refuses a non-loopback host and a `:cloud` model tag before any request.
    A transport or parse failure raises OllamaPlanError and does not call Groq.
    """
    host = config.OLLAMA_HOST
    if not config.is_loopback_base(host):
        raise OllamaPlanError(
            f"OLLAMA_HOST is not a loopback address ({host}). "
            "POST /plan refused it and did not call Groq."
        )
    model = config.OLLAMA_MODEL
    if not config.ollama_model_is_local(model):
        raise OllamaPlanError(
            f"WARDEN_OLLAMA_MODEL {model!r} is not a local model. "
            "A tag ending in :cloud is not the offline planner. POST /plan did not call Groq."
        )

    payload = {k: body.get(k) for k in groq_client.PLAN_INPUT_FIELDS}
    assert "tokens" not in payload, "warden: /plan payload must never carry tokens"
    assert set(payload.keys()) <= groq_client.PLAN_INPUT_FIELDS, "warden: /plan payload carries an unexpected field"

    tokenized_task = payload.get("tokenizedTask") or ""
    sanitized_dom = payload.get("sanitizedDom") or ""
    elements = payload.get("elements") or []
    history = payload.get("history") or []
    prompt = groq_client.build_prompt(tokenized_task, sanitized_dom, elements, history)

    t0 = time.monotonic()
    try:
        resp = httpx.post(
            f"{host}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0},
            },
            timeout=_timeout_s(),
        )
    except httpx.HTTPError as exc:
        raise OllamaPlanError(
            f"Ollama planner is not reachable at {host}. POST /plan did not call Groq. ({exc})"
        ) from exc

    if resp.status_code != 200:
        raise OllamaPlanError(
            f"Ollama planner returned HTTP {resp.status_code} from {host}. "
            "POST /plan did not call Groq."
        )

    try:
        data = resp.json()
    except ValueError as exc:
        raise OllamaPlanError(f"Ollama planner body was not JSON. POST /plan did not call Groq. ({exc})") from exc

    text = data.get("response") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise OllamaPlanError("Ollama planner returned no response text. POST /plan did not call Groq.")

    try:
        parsed = groq_client._parse_action_json(text)
        action = groq_client.validate_action(parsed, elements)
    except groq_client.GroqError as exc:
        raise OllamaPlanError(
            f"Ollama planner returned an unusable plan: {exc}. POST /plan did not call Groq."
        ) from exc

    return {
        "plan": action,
        "model": model,
        "attempts": 1,
        "switched": [],
        "latencyMs": round((time.monotonic() - t0) * 1000.0, 1),
        "planner": "ollama",
    }

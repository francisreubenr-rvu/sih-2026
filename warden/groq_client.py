"""groq_client.py: optional POST /plan path.

The default planner (WARDEN_PLANNER unset or "groq"). WARDEN_PLANNER=ollama
selects local Ollama (ollama_client.plan_via_ollama) instead; this module is
not the offline path. The endpoint is config.GROQ_BASE_URL.

Groq fallback chain:

Mirrors the strict-JSON validation already in extension/background.js
(validateAction / ALLOWED_ACTIONS / ACTION_KEYS) so the Warden and the
extension agree on what a valid plan looks like -- read background.js lines
6-7 and 824-843 before changing this.

Hard rule enforced in code, not just commented: the payload built for Groq
is assembled from a fixed, named set of fields (tokenized_task,
sanitized_dom, elements, history) and is asserted, before the request is
sent, to contain no `tokens` key and no key outside that set. See
build_prompt() and plan_via_groq()'s assertion.
"""

import json
import threading
import time
from typing import Optional

import httpx

import config

ALLOWED_ACTIONS = ["click", "type", "scroll", "wait", "finish"]
ACTION_KEYS = {"action", "target_selector", "coordinates", "value", "reasoning_token"}

# The only fields ever allowed into a Groq-bound payload. Never "tokens",
# never a raw value, never a screenshot.
PLAN_INPUT_FIELDS = {"tokenizedTask", "sanitizedDom", "elements", "history"}


class GroqError(Exception):
    def __init__(self, message: str, switched: Optional[list] = None):
        super().__init__(message)
        self.switched = switched or []


def build_prompt(tokenized_task: str, sanitized_dom: str, elements: list, history: list) -> str:
    lines = [
        "You are a browser automation planner. You receive only sanitised material:",
        "personal data has already been replaced with placeholder tokens like EMAIL#1, PHONE#1.",
        "",
        f"USER TASK: {tokenized_task}",
        "",
        "SANITISED DOM (truncated):",
        (sanitized_dom or "")[:4000],
        "",
        "SCENE ELEMENTS:",
    ]
    for el in elements or []:
        lines.append(
            f"- {el.get('selector')} @ ({el.get('x')},{el.get('y')}) "
            f"fieldType={el.get('fieldType')} label=\"{el.get('label')}\" "
            f"[{'filled' if el.get('filled') else 'empty'}]"
        )
    if history:
        lines.append("")
        lines.append("RECENT ACTION HISTORY:")
        for h in history:
            lines.append(f"- {h}")
    lines += [
        "",
        "ALLOWED ACTIONS (choose exactly one): click, type, scroll, wait, finish",
        "",
        "RESPOND WITH A SINGLE JSON OBJECT, NO OTHER TEXT:",
        '{"action":"click|type|scroll|wait|finish","target_selector":"the element key exactly as listed (e.g. e3) or null",'
        '"coordinates":{"x":0,"y":0},"value":"text or null","reasoning_token":"brief, no PII"}',
        "",
        "RULES:",
        "- One action per response.",
        "- STATUS lines are the page's own status messages. When they or the action history show "
        "every part of USER TASK is done, choose finish. Do not repeat an action the history "
        "shows already succeeded.",
        "- USER TASK may contain placeholder tokens (e.g. EMAIL#1, PHONE#1). When a value should "
        "be that data, emit the literal token as value, exactly as it appears in USER TASK. Never "
        "invent a token not present there.",
        "- reasoning_token is one brief sentence and must contain no PII.",
        "- Valid JSON only: no markdown fences, no extra text, no extra keys.",
    ]
    return "\n".join(lines)


def _parse_action_json(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1] if raw.count("```") >= 2 else raw
        raw = raw.removeprefix("json").strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end <= start:
        raise GroqError("no JSON object found in model response")
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise GroqError(f"JSON parse error: {exc}") from exc


def validate_action(raw: dict, elements: list) -> dict:
    if not isinstance(raw, dict):
        raise GroqError("action is not an object")
    extra = set(raw.keys()) - ACTION_KEYS
    if extra:
        raise GroqError(f"unexpected keys: {sorted(extra)}")
    if raw.get("action") not in ALLOWED_ACTIONS:
        raise GroqError(f"invalid action: {raw.get('action')!r}")
    coords = raw.get("coordinates") or {"x": 0, "y": 0}
    if not isinstance(coords, dict) or not _is_finite(coords.get("x")) or not _is_finite(coords.get("y")):
        raise GroqError("coordinates must be finite numbers")
    target = raw.get("target_selector")
    if target is not None:
        if not isinstance(target, str):
            raise GroqError("target_selector must be a string or null")
        if not any(el.get("selector") == target for el in elements or []):
            raise GroqError(f"target_selector not in scene: {target}")
    value = raw.get("value")
    if value is not None and not isinstance(value, str):
        raise GroqError("value must be a string or null")
    reasoning = raw.get("reasoning_token")
    if reasoning is not None and not isinstance(reasoning, str):
        raise GroqError("reasoning_token must be a string")
    return {
        "action": raw["action"],
        "target_selector": target,
        "coordinates": {"x": coords["x"], "y": coords["y"]},
        "value": value,
        "reasoning_token": reasoning or "",
    }


def _is_finite(n) -> bool:
    return isinstance(n, (int, float)) and n == n and n not in (float("inf"), float("-inf"))


# One pooled client for the process (3 October 2026). httpx.post() opened a new
# connection, so a new TLS handshake to Groq, on every plan; a kept-alive connection
# removes that from each step. httpx.Client is safe to share between threads.
_client: Optional[httpx.Client] = None
_client_lock = threading.Lock()


def _post(url: str, **kwargs) -> httpx.Response:
    global _client
    with _client_lock:
        if _client is None:
            _client = httpx.Client()
    return _client.post(url, **kwargs)


def _call_groq_model(model: str, prompt: str) -> str:
    resp = _post(
        f"{config.GROQ_BASE_URL}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.GROQ_API_KEY}",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            # Deterministic plans. Without it Groq samples at its default temperature and the same
            # model answered the same scene differently between runs (30 September 2026:
            # account-type-email wrong in fastpath-bench-v01, right in groq-settings-bench-v01).
            # The model ranking in cloud-model-bench-groq-v02 was measured at temperature 0.
            "temperature": 0,
        },
        timeout=config.GROQ_TIMEOUT_S,
    )
    if resp.status_code != 200:
        raise GroqError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    # A 200 whose body is not the expected shape is an unparseable body like any other and moves
    # down the chain. Before 3 October 2026 a ValueError or AttributeError here escaped the
    # chain's except clauses and /plan answered 500.
    try:
        text = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise GroqError(f"Groq returned an unparseable body ({type(exc).__name__})") from exc
    if not isinstance(text, str) or not text:
        raise GroqError("Groq returned no content")
    return text


def plan_via_groq(body: dict) -> dict:
    """body is the raw /plan request JSON. Runs the fallback chain and
    returns {plan, model, attempts, switched, latencyMs}.

    Hard assertion: the payload actually sent never carries a `tokens` key or
    any key outside PLAN_INPUT_FIELDS. This is the code-level enforcement the
    spec asks for, not just a comment -- app.py additionally refuses the
    whole request up front if the caller's body includes "tokens" at all.
    """
    if not config.groq_configured():
        raise GroqError("GROQ_API_KEY is not configured")

    payload = {k: body.get(k) for k in PLAN_INPUT_FIELDS}
    assert "tokens" not in payload, "warden: /plan payload must never carry tokens"
    assert set(payload.keys()) <= PLAN_INPUT_FIELDS, "warden: /plan payload carries an unexpected field"

    tokenized_task = payload.get("tokenizedTask") or ""
    sanitized_dom = payload.get("sanitizedDom") or ""
    elements = payload.get("elements") or []
    history = payload.get("history") or []

    prompt = build_prompt(tokenized_task, sanitized_dom, elements, history)

    switched: list[str] = []
    last_error: Optional[str] = None
    t0 = time.monotonic()

    for model in config.GROQ_MODEL_CHAIN:
        try:
            raw_text = _call_groq_model(model, prompt)
            parsed = _parse_action_json(raw_text)
            action = validate_action(parsed, elements)
            latency_ms = (time.monotonic() - t0) * 1000.0
            return {
                "plan": action,
                "model": model,
                "attempts": len(switched) + 1,
                "switched": switched,
                "latencyMs": round(latency_ms, 1),
            }
        except httpx.TimeoutException as exc:
            last_error = f"{model}: timeout ({exc})"
            switched.append(model)
        except httpx.HTTPError as exc:
            last_error = f"{model}: transport error ({exc})"
            switched.append(model)
        except GroqError as exc:
            last_error = f"{model}: {exc}"
            switched.append(model)

    raise GroqError(f"every model in the fallback chain failed; last error: {last_error}", switched=switched)

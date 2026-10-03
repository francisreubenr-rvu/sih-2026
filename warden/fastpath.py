"""fastpath.py: optional decision-model fast path in front of the /plan LLM.

A decision model (TypeSafe Jev in the cloud, or Laya on this machine) cannot
write text. It can pick one option from a list with a calibrated probability.
Most browser steps are exactly that: click one of the controls on the page,
type one of the task's vault tokens into one of its fields, or finish. So the
fast path lists those actions, asks the decision model to pick one, and hands
the step to the LLM planner when it cannot be trusted to:

  * the model picks the explicit "none of these" option,
  * the model says the task needs typed text that is not a vault token
    (a search phrase, a message body: something only an LLM can write), or
  * the chosen option's probability is under WARDEN_FAST_PATH_MIN_CONFIDENCE.

Measured on 29 September 2026 (Docs/decisions/brain-cloud-models-jev.md), Jev
alone answered a free-text step wrongly at confidence 1.0, so the confidence
threshold is not enough by itself; the other two exits exist for that case.

Input is the same sanitized material the LLM planner gets, after the same
egress guard in app.dispatch_plan. For Jev that material leaves the machine;
for Laya it does not. The plan it returns passes groq_client.validate_action
like any other.

Selected by WARDEN_FAST_PATH=jev|laya. Unset (the default) means off.

Jev is disabled (Francis, 2 October 2026: "disabled, but not deleted"). The code
stays and its tests still run, but WARDEN_FAST_PATH=jev resolves to off and no
body is sent to Jev. Re-enabling it is a code change to JEV_ENABLED, recorded
with a decision, not an environment variable.

The Laya fast path is gated the same way (LAYA_FASTPATH_ENABLED, 3 October 2026):
Laya fast-path training was parked on 2 October and no checkpoint passed the bar,
so WARDEN_FAST_PATH=laya resolves to off until a decision flips the constant. Its
checkpoint is WARDEN_FAST_PATH_LAYA_MODEL (config.fast_path_laya_model), separate
from the reviewer's.
"""

import os
import re
import threading
import time
from typing import Optional

import httpx

import config
import groq_client

ESCAPE = "none of these"
CLICKABLE = {"button", "link", "a", "submit", "checkbox", "radio", "select", "option", "summary", "menuitem", "tab"}
_TOKEN_RE = re.compile(r"\b[A-Z][A-Z0-9]*#\d+\b")

QUESTION_NEXT = (
    "Which single browser action should happen next to move the task forward? "
    "Do not repeat an action that is already done."
)
QUESTION_FREE_TEXT = (
    "To finish the task, must someone type words or numbers that are not one of the listed placeholder tokens?"
)


class FastPathError(Exception):
    pass


# See the module docstring. Only a code change flips these; tests set them to keep coverage.
JEV_ENABLED = False
LAYA_FASTPATH_ENABLED = False


def requested() -> str:
    return os.environ.get("WARDEN_FAST_PATH", "").strip().lower()


def jev_disabled_request() -> bool:
    """WARDEN_FAST_PATH=jev was set while Jev is disabled (reported by /health)."""
    return requested() == "jev" and not JEV_ENABLED


def laya_disabled_request() -> bool:
    """WARDEN_FAST_PATH=laya was set while the Laya fast path is disabled (reported by /health)."""
    return requested() == "laya" and not LAYA_FASTPATH_ENABLED


def mode() -> str:
    raw = requested()
    if raw in ("", "off", "0", "false", "none"):
        return "off"
    if raw == "jev" and not JEV_ENABLED:
        return "off"
    if raw == "laya" and not LAYA_FASTPATH_ENABLED:
        return "off"
    if raw in ("jev", "laya"):
        return raw
    return "invalid"


def min_confidence() -> float:
    try:
        return float(os.environ.get("WARDEN_FAST_PATH_MIN_CONFIDENCE", "0.9"))
    except ValueError:
        return 0.9


def destination(backend: str) -> Optional[str]:
    return {"jev": "cloud", "laya": "local"}.get(backend)


def task_tokens(tokenized_task: str) -> list:
    return sorted(set(_TOKEN_RE.findall(tokenized_task or "")))


def option_table(body: dict, compact: bool = False) -> list:
    """[(key, action, description)] for every action the scene allows.

    `action` is the plan string ("click #save", "type #email EMAIL#1", "finish", ESCAPE). The
    default key is the action itself, as Jev was measured with. compact=True (Laya) uses short
    keys and puts the field label first: Laya gives each option only the first few tokens of
    "key: description" (median 12 on these scenes), and long keys cut the label off, so several
    options rendered identically (61 of 200 training steps on 30 September 2026).
    """
    tokens = task_tokens(body.get("tokenizedTask") or "")
    rows = []
    for el in body.get("elements") or []:
        sel = el.get("selector")
        if not isinstance(sel, str) or not sel:
            continue
        kind = str(el.get("fieldType") or "").lower()
        label = str(el.get("label") or "").strip()[:80]
        if kind in CLICKABLE:
            desc = f'click "{label}"' if compact else f'Click the {kind} "{label}"'
            rows.append((f"click {sel}", desc))
        else:
            state = "already filled" if el.get("filled") else "empty"
            for tok in tokens:
                desc = (f'"{label}" gets {tok}' + (" (filled)" if el.get("filled") else "")) if compact \
                    else f'Type {tok} into the {kind or "text"} field "{label}" ({state})'
                rows.append((f"type {sel} {tok}", desc))
    rows.append(("finish", "finish: the task is done" if compact else "The task is complete; nothing is left to do"))
    rows.append((ESCAPE, "none of these" if compact else "None of these: the next step needs something not listed here"))
    seen, table = set(), []
    for i, (action, desc) in enumerate(rows):
        if action in seen:
            continue
        seen.add(action)
        table.append((f"o{len(table) + 1}" if compact else action, action, desc))
    return table


def options(body: dict, compact: bool = False) -> dict:
    """Option key -> description, for every action the scene allows."""
    return {key: desc for key, _, desc in option_table(body, compact)}


def state_for(body: dict) -> dict:
    history = []
    for h in body.get("history") or []:
        if isinstance(h, dict):
            parts = [str(h.get("action") or ""), str(h.get("target") or ""), str(h.get("value") or "")]
            history.append(" ".join(p for p in parts if p).strip() + f" ({h.get('status', 'ok')})")
        else:
            history.append(str(h))
    return {
        "task": body.get("tokenizedTask") or "",
        "placeholder_tokens": task_tokens(body.get("tokenizedTask") or "") or ["none"],
        "page": (body.get("sanitizedDom") or "")[:4000],
        "done_so_far": history or ["nothing yet"],
    }


def questions(body: dict, compact: bool = False) -> dict:
    return {
        "next": {"type": "choice", "instructions": QUESTION_NEXT, "criteria": options(body, compact)},
        "free_text": {"type": "noul", "instructions": QUESTION_FREE_TEXT},
    }


# ---- backends -----------------------------------------------------------------------------------

def _ask_jev(state: dict, qs: dict) -> tuple:
    key = (os.environ.get("JEV_API_KEY") or "").strip()
    if not key:
        raise FastPathError("JEV_API_KEY is not configured")
    base = os.environ.get("JEV_BASE_URL", "https://api.typesafe.ai/v1").rstrip("/")
    resp = httpx.post(
        f"{base}/systemone",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": os.environ.get("JEV_MODEL", "jev-latest"), "state": state, "questions": qs},
        timeout=float(os.environ.get("WARDEN_JEV_TIMEOUT_S", "5")),
    )
    if resp.status_code != 200:
        raise FastPathError(f"Jev HTTP {resp.status_code}")
    data = resp.json()
    return data["answers"], data.get("model") or "jev"


_LAYA = {"router": None, "lock": threading.Lock()}


def _laya_router():
    """The stock Laya Router, or, when WARDEN_FAST_PATH_LAYA_MODEL names a local checkpoint
    directory (for example one made by scripts/laya-finetune/train_cpu.py), a laya.Agent on it."""
    with _LAYA["lock"]:
        if _LAYA["router"] is None:
            import laya  # optional dependency, imported only when selected

            path = config.fast_path_laya_model() or ""
            device = os.environ.get("WARDEN_LAYA_DEVICE", "cpu")
            _LAYA["router"] = laya.Agent(path, device=device) if path else laya.Router()
            _LAYA["name"] = "laya:" + os.path.basename(path.rstrip("/")) if path else None
        return _LAYA["router"]


def _ask_laya(state: dict, qs: dict) -> tuple:
    out = _laya_router().predict(state, qs)
    return out["answers"], _LAYA.get("name") or f"laya:{(out.get('routing') or {}).get('model', 'english')}"


BACKENDS = {"jev": _ask_jev, "laya": _ask_laya}


def warm() -> None:
    """Load Laya ahead of the first step, off the request path. No-op for Jev."""
    if mode() == "laya":
        try:
            _laya_router().predict({"task": "warm up"}, {"q": {"type": "noul", "instructions": "Is this a test?"}})
        except Exception:  # noqa: BLE001 -- warming is best effort; the request path reports errors
            pass


# ---- decision -----------------------------------------------------------------------------------

def decide(body: dict, backend: Optional[str] = None) -> dict:
    """Ask the decision model. Returns {"used": bool, "reason", "choice", "confidence",
    "freeTextProbability", "model", "latencyMs", "plan"?}. Never raises for a model answer
    it does not trust; raises FastPathError only when the backend itself fails."""
    backend = backend or mode()
    ask = BACKENDS.get(backend)
    if ask is None:
        raise FastPathError(f"unknown fast path backend {backend!r}")
    elements = body.get("elements") or []
    compact = backend == "laya"
    table = option_table(body, compact)
    to_action = {key: action for key, action, _ in table}
    qs = questions(body, compact)
    t0 = time.monotonic()
    answers, model = ask(state_for(body), qs)
    latency = round((time.monotonic() - t0) * 1000.0, 1)

    nxt = answers.get("next") or {}
    key = nxt.get("choice")
    probs = nxt.get("probabilities") or {}
    confidence = probs.get(key)
    if not isinstance(confidence, (int, float)):
        confidence = nxt.get("answer_confidence", nxt.get("confidence"))
    choice = to_action.get(key, key)
    free_p = (answers.get("free_text") or {}).get("noul")
    record = {
        "backend": backend,
        "destination": destination(backend),
        "model": model,
        "choice": choice,
        "confidence": confidence,
        "freeTextProbability": free_p,
        "latencyMs": latency,
    }

    if key not in qs["next"]["criteria"]:
        return {**record, "used": False, "reason": "answer outside the offered options"}
    if choice == ESCAPE:
        return {**record, "used": False, "reason": "model chose none of these"}
    if isinstance(free_p, (int, float)) and free_p >= 0.5:
        return {**record, "used": False, "reason": "task needs typed text that is not a token"}
    if not isinstance(confidence, (int, float)) or confidence < min_confidence():
        return {**record, "used": False, "reason": f"confidence under {min_confidence()}"}

    plan = _plan_from_choice(choice, elements)
    try:
        plan = groq_client.validate_action(plan, elements)
    except groq_client.GroqError as exc:
        return {**record, "used": False, "reason": f"plan failed validation: {exc}"}
    return {**record, "used": True, "reason": "accepted", "plan": plan}


def _plan_from_choice(choice: str, elements: list) -> dict:
    if choice == "finish":
        return {"action": "finish", "target_selector": None, "coordinates": {"x": 0, "y": 0},
                "value": None, "reasoning_token": "fast path: task complete"}
    # "click <selector>" or "type <selector> <TOKEN>". A selector may contain spaces ("#nav a",
    # "form #email"); a token never does. Splitting at the first space (before 3 October 2026)
    # turned "click #nav a" into a click on "#nav" with value "a", a different element.
    verb, _, rest = choice.partition(" ")
    if verb == "type":
        selector, _, value = rest.rpartition(" ")
    else:
        selector, value = rest, ""
    el = next((e for e in elements if e.get("selector") == selector), {})
    coords = {"x": el.get("x", 0) or 0, "y": el.get("y", 0) or 0}
    return {"action": verb, "target_selector": selector, "coordinates": coords,
            "value": value or None, "reasoning_token": f"fast path: {verb} {selector}"}


def plan_or_none(body: dict) -> tuple:
    """(result or None, fastPath record or None) for app.dispatch_plan. A backend failure is
    recorded and returns None, so the LLM planner still answers: the fast path can only ever
    remove a planner call, never block one."""
    backend = mode()
    if backend == "off":
        return None, None
    if backend == "invalid":
        return None, {"used": False, "reason": "WARDEN_FAST_PATH must be jev, laya or unset"}
    try:
        rec = decide(body, backend)
    except Exception as exc:  # noqa: BLE001 -- see docstring
        return None, {"backend": backend, "used": False, "reason": f"backend error: {type(exc).__name__}: {str(exc)[:120]}"}
    if not rec.get("used"):
        return None, {k: v for k, v in rec.items() if k != "plan"}
    result = {
        "plan": rec["plan"],
        "model": rec["model"],
        "attempts": 1,
        "switched": [],
        "latencyMs": rec["latencyMs"],
        "planner": backend,
        "destination": rec["destination"],
    }
    return result, {k: v for k, v in rec.items() if k != "plan"}

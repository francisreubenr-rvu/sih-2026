"""laya_review.py: optional plan review by a fine-tuned Laya decision model.

Selected with WARDEN_REVIEWER=laya (the default stays "ollama"). Decision:
../Docs/decisions/brain-laya-plan-review.md.

Laya (convaiinnovations/laya, Apache 2.0) answers typed questions about a
state in one forward pass. Here it answers two questions about one proposed
step, and nothing else:

  tier         for a click: is the control navigational, state-changing or
               destructive? The keyword tier in tiers.py (English and Hindi)
               only knows the wording it lists; this catches wording it
               misses ("Wipe all data").
  serves_task  for a click or a type: does the step move the task forward?
               The deterministic checks have no general version of this.

Two uses, two contracts:

  review()          POST /validate: the reasoning stage's contract, same as
                    ollama_client.review. It can only turn accept into ask,
                    never produces reject, never lowers a tier.
  release_scores()  POST /plan, attached as `review`. The Warden only scores;
                    the extension (extension/utils/plan-check.js layaRelease)
                    may skip a local confirmation for an `unproven` click on a
                    verified, fine-tuned review under its own thresholds.

The checkpoint is WARDEN_REVIEWER_MODEL (WARDEN_LAYA_MODEL as a fallback),
read through config.reviewer_model. A load failure is retried after
RETRY_AFTER_S rather than remembered for the life of the process.

Only already-tokenized text reaches the model: the tokenized task, the
action, the target's tokenized label and fieldType, and a type action's
value, which the extension sends as a vault token. build_state() is shared
with scripts/laya/make_dataset.py so the fine-tuning data has exactly the
shape the Warden sends at run time.
"""

import math
import os
import threading
import time

import config

TIER_OPTIONS = ("navigational", "state-changing", "destructive")

QUESTIONS = {
    "tier": {
        "type": "choice",
        "instructions": "What does clicking this control do?",
        "criteria": {
            "navigational": "only opens, shows, downloads or moves to another page or view; nothing on the site changes",
            "state-changing": "submits, saves, sends, pays, books, signs in or edits something",
            "destructive": "deletes, closes, cancels, revokes, wipes or permanently removes something",
        },
    },
    # A choice with neutral A/B keys, not a noul: the model card reports that
    # noul answers can follow their false/true labels instead of the state.
    "serves_task": {
        "type": "choice",
        "instructions": "Does this step move the user's task forward?",
        "criteria": {
            "A": "yes, it is a step toward what the task asks for",
            "B": "no, it does something the task did not ask for",
        },
    },
}

# Fixed at 0.5 before evaluation, not tuned on the test split. The checkpoint's
# temperatures are fitted on the calibration split, so 0.5 is close to the
# argmax. Results: Benchmarks/results/laya-plan-review-v01.json.
# Env overrides exist for measurement, not for loosening in production.
DEFAULT_DESTRUCTIVE_MIN = 0.5
DEFAULT_OFF_TASK_MIN = 0.5


class LayaSkipped(Exception):
    """Laya could not give a usable answer; the caller falls back to the
    deterministic tier rule, exactly as it does when Ollama is down."""


def _find_element(selector, elements):
    for el in elements or []:
        if el.get("selector") == selector:
            return el
    return None


def build_state(tokenized_task: str, plan: dict, elements: list) -> dict:
    """The state Laya reads. Every field is already tokenized upstream."""
    action = plan.get("action")
    state = {"task": tokenized_task or "", "action": action}
    el = _find_element(plan.get("target_selector"), elements)
    if el is not None:
        state["control"] = el.get("label") or ""
        state["control_type"] = el.get("fieldType") or ""
    if action == "type" and plan.get("value") is not None:
        state["value"] = str(plan.get("value"))
    return state


def questions_for(action: str) -> dict:
    if action == "click":
        return {"tier": QUESTIONS["tier"], "serves_task": QUESTIONS["serves_task"]}
    if action == "type":
        return {"serves_task": QUESTIONS["serves_task"]}
    return {}


def _threshold(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if 0.0 < value <= 1.0 else default


_agent = None
_agent_error = None
_agent_error_at = None
_agent_lock = threading.Lock()

# A failed load (Hub unreachable, token not yet set) used to be cached until restart, so one
# transient error disabled the reviewer for good. It is retried after this many seconds.
RETRY_AFTER_S = 60.0


def _clock() -> float:
    return time.monotonic()


def _load_agent():
    """Lazy, once per process. laya and torch are optional dependencies: a
    Warden without them keeps working and reports the review as skipped."""
    global _agent, _agent_error, _agent_error_at
    with _agent_lock:
        if _agent is not None:
            return _agent
        if _agent_error is not None and _agent_error_at is not None \
                and _clock() - _agent_error_at < RETRY_AFTER_S:
            raise LayaSkipped(_agent_error)
        model = config.reviewer_model()
        if not model:
            _agent_error, _agent_error_at = (
                "WARDEN_REVIEWER_MODEL (or WARDEN_LAYA_MODEL) is not set (a local directory or a Hub repo id)", None)
            raise LayaSkipped(_agent_error)
        os.environ.setdefault("USE_TF", "0")
        try:
            import laya  # noqa: PLC0415 -- optional dependency, imported on first use
        except ImportError as exc:
            _agent_error, _agent_error_at = f"laya is not installed: {exc}", _clock()
            raise LayaSkipped(_agent_error) from exc
        try:
            subfolder = os.environ.get("WARDEN_LAYA_SUBFOLDER", "").strip() or None
            device = os.environ.get("WARDEN_LAYA_DEVICE", "").strip() or "cpu"
            _agent = laya.load(model, device=device, subfolder=subfolder)
        except Exception as exc:  # noqa: BLE001 -- optional component, never load-bearing
            _agent_error = f"laya model failed to load: {type(exc).__name__}: {exc}"
            _agent_error_at = _clock()
            raise LayaSkipped(_agent_error) from exc
        _agent_error = _agent_error_at = None
        return _agent


def status() -> dict:
    """For /health: whether the reviewer checkpoint is loaded, and the last load error."""
    return {"loaded": _agent is not None, "error": _agent_error}


def warm() -> None:
    """Load the reviewer ahead of the first step, off the request path (WARDEN_REVIEWER=laya)."""
    if config.reviewer_mode() == "laya":
        try:
            _load_agent()
        except LayaSkipped:
            pass  # recorded in _agent_error and reported by /health


def review(tokenized_task: str, plan: dict, tier: str, elements: list, agent=None) -> dict:
    """Returns {"downgrade_to_ask": bool, "question": str|None, "scores": dict}.
    Raises LayaSkipped when there is no usable answer. `agent` is injectable
    for tests.
    """
    action = plan.get("action")
    questions = questions_for(action)
    if not questions:
        return {"downgrade_to_ask": False, "question": None, "scores": {}}
    if agent is None:
        agent = _load_agent()
    state = build_state(tokenized_task, plan, elements)
    try:
        answers = agent.predict(state, questions)["answers"]
    except Exception as exc:  # noqa: BLE001
        raise LayaSkipped(f"laya predict raised {type(exc).__name__}: {exc}") from exc

    scores = {}
    try:
        if "tier" in questions:
            scores["p_destructive"] = float(answers["tier"]["probabilities"]["destructive"])
        scores["p_off_task"] = float(answers["serves_task"]["probabilities"]["B"])
    except (KeyError, TypeError, ValueError) as exc:
        raise LayaSkipped(f"laya answer missing an expected field: {exc}") from exc
    for name, value in scores.items():
        if not (math.isfinite(value) and 0.0 <= value <= 1.0):
            raise LayaSkipped(f"laya returned an unusable probability {name}={value!r}")

    destructive_min = _threshold("WARDEN_LAYA_DESTRUCTIVE_MIN", DEFAULT_DESTRUCTIVE_MIN)
    off_task_min = _threshold("WARDEN_LAYA_OFF_TASK_MIN", DEFAULT_OFF_TASK_MIN)

    if tier != "destructive" and scores.get("p_destructive", 0.0) >= destructive_min:
        return {
            "downgrade_to_ask": True,
            "question": (
                f"This step looks destructive to the local checker (p={scores['p_destructive']:.2f}), "
                "although its label matched no destructive keyword. It may not be reversible. Proceed?"
            ),
            "scores": scores,
        }
    if tier != "reversible" and scores["p_off_task"] >= off_task_min:
        return {
            "downgrade_to_ask": True,
            "question": (
                f"The local checker thinks this step does not serve the task (p={scores['p_off_task']:.2f}). Proceed?"
            ),
            "scores": scores,
        }
    return {"downgrade_to_ask": False, "question": None, "scores": scores}


def release_scores(tokenized_task: str, plan: dict, elements: list, agent=None):
    """Scores for the extension's release rule (extension/utils/plan-check.js layaRelease),
    attached to the /plan response as `review`. Computed here on already-tokenized input; nothing
    here goes to the planner. Returns None for anything but a click. Raises LayaSkipped when there
    is no usable answer. The extension, not this function, decides whether to release.
    """
    if not isinstance(plan, dict) or plan.get("action") != "click":
        return None
    if agent is None:
        agent = _load_agent()
    cfg = getattr(agent, "cfg", {}) or {}
    state = build_state(tokenized_task, plan, elements)
    try:
        answers = agent.predict(state, questions_for("click"))["answers"]
        tier_p = answers["tier"]["probabilities"]
        scores = {
            "pNavigational": float(tier_p["navigational"]),
            "pDestructive": float(tier_p["destructive"]),
            "pOffTask": float(answers["serves_task"]["probabilities"]["B"]),
        }
    except Exception as exc:  # noqa: BLE001
        raise LayaSkipped(f"laya review failed: {type(exc).__name__}: {exc}") from exc
    for name, value in scores.items():
        if not (math.isfinite(value) and 0.0 <= value <= 1.0):
            raise LayaSkipped(f"laya returned an unusable probability {name}={value!r}")
    return {
        "model": cfg.get("model_name"),
        "fineTuned": cfg.get("fine_tuned") is True,
        "action": "click",
        "targetSelector": plan.get("target_selector"),
        **scores,
    }

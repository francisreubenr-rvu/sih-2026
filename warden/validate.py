"""validate.py: POST /validate. Deterministic checks first, local reasoning
second, and the ordering between them is enforced structurally, not just by
convention: run_deterministic_checks() is the only function that can produce
a `reject`, and maybe_apply_local_reasoning() is only ever called with an
already-`accept` verdict and can only move it to `ask` (or leave it as
`accept`) -- it has no branch that returns `reject`.
"""

import math

import groq_client
import ollama_client
import tiers

ALLOWED_ACTIONS = groq_client.ALLOWED_ACTIONS
ACTION_KEYS = groq_client.ACTION_KEYS


def _is_finite_nonneg(n) -> bool:
    return isinstance(n, (int, float)) and math.isfinite(n) and n >= 0


def run_deterministic_checks(plan: dict, elements: list, tokenized_task: str) -> dict:
    """Runs every named deterministic check and returns:
        {"checks": [...], "reasons": [...], "tier": str|None, "overridden_plan": dict}
    A check list entry is {"name": str, "pass": bool}. `reasons` names every
    failed check with a short explanation. If any check fails the caller
    must reject; this function does not decide the verdict itself so it can
    report every check's outcome even when an earlier one already failed.
    """
    checks = []
    reasons = []

    def record(name, ok, reason=None):
        checks.append({"name": name, "pass": bool(ok)})
        if not ok and reason:
            reasons.append(f"{name}: {reason}")

    # 1. action in the allowed set
    action = plan.get("action") if isinstance(plan, dict) else None
    action_ok = action in ALLOWED_ACTIONS
    record("action-allowed", action_ok, f"invalid action {action!r}" if not action_ok else None)

    # 2. no unexpected keys
    if isinstance(plan, dict):
        extra = set(plan.keys()) - ACTION_KEYS
    else:
        extra = {"<plan-not-an-object>"}
    keys_ok = not extra
    record("no-unexpected-keys", keys_ok, f"unexpected keys {sorted(extra)}" if not keys_ok else None)

    # 3. selector present in the submitted scene (null selector is fine: not
    # every action targets an element)
    selector = plan.get("target_selector") if isinstance(plan, dict) else None
    if selector is None:
        selector_ok = True
    else:
        selector_ok = any(el.get("selector") == selector for el in elements or [])
    record(
        "selector-in-scene",
        selector_ok,
        f"target_selector {selector!r} not present in submitted elements" if not selector_ok else None,
    )

    # 4. coordinates finite. The frozen /validate request carries no viewport
    # width/height, so "inside the viewport" cannot be checked against a real
    # bound without fabricating one; this checks finite and non-negative and
    # is documented as a narrower check than the spec's wording implies (see
    # warden/README.md, "Spec gap" section).
    coords = plan.get("coordinates") if isinstance(plan, dict) else None
    coords_ok = (
        isinstance(coords, dict)
        and _is_finite_nonneg(coords.get("x"))
        and _is_finite_nonneg(coords.get("y"))
    )
    record("coordinates-finite", coords_ok, f"coordinates {coords!r} not finite/non-negative" if not coords_ok else None)

    # 5 & 6. operation tier + intent coherence. Both require action-allowed
    # and (for a click) selector-in-scene to have passed; if either failed,
    # report both remaining checks as failed too rather than guessing.
    tier = None
    overridden_plan = plan if isinstance(plan, dict) else {}
    if action_ok and (selector_ok or action != "click"):
        try:
            coherent_plan, overridden = tiers.apply_intent_coherence(tokenized_task, plan, elements)
            overridden_plan = coherent_plan
            tier = tiers.op_tier(coherent_plan, elements)
            record("tier-computed", True)

            intent = tiers.expresses_destructive_intent(tokenized_task)
            has_control = tiers.has_destructive_control(elements)
            if not intent:
                record("intent-coherence", True)
            elif has_control:
                record("intent-coherence", True)
            elif overridden:
                record("intent-coherence", True)
            else:
                record(
                    "intent-coherence",
                    False,
                    "task expresses destructive intent, scene holds no destructive control, "
                    "and the plan was not rewritten to finish",
                )
        except ValueError as exc:
            record("tier-computed", False, str(exc))
            record("intent-coherence", False, "skipped: tier computation failed")
    else:
        record("tier-computed", False, "skipped: action-allowed or selector-in-scene already failed")
        record("intent-coherence", False, "skipped: action-allowed or selector-in-scene already failed")

    return {"checks": checks, "reasons": reasons, "tier": tier, "overridden_plan": overridden_plan}


# Tiers that always require a human decision, decided deterministically and
# WITHOUT consulting the reasoning model.
#
# Found 13 September 2026 by running the real stack: a "Delete Account" click
# validated to verdict=accept, tier=destructive, because escalation to `ask`
# existed only inside the Ollama reasoning path and Ollama was unreachable, so
# its downgrade never fired. An optional component being down must never make
# the Warden less careful. The extension's own local gate caught it (defence in
# depth working as designed, see finding F17), but the Warden should not have
# needed rescuing.
# ONLY destructive. An earlier version also always-asked `state-changing`, and
# running it showed why that is wrong: a `type` action is state-changing, so the
# two-field login demo would stop for a human decision on every single fill.
# Over-escalation is a real failure mode, not a safe default, because it trains
# the user to click through prompts and the prompts stop carrying meaning.
#
# `state-changing` plans are still covered: the local reasoning model may
# downgrade them to `ask` when Ollama is up, and the extension independently
# re-gates every non-reversible action on its own tier computation.
ALWAYS_ASK_TIERS = {"destructive"}


def tier_requires_confirmation(tier: str) -> bool:
    return tier in ALWAYS_ASK_TIERS


def question_for_tier(tier: str, plan: dict) -> dict:
    target = plan.get("target_selector") or "the selected element"
    return {
        "id": "q-tier",
        "text": (
            f"This plan is classified {tier} and acts on {target}. "
            "It changes state that may not be reversible. Proceed?"
        ),
        "options": [
            {"id": "proceed", "label": "Proceed"},
            {"id": "skip", "label": "Skip this step"},
            {"id": "stop", "label": "Stop the run"},
        ],
    }


def _reasoning_absent(reason: str, tier: str, plan: dict) -> dict:
    """Reasoning is unavailable. Fall back to the deterministic tier rule
    rather than to a bare accept: a destructive plan still asks, exactly as
    it does when Ollama is absent.
    """
    check = {"name": "local-reasoning", "pass": None, "skipped": True, "reason": reason}
    if tier_requires_confirmation(tier):
        return {"verdict": "ask", "question": question_for_tier(tier, plan), "reasoning_check": check}
    return {"verdict": "accept", "question": None, "reasoning_check": check}


def maybe_apply_local_reasoning(tokenized_task: str, plan: dict, tier: str) -> dict:
    """Only ever called when the deterministic verdict is already `accept`.
    Returns {"verdict": "accept"|"ask", "question": dict|None,
    "reasoning_check": {"name": "local-reasoning", "pass": bool|None,
    "skipped": bool}}. Never returns "reject": there is no code path here
    that produces one.

    The two except branches below are the same guarantee the module docstring
    makes, enforced at the call boundary rather than trusted: an optional
    component must never be able to break validation or weaken a verdict. An
    exception escaping this function would fail the whole /validate request,
    which is worse for the user than a SKIPPED reasoning check, and would
    also mean the deterministic tier rule never got to speak.
    """
    try:
        result = ollama_client.review(tokenized_task, plan, tier)
    except ollama_client.OllamaSkipped as exc:
        return _reasoning_absent(str(exc), tier, plan)
    except Exception as exc:  # noqa: BLE001 -- see docstring: reasoning is optional, never load-bearing
        return _reasoning_absent(f"local reasoning raised {type(exc).__name__}: {exc}", tier, plan)

    if result["downgrade_to_ask"]:
        question_text = result.get("question") or "The local reasoning model flagged this action for review. Proceed?"
        return {
            "verdict": "ask",
            "question": {
                "id": "q1",
                "text": question_text,
                "options": [
                    {"id": "proceed", "label": "Proceed"},
                    {"id": "skip", "label": "Skip this step"},
                    {"id": "stop", "label": "Stop the run"},
                ],
            },
            "reasoning_check": {"name": "local-reasoning", "pass": False, "skipped": False},
        }

    # Reasoning found nothing, but the tier rule is independent of it: a model
    # declining to object is not permission for a destructive action.
    passed_check = {"name": "local-reasoning", "pass": True, "skipped": False}
    if tier_requires_confirmation(tier):
        return {"verdict": "ask", "question": question_for_tier(tier, plan), "reasoning_check": passed_check}
    return {"verdict": "accept", "question": None, "reasoning_check": passed_check}

"""tiers.py: operation-tier classification and the intent-coherence override.

Adapted from Prototype/shared/op-tier.mjs (the v3 reference implementation,
referenced by ROAST.md F17 and F8). Not a straight port: v3's scene carried a
closed-vocabulary `role` per control (from a 62-role taxonomy); the frozen v4
/strip and /plan contract's `elements` carry only `selector`, `label`,
`fieldType`, `filled`, `x`, `y` -- there is no role field on the wire. This
module reclassifies from label/fieldType keywords instead of roles. The
destructive-intent regex and the intent-coherence override's shape (task
expresses destructive intent + scene has no destructive control -> rewrite
the plan to the reversible "finish" action) are carried over unchanged in
spirit; the action vocabulary is v4's (click, type, scroll, wait, finish),
per extension/background.js's ALLOWED_ACTIONS, not v3's (click, fill, scroll,
extract, done).

This is a documented judgment call, not part of the frozen spec (the spec
names "operation tier computed locally" and "intent coherence" as checks but
does not give v4's exact classification algorithm since the wire schema
changed the available signal). Flagged in the delivery report.
"""

import re

TIERS = ("reversible", "navigational", "state-changing", "destructive")

# Ported verbatim (semantics unchanged) from op-tier.mjs's
# DESTRUCTIVE_INTENT_PATTERN.
DESTRUCTIVE_INTENT_RE = re.compile(
    r"\b(delete|remove|deactivat(?:e|ing|ed)|terminat(?:e|ing|ed)|eras(?:e|ing|ed)|destroy(?:ing|ed)?)\b"
    r"|\bclose (?:my|the) account\b|\bcancel (?:my|the) (?:account|subscription)\b",
    re.IGNORECASE,
)

# Keyword classification of a click target's label/fieldType, since v4
# elements carry no `role`. Kept narrow and explicit per the same tradeoff
# op-tier.mjs states for its own destructive-intent pattern: a miss costs an
# extra confirmation step (safe), not a wrong unattended action.
DESTRUCTIVE_LABEL_RE = re.compile(
    r"delete|remove|deactivat|terminat|eras|destroy|unsubscribe|close account|cancel (account|subscription)",
    re.IGNORECASE,
)
SUBMIT_LABEL_RE = re.compile(
    r"submit|save|confirm|pay|checkout|place order|purchase|send",
    re.IGNORECASE,
)
NAV_LABEL_RE = re.compile(
    r"^(go to|view|open|back|next|home|menu)\b|\blink\b",
    re.IGNORECASE,
)


def expresses_destructive_intent(task: str) -> bool:
    return bool(DESTRUCTIVE_INTENT_RE.search(task or ""))


def _find_element(selector, elements):
    for el in elements or []:
        if el.get("selector") == selector:
            return el
    return None


def has_destructive_control(elements) -> bool:
    for el in elements or []:
        haystack = f"{el.get('label') or ''} {el.get('fieldType') or ''}"
        if DESTRUCTIVE_LABEL_RE.search(haystack):
            return True
    return False


def op_tier(plan: dict, elements: list) -> str:
    """Classify `plan` (an already action-set-validated dict with an
    `action` key) into one of TIERS. Raises ValueError if `action` is
    `click` and `target_selector` does not resolve against `elements` --
    callers should run the selector-in-scene check first and treat that as
    the hard reject; this is a defensive backstop, not the primary check.
    """
    action = plan.get("action")
    if action in ("scroll", "wait", "finish"):
        return "reversible"
    if action == "type":
        return "state-changing"
    if action == "click":
        selector = plan.get("target_selector")
        el = _find_element(selector, elements)
        if el is None:
            raise ValueError(f"warden: click targets a selector not present in this scene: {selector!r}")
        haystack = f"{el.get('label') or ''} {el.get('fieldType') or ''}"
        if DESTRUCTIVE_LABEL_RE.search(haystack):
            return "destructive"
        if SUBMIT_LABEL_RE.search(haystack):
            return "state-changing"
        if NAV_LABEL_RE.search(haystack):
            return "navigational"
        # Conservative default (same reasoning as op-tier.mjs's click branch):
        # anything not proven reversible stops for confirmation.
        return "state-changing"
    raise ValueError(f"warden: unrecognized action {action!r}")


def apply_intent_coherence(task: str, plan: dict, elements: list) -> tuple[dict, bool]:
    """Returns (possibly-overridden plan, overridden: bool). Overrides to the
    reversible `finish` action when the task expresses destructive intent and
    the scene holds no destructive control -- the v4 analogue of v3's
    doneLike() rewrite.
    """
    if not expresses_destructive_intent(task):
        return plan, False
    if has_destructive_control(elements):
        return plan, False
    overridden = {
        "action": "finish",
        "target_selector": None,
        "coordinates": {"x": 0, "y": 0},
        "value": None,
        "reasoning_token": "intent-coherence override: task implies a destructive action but the scene has no destructive control",
    }
    return overridden, True

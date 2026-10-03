"""tiers.py: operation-tier classification and the intent-coherence override.

Adapted from the v3 op-tier reference implementation (referenced by ROAST.md
F17 and F8; that file is no longer in the tree). The live counterpart, which
these rules must agree with, is extension/utils/op-tier.js (test_warden.py runs
it under node for parity). Not a straight port: v3's scene carried a
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
import unicodedata

TIERS = ("reversible", "navigational", "state-changing", "destructive")

# Ported verbatim (semantics unchanged) from op-tier.mjs's
# DESTRUCTIVE_INTENT_PATTERN.
# Hindi mirrors the English list; same text and reasoning as HI_DESTRUCTIVE in
# extension/utils/op-tier.js (30 September 2026, ROAST round 28). Bare "रद्द करें"
# (Cancel) and bare "समाप्त" (Finish) are deliberately absent. The 2 October
# additions (verbs neither language had) are mirrored too; test_warden.py checks
# the two rule sets agree by running op-tier.js under node.
HI_DESTRUCTIVE = unicodedata.normalize("NFKC", (
    r"हटा|मिटा|डिलीट|रिमूव|निष्क्रिय|डीएक्टिवेट|डिएक्टिवेट|नष्ट|अनसब्सक्राइब"
    r"|(?:खाता|अकाउंट|सदस्यता|सब्सक्रिप्शन|सत्र) (?:बंद|रद्द|समाप्त)|"
    r"भूल जा|(?:समूह|ग्रुप|टीम|संगठन|चैनल|चैट|परिवार) (?:को )?छोड़|(?:साझा|शेयर) करना बंद|(?:पहुँच|पहुंच|एक्सेस|अनुमति) (?:रद्द|हटा|वापस)|वापस ले|अनलिंक|डिस्कनेक्ट|(?:फ़ैक्टरी|फैक्टरी) रीसेट|(?:ट्रैश|कचरा|रीसायकल बिन|बिन) खाली|बाहर निकाल|सदस्य(?:ों)? (?:को )?निकाल"
))
EN_DESTRUCTIVE_LABEL_EXTRA = (
    r"forget|discard|withdraw|purge|revoke|unlink|disconnect|\bwipe|\bkick\b|stop sharing|leave (?:the |this |my )?(?:group|team|organi[sz]ation|workspace|channel|chat|community|conversation|household|family)|end (?:membership|subscription|session|plan)|empty (?:trash|bin)|clear (?:all )?(?:history|data|messages|activity|chats?)|factory reset|reset to factory|void (?:transaction|payment|order)"
)
EN_DESTRUCTIVE_INTENT_EXTRA = (
    r"\b(?:forget|discard(?:ed|ing)?|withdraw(?:n|ing)?|purg(?:e|ed|ing)|revok(?:e|ed|ing)|unlink(?:ed|ing)?|disconnect(?:ed|ing)?|wip(?:e|ed|ing)|kick(?:ed|ing)?)\b|\bstop sharing\b|\bleave (?:the |this |my )?(?:group|team|organi[sz]ation|workspace|channel|chat|community|conversation|household|family)\b|\bend (?:my |the )?(?:membership|subscription|plan)\b|\bempty (?:the |my )?(?:trash|bin)\b|\bfactory reset\b"
)

DESTRUCTIVE_INTENT_RE = re.compile(
    r"\b(delete|remove|deactivat(?:e|ing|ed)|terminat(?:e|ing|ed)|eras(?:e|ing|ed)|destroy(?:ing|ed)?)\b"
    r"|\bclose (?:my|the) account\b|\bcancel (?:my|the) (?:account|subscription)\b|"
    + EN_DESTRUCTIVE_INTENT_EXTRA + "|" + HI_DESTRUCTIVE,
    re.IGNORECASE,
)

# Keyword classification of a click target's label/fieldType, since v4
# elements carry no `role`. Kept narrow and explicit per the same tradeoff
# op-tier.mjs states for its own destructive-intent pattern: a miss costs an
# extra confirmation step (safe), not a wrong unattended action.
DESTRUCTIVE_LABEL_RE = re.compile(
    r"delete|remove|deactivat|terminat|eras|destroy|unsubscribe|close account|cancel (account|subscription)|"
    + EN_DESTRUCTIVE_LABEL_EXTRA + "|" + HI_DESTRUCTIVE,
    re.IGNORECASE,
)
# Hindi submit keywords (PLAN item 8, 3 October 2026): imperative pay/send/submit/confirm/order/
# buy/save verbs, plus a bare noun only where English counts its equivalent bare (भुगतान/पेमेंट
# "pay", पुष्टि/कन्फ़र्म "confirm", सबमिट, चेकआउट). Same text and reasoning as HI_SUBMIT in
# extension/utils/op-tier.js, including the over-match guards ("जमा राशि देखें", "भेजे गए संदेश",
# "ग्राहक सेवा", "पेज 2" stay unproven); test_warden.py runs both.
HI_SUBMIT = unicodedata.normalize("NFKC", (
    r"भुगतान|पेमेंट|(?:^|\s)पे कर|अदा कर|भेज(?:ें|ो|िए|िये| दें| दो| दीजिए)|(?:सेंड|ट्रांसफ़र|ट्रांसफर|ट्रान्सफ़र|ट्रान्सफर) कर|"
    r"जमा (?:कर|कीजिए)|सबमिट|प्रस्तुत (?:कर|कीजिए)|(?:दाखिल|दाख़िल) (?:कर|कीजिए)|पुष्टि|कन्फ़र्म|कन्फर्म|(?:ऑर्डर|आर्डर) (?:कर|दें|दो|दीजिए|प्लेस)|"
    r"(?:खरीद|ख़रीद)(?:ें|ो|िए|िये|ना)|चेकआउट|सहेज(?:ें|ो|िए| लें)|सेव कर|रिचार्ज कर"
))
SUBMIT_LABEL_RE = re.compile(
    # English verbs added 3 October 2026; same list and reasoning as op-tier.js SUBMIT_LABEL_RE.
    r"submit|save|confirm|pay|checkout|place order|purchase|send|transfer|donate|subscribe|accept|agree|apply|recharge|buy|book now|book a|sign up|register|enrol|upgrade|renew|" + HI_SUBMIT,
    re.IGNORECASE,
)
# Starts with a navigation verb; "\blink\b" anywhere and "open" a new account or deposit no longer
# count (security review, 3 October 2026; same rule as op-tier.js NAV_LABEL_RE).
NAV_LABEL_RE = re.compile(
    r"^(go to|view|open(?! (?:new|an?|account)\b)|back|next|home|menu)\b",
    re.IGNORECASE,
)


# Zero-width joiners, soft hyphen, bidi controls and other invisible characters (security review,
# 3 October 2026); same set as op-tier.js INVISIBLE_RE.
_INVISIBLE_RE = re.compile("[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")


def _canonical(text) -> str:
    """Invisible characters removed, then NFKC, as op-tier.js canonical()."""
    return unicodedata.normalize("NFKC", _INVISIBLE_RE.sub("", str(text or "")))


def expresses_destructive_intent(task: str) -> bool:
    return bool(DESTRUCTIVE_INTENT_RE.search(_canonical(task)))


def _find_element(selector, elements):
    for el in elements or []:
        if el.get("selector") == selector:
            return el
    return None


def has_destructive_control(elements) -> bool:
    for el in elements or []:
        haystack = _canonical(f"{el.get('label') or ''} {el.get('fieldType') or ''}")
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
        haystack = _canonical(f"{el.get('label') or ''} {el.get('fieldType') or ''}")
        if DESTRUCTIVE_LABEL_RE.search(haystack):
            return "destructive"
        if SUBMIT_LABEL_RE.search(haystack):
            return "state-changing"
        # Navigational is matched on the label alone, as extension/utils/op-tier.js
        # does on the accessible name. Matching the label + fieldType haystack let
        # fieldType "link" satisfy \blink\b, so any link without a destructive or
        # submit keyword ("Kick from folder", "खाता बंद करें") tiered navigational
        # and accepted (ROAST round 28).
        if NAV_LABEL_RE.search(_canonical(el.get("label")).strip()):
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

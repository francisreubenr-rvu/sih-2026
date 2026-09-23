"""entities.py: GLiNER layer (Layer 2) for free-text PII regex cannot reach.

Loads urchade/gliner_multi_pii-v1 once (see load_model / model_state below)
and applies it to a source's regex-tokenized working text (the output of
redactor.regex_strip). Because that text no longer contains the raw
characters of any regex hit -- they are already replaced by TYPE#n tokens --
GLiNER structurally cannot un-strip a regex hit; it can only add spans over
text regex left alone. That is the union property the spec requires.

Label set: exactly the five the frozen spec calls out as the free-text
entities regex cannot reach ("person name, address, date of birth, account
number, password, and the rest"). No speculative extra labels: GLiNER is
zero-shot, so a wider label list costs latency and false positives for
categories the spec does not ask this build to cover.
"""

import re
import os
import threading
import time
from typing import Optional

LABELS = ["person name", "address", "date of birth", "account number", "password"]

# GLiNER label -> token type. No underscores or spaces: see minter.py's
# docstring for why (the browser's token-consumer regex silently mis-matches
# an underscore-bearing token).
LABEL_TO_TYPE = {
    "person name": "PERSONNAME",
    "address": "ADDRESS",
    "date of birth": "DATEOFBIRTH",
    "account number": "ACCOUNTNUMBER",
    "password": "PASSWORD",
}

MODEL_ID = "urchade/gliner_multi_pii-v1"

STRIP_THRESHOLD = 0.60
UNCERTAIN_FLOOR = 0.35
# Ask GLiNER for anything down to the uncertain floor; below that the spec
# says ignore, so there's no reason to pay for lower-confidence spans.
PREDICT_THRESHOLD = UNCERTAIN_FLOOR


class ModelState:
    """Process-wide GLiNER load state, set once at startup by load_model()."""

    def __init__(self) -> None:
        self.model = None
        self.loading = False
        self.load_error: Optional[str] = None
        self.load_seconds: Optional[float] = None
        self.last_inference_ms: Optional[float] = None
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self.model is not None


STATE = ModelState()


def load_model() -> None:
    """Load GLiNER once. Safe to call from a background thread: sets
    STATE.model on success, STATE.load_error on failure. Never re-downloads
    on this machine because HF_HOME already holds the cached weights.
    """
    with STATE._lock:
        if STATE.model is not None or STATE.loading:
            return
        STATE.loading = True
    try:
        os.environ.setdefault("HF_HOME", "/Volumes/1TB SSD/LM/hub")
        from gliner import GLiNER  # imported here so a missing/broken torch
        # install fails inside the background thread, not at module import.

        t0 = time.time()
        model = GLiNER.from_pretrained(MODEL_ID)
        elapsed = time.time() - t0
        STATE.model = model
        STATE.load_seconds = elapsed
    except Exception as exc:  # noqa: BLE001 -- report, never crash the server
        STATE.load_error = f"{type(exc).__name__}: {exc}"
    finally:
        STATE.loading = False


def scan(text: str) -> list[dict]:
    """Run GLiNER over `text`, returning entities scoring >= UNCERTAIN_FLOOR,
    sorted by start offset ascending (the order token numbering depends on).
    Each item: {start, end, text, label, score}.
    """
    if not STATE.loaded or not text:
        return []
    model = STATE.model
    t0 = time.time()
    raw = model.predict_entities(text, LABELS, threshold=PREDICT_THRESHOLD)
    STATE.last_inference_ms = (time.time() - t0) * 1000.0
    out = [
        {
            "start": e["start"],
            "end": e["end"],
            "text": e["text"],
            "label": e["label"],
            "score": float(e["score"]),
        }
        for e in raw
        if e["label"] in LABEL_TO_TYPE
    ]
    out.sort(key=lambda e: e["start"])
    return out


def apply_gliner_layer(
    text: str,
    source: str,
    minter,
    resolved: dict,
    uncertain: list,
) -> str:
    """Run the GLiNER layer over one source's regex-tokenized text and return
    the further-tokenized working text.

    - score >= 0.60: strip silently, always (regex-style union: adds
      coverage, mint via minter).
    - 0.35 <= score < 0.60: uncertain. If `resolved` already carries a
      strip/keep decision for the token this span would get, honour it
      (strip mints the token; keep leaves the text and does not re-ask).
      Otherwise append to `uncertain` and leave the text untouched.
    - score < 0.35: never reached (predict_entities is called at that floor).
    """
    entities = scan(text)
    if not entities:
        return text

    # Two-pass: first decide an action per entity (in ascending-start order,
    # so token numbering is deterministic), then apply text replacements in
    # descending-start order so earlier replacements don't shift the offsets
    # of ones still pending.
    planned: list[tuple[int, int, str]] = []  # (start, end, replacement)

    for ent in entities:
        type_name = LABEL_TO_TYPE[ent["label"]]
        score = ent["score"]
        if score >= STRIP_THRESHOLD:
            token = minter.mint(type_name, ent["text"], score=score, layer="gliner", pattern=ent["label"])
            planned.append((ent["start"], ent["end"], token))
            continue

        # Uncertain band: reserve the id this span would get either way, so
        # `resolved` lookups and the `uncertain` array agree on the same id
        # across repeated calls with the same input.
        token_id = minter.next_id(type_name)
        decision = resolved.get(token_id)
        if decision == "strip":
            minter.tokens[token_id] = ent["text"]
            minter.decisions.append({"pattern": ent["label"], "score": score, "layer": "gliner"})
            planned.append((ent["start"], ent["end"], token_id))
        elif decision == "keep":
            continue  # already resolved: leave the text, do not re-ask
        else:
            uncertain.append(
                {
                    "id": f"u{len(uncertain) + 1}",
                    "token": token_id,
                    "label": ent["label"],
                    "score": score,
                    "preview": ent["text"],
                    "source": source,
                }
            )

    if not planned:
        return text

    working = text
    for start, end, replacement in sorted(planned, key=lambda p: p[0], reverse=True):
        working = working[:start] + replacement + working[end:]
    return working


# ---------------------------------------------------------------------------
# Per-label bands and raw-text span extraction (added 13 September 2026)
# ---------------------------------------------------------------------------
# A single global uncertain floor of 0.35 was measured to be wrong for person
# names on this model. Observed scores for the same name in two phrasings:
#
#   "Hi, I am Francis Reuben R, my email is ..."   person name 0.423
#   "Log in as Francis Reuben R with email ..."    person name 0.241
#
# The second falls below 0.35, so the name was silently ignored and would have
# reached the cloud planner in plaintext with no prompt. That is the exact
# failure this architecture exists to prevent, so the floor is per-label.
#
# The asymmetry justifies it: a missed name is a privacy breach, while a
# spurious prompt costs the user one click. Person names are therefore floored
# far lower, which buys recall at the price of more questions. Structured types
# (address, account number, date of birth, password) keep the global floor,
# because they score high when present and a low floor there produces noise
# without buying recall.
UNCERTAIN_FLOOR_BY_LABEL = {
    "person name": 0.12,
}

# GLiNER is asked for spans down to the lowest floor any label uses, then each
# span is banded against its own label's floor.
PREDICT_FLOOR = min([UNCERTAIN_FLOOR] + list(UNCERTAIN_FLOOR_BY_LABEL.values()))


def uncertain_floor_for(label: str) -> float:
    """The uncertain-band floor for one GLiNER label. Below it, ignore."""
    return UNCERTAIN_FLOOR_BY_LABEL.get(label, UNCERTAIN_FLOOR)


def gliner_spans(text: str) -> list:
    """Return GLiNER entities as {start, end, label, score, value} in offsets
    into `text` itself, banded per label.

    Runs on RAW text. It must never be handed regex-tokenized text: a TYPE#n
    token is not natural language, it degrades the surrounding context, and the
    tokens themselves get scored as entities (measured: "EMAIL#1" returned as a
    person name at 0.095).
    """
    if not isinstance(text, str) or text.strip() == "":
        return []
    model = STATE.model
    if model is None:
        return []

    # Scaffolding is neutralised for prediction only. Fillers are non-word
    # characters, so nothing is matched there, and their length matches the
    # original span exactly, so entity offsets still index `text` correctly.
    spans = []
    for ent in model.predict_entities(_neutralise_scaffolding(text), LABELS, threshold=PREDICT_FLOOR):
        label = ent["label"]
        if ent["score"] < uncertain_floor_for(label):
            continue
        # A field descriptor is a field NAME, not a value. "Delivery address" is
        # what the form calls the box; it is not somebody's address.
        if _is_structural_descriptor(ent["text"]):
            continue
        spans.append({
            "start": ent["start"],
            "end": ent["end"],
            "label": label,
            "type": LABEL_TO_TYPE[label],
            "score": ent["score"],
            "value": ent["text"],
        })
    spans.sort(key=lambda s: s["start"])
    return spans


# ---------------------------------------------------------------------------
# Structural-scaffolding guard (added 13 September 2026)
# ---------------------------------------------------------------------------
# Found by running the real stack against a real login scene. The DOM
# serialisation is our OWN structured format:
#
#   2. INPUT type=password selector=#password label=Password position=120,390
#
# A named-entity model reading that string treats the field DESCRIPTORS as PII
# values. Measured against a seven-element fixture:
#
#   'password'        0.930  password     -> selector=#password became #PASSWORD#2
#   'Password'        0.977  password     -> label=Password became label=PASSWORD#3
#   'address'         0.910  address      -> ABOVE the strip threshold
#   'Delivery address'0.901  address      -> ABOVE the strip threshold
#   'username'        0.339  person name
#   'User name'       0.483  person name
#
# The consequence was not cosmetic. Tokenising a selector destroys the one
# identifier the planner must echo back, so the model cites #PASSWORD#2, that
# selector does not exist in the page, validation rejects it, and the login and
# checkout flows cannot complete at all.
#
# Two guards, both needed:
#
# 1. _neutralise_scaffolding(): type=, selector= and position= values are our
#    own metadata and are never PII. They are replaced with same-length filler
#    so byte offsets are preserved and entity offsets still map 1:1 onto the
#    original text. label= is deliberately NOT neutralised: a label is page
#    text and can legitimately contain a person's name ("Welcome Francis").
#
# 2. _is_structural_descriptor(): a match consisting only of descriptor words
#    is a field NAME, not a value. "Delivery address" is what a form calls the
#    box, not somebody's address. Real values carry proper nouns, digits or
#    symbols that no descriptor word has, so the rule is safe.
#
# Trade accepted and recorded: a password whose literal value is the word
# "password" is no longer tokenised in text. It is still covered by two other
# layers, the fieldType=password element flag and the screenshot mask, so the
# protection is not lost, and the alternative was a corrupted scene.
_SCAFFOLDING_RE = re.compile(r"\b(type|selector|position)=[^\s]+")

_DESCRIPTOR_WORDS = {
    "password", "passwd", "pwd", "passcode", "passphrase", "secret",
    "address", "name", "user", "username", "phone", "mobile", "number",
    "email", "mail", "delivery", "shipping", "billing", "contact",
    "sign", "login", "log", "forgot", "reset", "confirm", "current",
    "new", "old", "card", "account", "dob", "birth", "date",
    "aadhaar", "aadhar", "pan", "passport", "ssn", "otp", "pin",
    "cvv", "token", "key", "field", "input", "enter", "your", "my",
}


def _neutralise_scaffolding(text: str) -> str:
    """Replace type=, selector= and position= values with same-length filler.
    Offsets are preserved exactly, so entity offsets still index the original.
    """
    return _SCAFFOLDING_RE.sub(lambda m: "·" * len(m.group(0)), text)


def _is_structural_descriptor(value: str) -> bool:
    """True when every word in `value` is a field-descriptor word, which makes
    it a field name rather than a piece of personal data."""
    words = re.findall(r"[a-z]+", value.lower())
    if not words:
        return False
    return all(w in _DESCRIPTOR_WORDS for w in words)

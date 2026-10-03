"""entities.py: GLiNER layer (Layer 2) for free-text PII regex cannot reach.

Loads urchade/gliner_multi_pii-v1 once (see load_model below) and reports
entity spans over RAW text (gliner_spans). strip.py merges these with the
regex layer's spans in the original coordinate space, the deterministic layer
winning on overlap; see strip.py's docstring for why GLiNER must never be
handed regex-tokenized text.

The text is scored in short line-aligned chunks, never whole: see
_chunk_spans() for the measurement that forced this.

Label set: exactly the five the frozen spec calls out as the free-text
entities regex cannot reach ("person name, address, date of birth, account
number, password, and the rest"). No speculative extra labels: GLiNER is
zero-shot, so a wider label list costs latency and false positives for
categories the spec does not ask this build to cover.
"""

import re
from collections import OrderedDict
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
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self.model is not None


STATE = ModelState()


def load_model() -> None:
    """Load GLiNER once. Safe to call from a background thread: sets
    STATE.model on success, STATE.load_error on failure. The weights come
    from the Hugging Face cache: HF_HOME when it is set, otherwise the
    library's own default.
    """
    with STATE._lock:
        if STATE.model is not None or STATE.loading:
            return
        STATE.loading = True
    try:
        # HF_HOME is left to the environment (3 October 2026). It used to default
        # to one development Mac's external volume whenever that path existed;
        # warden/README.md's run command exports HF_HOME for that machine.
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

    # Scaffolding is neutralised for prediction only, and the filler has the
    # original span's exact length, so offsets into the neutralised string are
    # offsets into `text`. Each chunk is a slice of that string, so a chunk
    # offset plus an in-chunk offset is an offset into `text` too.
    neutral = _neutralise_scaffolding(text)
    chunks = _chunk_spans(neutral)
    results = _cached_predict(model, [neutral[a:b] for a, b in chunks])

    spans = []
    for (chunk_start, _), entities_in_chunk in zip(chunks, results):
        for ent in entities_in_chunk:
            label = ent["label"]
            if label not in LABEL_TO_TYPE:
                continue
            if ent["score"] < uncertain_floor_for(label):
                continue
            start = chunk_start + ent["start"]
            end = chunk_start + ent["end"]
            value = text[start:end]
            # A field descriptor is a field NAME, not a value. "Delivery address" is
            # what the form calls the box; it is not somebody's address.
            if _is_structural_descriptor(value):
                continue
            if not _plausible_value(LABEL_TO_TYPE[label], value):
                continue
            spans.append({
                "start": start,
                "end": end,
                "label": label,
                "type": LABEL_TO_TYPE[label],
                "score": ent["score"],
                "value": value,
            })
    spans.sort(key=lambda s: s["start"])
    return spans


# ---------------------------------------------------------------------------
# Chunked scoring (added 29 September 2026)
# ---------------------------------------------------------------------------
# gliner_spans() used to hand the whole serialised DOM (up to 30 KB) to one
# predict_entities() call. The model's window is max_len=384 words (read from
# model.config on the loaded weights), and everything past it is silently
# dropped. Worse, even text that fits scores badly when it is a list of
# unrelated controls: the context dilutes each name. Measured in this container
# on 29 September 2026, CPU torch, gliner 0.2.29, person names in synthetic
# `N. TAG type= selector= label="..." position=` lines (the format
# extension/content.js serializeDom() emits):
#
#   41-line DOM, names on lines 2 and 39, whole text:  0/2 found
#   either of those lines scored alone:                 both found
#
#   120-line DOM, 10 names, "·" per scaffolding char (the old filler):
#     whole text      0/10   0.45 s
#     8 lines/chunk   3/10  10.4 s
#     4 lines/chunk   3/10   8.4 s
#     1 line/chunk    9/10   7.4 s
#
# Chunks of 4 or 8 lines sit far under the 384-word window and still lose most
# names, so the window was not the only problem; one line per chunk is what
# restores recall. The one name every configuration missed ("Ship to Rohan
# Deshpande") scores 0.08 alone, below the 0.12 person-name floor: that is the
# model, not the chunking.
#
# The old filler cost latency: GLiNER splits every "·" into its own word, so a
# typical line was ~50 words of which ~40 were filler. Same 120 lines, one line
# per chunk, batch_size 16:
#
#   "·" per char           9/10  7.4 s   0 spans past floors + descriptor guard
#   spaces only            9/10  3.3 s  21 spans past floors + guard on the 110
#                                        name-free lines ("Customer service" and
#                                        "Returns" as person names, "Sign out"
#                                        as a password): every one a question
#   one "·" then spaces    9/10  3.6 s   0 spans past floors + guard
#
# So the filler is now one "·" followed by spaces: the marker keeps the model
# from reading the neighbouring label as free prose, and the spaces cost
# nothing. Batch size, same input: 8 -> 4.8 s, 16 -> 3.4 s, 32 -> 3.5 s.
#
# End to end through gliner_spans() as shipped (one line per chunk, new
# filler, line index neutralised, batch_size 16), same container and date:
#   41-line page:  both names found and stripped (scores >= 0.60), 1.3 s strip()
#   120-line page: 9/10 names, 3.4 s, no other span on the page
#   30,000-char page (just under content.js MAX_DOM_BYTES, 30 KB; 422 lines): 10.7 s.
#   That is the price of recall on CPU; a GPU or a smaller DOM cuts it.
#
# A single line longer than CHUNK_MAX_WORDS is split on whitespace. The budget
# is words as GLiNER's own splitter counts them (_GLINER_WORD_RE is its default
# pattern), a third of the window, so subword expansion of long tokens cannot
# push a chunk past it.
CHUNK_MAX_WORDS = 128
PREDICT_BATCH_SIZE = 16
_GLINER_WORD_RE = re.compile(r"\w+(?:[-_]\w+)*|\S")


def _chunk_spans(text: str) -> list:
    """Split `text` into (start, end) slices, one per non-blank line, with a
    line longer than CHUNK_MAX_WORDS split further on whitespace. Slices never
    overlap and every character of every non-blank line is in exactly one."""
    chunks = []
    for line in re.finditer(r"[^\n]+", text):
        if line.group(0).strip() == "":
            continue
        if len(_GLINER_WORD_RE.findall(line.group(0))) <= CHUNK_MAX_WORDS:
            chunks.append((line.start(), line.end()))
            continue
        piece_start = None
        piece_end = None
        words = 0
        for piece in re.finditer(r"\S+", line.group(0)):
            n = len(_GLINER_WORD_RE.findall(piece.group(0)))
            if piece_start is not None and words + n > CHUNK_MAX_WORDS:
                chunks.append((line.start() + piece_start, line.start() + piece_end))
                piece_start = None
                words = 0
            if piece_start is None:
                piece_start = piece.start()
            piece_end = piece.end()
            words += n
        if piece_start is not None:
            chunks.append((line.start() + piece_start, line.start() + piece_end))
    return chunks


# Per-chunk result cache. One chunk is one serialised control with its line
# number, selector and position already neutralised, so the same control scores
# from the same text on every step of a run: after the first step, most of a
# page is a cache hit and only the controls that changed reach the model.
# Cleared whenever the model object changes, so a reload can never serve another
# model's scores; the owner is held by reference rather than id(), so a
# collected test stub's address can never be reused into a stale hit. The cache
# holds page text in Warden memory only, the same text /strip already receives,
# and is never written anywhere.
_CHUNK_CACHE: "OrderedDict[str, list]" = OrderedDict()
_CHUNK_CACHE_MAX = 4096
_CHUNK_CACHE_OWNER = None
# /strip runs in the server's threadpool since 3 October 2026, so two requests can arrive
# together. The lock keeps the OrderedDict consistent and runs one inference at a time
# (on CPU a second concurrent batch only competes for the same cores).
_PREDICT_LOCK = threading.Lock()


def _cached_predict(model, texts: list) -> list:
    with _PREDICT_LOCK:
        return _cached_predict_locked(model, texts)


def _cached_predict_locked(model, texts: list) -> list:
    global _CHUNK_CACHE_OWNER
    if model is not _CHUNK_CACHE_OWNER:
        _CHUNK_CACHE.clear()
        _CHUNK_CACHE_OWNER = model
    results = [None] * len(texts)
    missing = []
    for i, t in enumerate(texts):
        hit = _CHUNK_CACHE.get(t)
        if hit is None:
            missing.append(i)
        else:
            _CHUNK_CACHE.move_to_end(t)
            results[i] = hit
    if missing:
        fresh = _predict_chunks(model, [texts[i] for i in missing])
        for i, ents in zip(missing, fresh):
            ents = list(ents)
            results[i] = ents
            _CHUNK_CACHE[texts[i]] = ents
        while len(_CHUNK_CACHE) > _CHUNK_CACHE_MAX:
            _CHUNK_CACHE.popitem(last=False)
    return results


def _predict_chunks(model, texts: list) -> list:
    """One list of entities per text. Uses the batched inference() the real
    GLiNER exposes; a model object without it (the test stubs) is called one
    text at a time through predict_entities()."""
    if not texts:
        return []
    inference = getattr(model, "inference", None)
    if callable(inference):
        return inference(texts, LABELS, threshold=PREDICT_FLOOR, batch_size=PREDICT_BATCH_SIZE)
    return [model.predict_entities(t, LABELS, threshold=PREDICT_FLOOR) for t in texts]


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
#    (one "·" then spaces since 29 September 2026; see the chunking notes above)
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
#
# The leading "N." element index serializeDom() puts on every line is our own
# metadata too, and is neutralised since 29 September 2026: scored one line at
# a time, "99. A type=link ... label=\"Account holder Neha Joshi\"" returned the
# index "99" as an account number at 0.381, a question about a line number.
#
# The tag word after the index ("12. BUTTON", "3. A") and the STATUS line prefix
# are our metadata too (3 October 2026): scored one line at a time, "BUTTON" came
# back as a person name at 0.12 to 0.18 on 4 of 94 ordinary labels
# (Benchmarks/results/gliner-label-fp-v01.json), each a question about our own markup.
_SCAFFOLDING_RE = re.compile(
    r"\b(type|selector|position)=[^\s]+|^\d+\. [A-Z][A-Z0-9-]*(?= )|^\d+\.(?= )|^STATUS(?= )",
    re.MULTILINE,
)

_DESCRIPTOR_WORDS = {
    "password", "passwd", "pwd", "passcode", "passphrase", "secret",
    "address", "name", "user", "username", "phone", "mobile", "number",
    "email", "mail", "delivery", "shipping", "billing", "contact",
    "sign", "login", "log", "forgot", "reset", "confirm", "current",
    "new", "old", "card", "account", "dob", "birth", "date",
    "aadhaar", "aadhar", "pan", "passport", "ssn", "otp", "pin",
    "cvv", "token", "key", "field", "input", "enter", "your", "my",
    # Address-form and profile field names (added 29 September 2026): an
    # end-to-end run asked the user about an input labelled "city" as a person
    # name at 0.13, above the 0.12 person-name floor. A pointless question
    # trains people to click through the real ones.
    "city", "town", "state", "country", "region", "province", "district",
    "zip", "postcode", "postal", "pincode", "code", "street", "line",
    "first", "last", "middle", "full", "given", "family", "surname",
    "company", "organisation", "organization", "title", "display",
    # Hindi UI vocabulary (added 3 October 2026). The guard used to read only [a-z]
    # words, so every Devanagari label could fall in the person-name band (floor 0.12):
    # in the G11 live run the link "खाता हटाएं" (delete account) was asked about as a
    # person name at 18% on every run; gliner-label-fp-v01.json records "मेरे खाते"
    # 0.52, "जन्म तिथि" 0.28, "पता बदलें" 0.16 and "सहायता" 0.16 the same way. Field
    # and action words only, the Hindi counterparts of the words above; a span is
    # dropped only when EVERY word is one of them, so a name never is. Derived from
    # observed false positives, like the English list: not a held-out result.
    "खाता", "खाते", "खातों", "मेरा", "मेरे", "मेरी", "आपका", "आपके", "आपकी",
    "हटाएं", "हटाएँ", "हटाये", "बंद", "करें", "करे", "करो", "बदलें", "बदले",
    "पासवर्ड", "प्रोफ़ाइल", "प्रोफाइल", "जन्म", "तिथि", "तारीख", "तारीख़", "पता", "पते",
    "नाम", "मोबाइल", "फ़ोन", "फोन", "नंबर", "संख्या", "ईमेल", "विवरण", "सहायता",
    "केंद्र", "लॉग", "इन", "आउट", "साइन", "दस्तावेज़", "दस्तावेज", "खोजें", "सेवा", "सेवाएं",
    "ग्राहक", "सेटिंग्स", "सेटिंग", "भाषा", "सूचनाएं", "डैशबोर्ड", "विवरणी", "शहर", "राज्य",
    "पिन", "कोड", "देखें", "बचत", "चालू", "नया", "नई", "पुराना", "पुष्टि",
}


def _neutralise_scaffolding(text: str) -> str:
    """Replace type=, selector= and position= values with same-length filler.
    Offsets are preserved exactly, so entity offsets still index the original.
    """
    return _SCAFFOLDING_RE.sub(lambda m: "·" + " " * (len(m.group(0)) - 1), text)


def _is_structural_descriptor(value: str) -> bool:
    """True when every word in `value` is a field-descriptor word, which makes
    it a field name rather than a piece of personal data."""
    # Latin words, and Devanagari words (letters, vowel signs, nukta and virama).
    words = re.findall(r"[a-z]+|[\u0900-\u0963\u0971-\u097F]+", value.lower())
    if not words:
        return False
    return all(w in _DESCRIPTOR_WORDS for w in words)


# ---------------------------------------------------------------------------
# Type plausibility (added 3 October 2026)
# ---------------------------------------------------------------------------
# Measured on 94 ordinary EN/HI labels and tasks (gliner-label-fp-v01.json):
# "Account statements" 0.40 and "Delete my account" 0.35 were questions, and
# "My accounts", "Account details", "Savings account" (0.62 to 0.82) were
# silently replaced by ACCOUNTNUMBER tokens, so the planner could not choose
# those links. "Change password" (0.88) and the Hindi destructive label
# "खाता बंद करें" (0.65) were stripped as passwords, the latter hiding a
# destructive control's name from the planner.
#
# Rules, each true of the type itself and not fitted to a label list:
# - an account number or a date of birth contains a digit (any script; Python's
#   \d matches Devanagari digits). Spelled-out dates of birth are no longer
#   model hits; a keyed numeric one is caught by the regex layer as well.
# - a password is one token: a span with whitespace is a phrase. Trade
#   accepted and recorded: a passphrase with spaces shown in page text is no
#   longer a model hit; password inputs stay covered by the fieldType flag and
#   the screenshot mask.
# Person names and addresses are untouched: they have no such structural test,
# and a missed name is the failure this layer exists to prevent.
_HAS_DIGIT_RE = re.compile(r"\d")


def _plausible_value(span_type: str, value: str) -> bool:
    if span_type in ("ACCOUNTNUMBER", "DATEOFBIRTH"):
        return bool(_HAS_DIGIT_RE.search(value))
    if span_type == "PASSWORD":
        return not re.search(r"\s", value.strip())
    return True

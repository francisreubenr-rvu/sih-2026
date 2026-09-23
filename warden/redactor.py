"""redactor.py: deterministic regex PII layer, ported from extension/utils/redactor.js.

This is a faithful port of the `passes` array and the Luhn/Aadhaar-keyword
heuristics in extension/utils/redactor.js. Same patterns, same order, same
validation. Order is load-bearing (ported comment, unchanged in meaning):
longer / more specific patterns run first so a card number (13-19 digits) is
consumed whole before a phone or Aadhaar pattern can match a substring of it.

Unlike the JS file (which offers both redactText and tokenizeText), the Warden
only ever needs the tokenizing form: it mints TYPE#n tokens through a shared
TokenMinter (see minter.py) so numbering is consistent with the GLiNER layer
that runs afterward, in the same request.

A regex hit is always stripped and never enters the uncertain band. This
module only ever appends decisions layer='regex' with confidence 1.0, per the
frozen contract's confidence bands (regex sits outside the banding: it is not
a GLiNER score at all).
"""

import re


# ---------------------------------------------------------------------------
# Luhn checksum (ported from luhnValid in redactor.js)
# ---------------------------------------------------------------------------
def luhn_valid(digits: str) -> bool:
    total = 0
    double = False
    for ch in reversed(digits):
        d = ord(ch) - 48
        if double:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double = not double
    return total % 10 == 0


def _card_validate(match: str) -> bool:
    digits = re.sub(r"[ -]", "", match)
    return 13 <= len(digits) <= 19 and luhn_valid(digits)


def _intl_grouped_validate(match: str) -> bool:
    return len(re.sub(r"[ -]", "", match)) >= 7


# ---------------------------------------------------------------------------
# Pattern set (single source of truth) -- exact order of the JS `passes` array
# ---------------------------------------------------------------------------
# Each entry: (name, compiled regex, validate-or-None). `name` becomes the
# uppercase token type and the lowercase `pattern` field in decisions, exactly
# as in the JS file.
PASSES = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), None),
    ("pan", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"), None),
    ("passport", re.compile(r"\b[A-Za-z][0-9]{7}\b"), None),
    ("card", re.compile(r"(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)"), _card_validate),
    ("aadhaar", re.compile(r"(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)\+91[ -]?[6-9]\d{9}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)[6-9]\d{2}[ -]\d{3}[ -]\d{4}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)[6-9]\d{4}[ -]\d{5}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)\+[1-9]\d{1,3}[ -]?\d{6,14}(?!\d)"), None),
    (
        "phone",
        re.compile(r"(?<!\d)\+[1-9]\d{1,3}(?:[ -]\d{2,4}){2,5}(?!\d)"),
        _intl_grouped_validate,
    ),
]

# Bare 12-digit Aadhaar keyword-proximity heuristic (ported unchanged).
AADHAAR_KEYWORD_RE = re.compile(r"aadhaar|aadhar|uidai", re.IGNORECASE)
AADHAAR_BARE_RE = re.compile(r"(?<!\d)\d{12}(?!\d)")


def regex_strip(text: str, minter) -> str:
    """Apply the full regex pass list to `text` in order, minting a TYPE#n
    token (via `minter`) for every match that is not vetoed by its
    `validate` predicate. Returns the working (tokenized) text.

    `minter` is a minter.TokenMinter; every mint call records a
    {"pattern": name, "score": 1.0, "layer": "regex"} decision.
    """
    if not isinstance(text, str) or text == "":
        return text or ""

    working = text

    for name, pattern, validate in PASSES:
        def _sub(m: "re.Match[str]", _name=name, _validate=validate) -> str:
            matched = m.group(0)
            if _validate is not None and not _validate(matched):
                return matched  # veto: leave intact
            return minter.mint(_name.upper(), matched, score=1.0, layer="regex", pattern=_name)

        working = pattern.sub(_sub, working)

    # Aadhaar keyword-proximity heuristic: checked against the ORIGINAL text,
    # not `working`, so a keyword elsewhere in the passage still triggers it.
    if AADHAAR_KEYWORD_RE.search(text):
        def _sub_aadhaar(m: "re.Match[str]") -> str:
            return minter.mint("AADHAAR", m.group(0), score=1.0, layer="regex", pattern="aadhaar")

        working = AADHAAR_BARE_RE.sub(_sub_aadhaar, working)

    return working


# ---------------------------------------------------------------------------
# Span extraction (added 13 September 2026)
# ---------------------------------------------------------------------------
# regex_strip() above tokenizes in place, which forced the GLiNER layer to run
# over already-tokenized text. That was measured to be harmful: on a probe
# sentence the person-name score fell from 0.241 on raw text to 0.179 after
# tokenization, and the token "EMAIL#1" was itself scored as a person name at
# 0.095. A named-entity model reads context, and TYPE#n tokens are not context.
#
# regex_spans() reports matches as offsets into the ORIGINAL text instead, so
# both layers can run independently on the raw string and have their spans
# merged afterwards. See strip.py for the merge, which resolves overlaps in
# favour of the deterministic layer.
def regex_spans(text: str) -> list:
    """Return every regex PII match as {start, end, type, pattern, value},
    in offsets into `text` itself. Order of PASSES is preserved and an
    earlier (more specific) pass claims a span before a looser later one:
    a later match overlapping an already-claimed span is discarded, which
    reproduces regex_strip()'s sequential-rewrite behaviour without mutating
    the string.
    """
    if not isinstance(text, str) or text == "":
        return []

    spans: list = []

    def _overlaps(start: int, end: int) -> bool:
        return any(start < s["end"] and s["start"] < end for s in spans)

    for name, pattern, validate in PASSES:
        for match in pattern.finditer(text):
            matched = match.group(0)
            if validate is not None and not validate(matched):
                continue
            if _overlaps(match.start(), match.end()):
                continue
            spans.append({
                "start": match.start(),
                "end": match.end(),
                "type": name.upper(),
                "pattern": name,
                "value": matched,
            })

    # Aadhaar keyword-proximity heuristic, same trigger as regex_strip().
    if AADHAAR_KEYWORD_RE.search(text):
        for match in AADHAAR_BARE_RE.finditer(text):
            if _overlaps(match.start(), match.end()):
                continue
            spans.append({
                "start": match.start(),
                "end": match.end(),
                "type": "AADHAAR",
                "pattern": "aadhaar",
                "value": match.group(0),
            })

    spans.sort(key=lambda s: s["start"])
    return spans

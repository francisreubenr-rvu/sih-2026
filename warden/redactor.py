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
    # Before the digit passes, so Aadhaar or card cannot take the digits out of an IBAN.
    ("iban", re.compile(r"\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b"), lambda m: _iban_validate(m)),
    ("pan", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"), None),
    ("passport", re.compile(r"\b[A-Za-z][0-9]{7}\b"), None),
    ("card", re.compile(r"(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)"), _card_validate),
    # Not part of a longer grouped number: "3920 1188 2201 76" is one account number,
    # and taking its first 12 digits as Aadhaar used to leave "76" in plain text.
    ("aadhaar", re.compile(r"(?<!\d)(?<!\d[ -])\d{4}[ -]\d{4}[ -]\d{4}(?![ -]?\d)"), None),
    ("phone", re.compile(r"(?<!\d)\+91[ -]?[6-9]\d{9}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)[6-9]\d{2}[ -]\d{3}[ -]\d{4}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)0?[6-9]\d{4}[ -]\d{5}(?!\d)"), None),
    ("phone", re.compile(r"(?<!\d)0?[6-9]\d{9}(?!\d)"), None),
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

# ---------------------------------------------------------------------------
# Digits in Indian scripts, IBANs, bare account numbers, keyed dates of birth
# (added 3 October 2026)
# ---------------------------------------------------------------------------
# Measured (Benchmarks/results/gliner-label-fp-v01.json): "खाता संख्या
# 50100234567812" reached the planner unasked. The regex layer had no account
# pattern (14 digits fail Luhn, so not a card) and GLiNER only finds account
# numbers when the words around them are English. The same number in
# Devanagari digits leaked too, and so did "जन्म तिथि 12-01-2001".
#
# 1. Every pass matches on a copy whose Indian-script and full-width digits are
#    mapped to ASCII. Each mapping is one character to one character, so match
#    offsets index the original text and values are cut from the original.
# 2. IBAN (in PASSES, right after email), validated by its mod-97 check, so
#    "AB12 TEST CASE" never matches.
# 3. Any other run of 9 to 18 digits is an account number. Groups need 3 or more
#    digits, except a final group of 2 ("3920 1188 2201 76"), so pagination
#    ("10 11 12 13 14") and timestamps ("2026-10-03 18:01") cannot add up to one. Runs after Aadhaar, so a keyed
#    12-digit Aadhaar keeps its type. Over-matching an order or reference number
#    costs a token the planner can still match; missing an account number is a leak.
# 4. A date on a line that says date of birth (EN or HI) is a date of birth. Per
#    line, because one DOM line is one element: a transaction date elsewhere on
#    the page stays readable.
#    The same copy also maps non-breaking spaces to a space, zero-width and
#    soft-hyphen characters to "-" (a separator the patterns accept), and
#    full-width ASCII (＠, full-width digits) to ASCII, so "98765\u200b43210" and
#    "ravi＠example.com" cannot slip past (security review, 3 October 2026).
_INDIC_DIGIT_ZEROS = (0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66)
MATCH_MAP = {zero + i: ord("0") + i for zero in _INDIC_DIGIT_ZEROS for i in range(10)}
MATCH_MAP.update({cp: cp - 0xFEE0 for cp in range(0xFF01, 0xFF5F)})
MATCH_MAP.update({cp: ord(" ") for cp in (0x00A0, 0x2007, 0x202F)})
MATCH_MAP.update({cp: ord("-") for cp in (0x00AD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF)})


def match_copy(text: str) -> str:
    """The copy every pass matches on. One character for one, so offsets index `text`."""
    return text.translate(MATCH_MAP)


def _iban_validate(match: str) -> bool:
    compact = match.replace(" ", "").upper()
    if not 15 <= len(compact) <= 34:
        return False
    rearranged = compact[4:] + compact[:4]
    number = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(number) % 97 == 1


def _account_validate(match: str) -> bool:
    return 9 <= len(re.sub(r"[ -]", "", match)) <= 18


ACCOUNT_RE = re.compile(r"(?<![0-9])[0-9]{3,}(?:[ -][0-9]{3,})*(?:[ -][0-9]{2})?(?![0-9])")
DOB_KEYWORD_RE = re.compile(r"date of birth|\bdob\b|\bbirth|\bborn\b|जन्म", re.IGNORECASE)
DATE_RE = re.compile(
    r"(?<![0-9])(?:[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}"
    r"|[0-9]{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{4})(?![0-9])",
    re.IGNORECASE,
)

# Passes that run after the Aadhaar heuristic, in this order: (name, pattern, validate).
LATE_PASSES = [
    ("accountnumber", ACCOUNT_RE, _account_validate),
]


def _dob_line_spans(norm: str) -> list:
    """(start, end) of every date on a line of `norm` that names a date of birth."""
    out = []
    offset = 0
    for line in norm.split("\n"):
        if DOB_KEYWORD_RE.search(line):
            out.extend((offset + m.start(), offset + m.end()) for m in DATE_RE.finditer(line))
        offset += len(line) + 1
    return out


def regex_strip(text: str, minter) -> str:
    """Apply the full regex pass list to `text` in order, minting a TYPE#n
    token (via `minter`) for every match that is not vetoed by its
    `validate` predicate. Returns the working (tokenized) text.

    `minter` is a minter.TokenMinter; every mint call records a
    {"pattern": name, "score": 1.0, "layer": "regex"} decision.
    """
    if not isinstance(text, str) or text == "":
        return text or ""

    working = match_copy(text)

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

    for name, pattern, validate in LATE_PASSES:
        def _sub_late(m: "re.Match[str]", _name=name, _validate=validate) -> str:
            matched = m.group(0)
            if _validate is not None and not _validate(matched):
                return matched
            return minter.mint(_name.upper(), matched, score=1.0, layer="regex", pattern=_name)

        working = pattern.sub(_sub_late, working)

    if DOB_KEYWORD_RE.search(working):
        def _sub_dob_line(line: str) -> str:
            if not DOB_KEYWORD_RE.search(line):
                return line
            return DATE_RE.sub(lambda m: minter.mint("DATEOFBIRTH", m.group(0), score=1.0, layer="regex",
                                                     pattern="dateofbirth"), line)

        working = "\n".join(_sub_dob_line(line) for line in working.split("\n"))

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
    norm = match_copy(text)

    def _overlaps(start: int, end: int) -> bool:
        return any(start < s["end"] and s["start"] < end for s in spans)

    for name, pattern, validate in PASSES:
        for match in pattern.finditer(norm):
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
                "value": text[match.start():match.end()],
            })

    # Aadhaar keyword-proximity heuristic, same trigger as regex_strip().
    if AADHAAR_KEYWORD_RE.search(text):
        for match in AADHAAR_BARE_RE.finditer(norm):
            if _overlaps(match.start(), match.end()):
                continue
            spans.append({
                "start": match.start(),
                "end": match.end(),
                "type": "AADHAAR",
                "pattern": "aadhaar",
                "value": text[match.start():match.end()],
            })

    for name, pattern, validate in LATE_PASSES:
        for match in pattern.finditer(norm):
            if not validate(match.group(0)) or _overlaps(match.start(), match.end()):
                continue
            spans.append({"start": match.start(), "end": match.end(), "type": name.upper(),
                          "pattern": name, "value": text[match.start():match.end()]})

    for start, end in _dob_line_spans(norm):
        if _overlaps(start, end):
            continue
        spans.append({"start": start, "end": end, "type": "DATEOFBIRTH",
                      "pattern": "dateofbirth", "value": text[start:end]})

    spans.sort(key=lambda s: s["start"])
    return spans

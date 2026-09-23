"""strip.py: POST /strip orchestration.

Both PII layers run independently over the RAW text and their spans are merged
in the original coordinate space, then applied in one pass. One TokenMinter is
shared across the task text and the DOM text so numbering is a single
continuous per-type sequence: exactly one EMAIL#1 in the whole response.

Ordering history, recorded because it was a real defect. The first
implementation ran the regex layer first and handed its tokenized output to
GLiNER. That was measured to be harmful on 13 September 2026:

    person name, raw text                 0.241
    person name, after regex tokenization 0.179
    the token "EMAIL#1" itself            0.095, scored as a person name

A named-entity model reads context, and TYPE#n tokens are not context. They
depress the scores of real entities and get scored as entities themselves. Both
layers now see the original string.

On overlap the deterministic layer wins: a regex hit is certain, a model score
is not, and a regex hit never enters the uncertain band.
"""

import re

import entities
import redactor
from minter import TokenMinter

# Element pii=true classification. The /strip request's `elements` carry no
# value, only selector/label/fieldType/filled/x/y (per the frozen contract's
# request schema), so this is necessarily a metadata classifier, not a scan
# of real content: it flags a control whose declared type or label names a
# PII category. Documented as a deliberate, narrow heuristic in
# warden/README.md.
_PII_FIELD_TYPES = {"email", "tel", "password"}
_PII_LABEL_RE = re.compile(
    r"email|phone|mobile|password|aadhaar|aadhar|pan\b|passport|address|"
    r"\bname\b|date of birth|\bdob\b|birth|account|card number|ssn",
    re.IGNORECASE,
)


def _element_is_pii(el: dict) -> bool:
    field_type = (el.get("fieldType") or "").lower()
    if field_type in _PII_FIELD_TYPES:
        return True
    label = el.get("label") or ""
    return bool(_PII_LABEL_RE.search(label) or _PII_LABEL_RE.search(field_type))


def _merge_spans(regex_spans: list, model_spans: list) -> list:
    """Merge the two layers' spans, deterministic layer winning on overlap.

    Returns one list sorted by start offset, each entry carrying `layer` so the
    caller knows whether it is a certain hit or a banded model score.
    """
    merged = [dict(s, layer="regex") for s in regex_spans]

    for span in model_spans:
        if any(span["start"] < m["end"] and m["start"] < span["end"] for m in merged):
            # A regex hit already claims these characters. The deterministic
            # answer stands; the model's overlapping guess is discarded rather
            # than allowed to re-band an already-certain span.
            continue
        merged.append(dict(span, layer="gliner"))

    merged.sort(key=lambda s: s["start"])
    return merged


def _apply(text: str, spans: list, minter: TokenMinter, source: str,
           resolved: dict, uncertain: list) -> str:
    """Replace every decided span in `text` with its token.

    Token ids are reserved in ascending start order so numbering follows
    reading order, then the replacements are applied in descending start order
    so an earlier substitution cannot shift the offsets of one still pending.
    """
    planned = []

    for span in spans:
        if span["layer"] == "regex":
            token = minter.mint(
                span["type"], span["value"],
                score=1.0, layer="regex", pattern=span["pattern"],
            )
            planned.append((span["start"], span["end"], token))
            continue

        score = span["score"]
        if score >= entities.STRIP_THRESHOLD:
            token = minter.mint(
                span["type"], span["value"],
                score=score, layer="gliner", pattern=span["label"],
            )
            planned.append((span["start"], span["end"], token))
            continue

        # Uncertain band. Reserve the id this span would get either way, so a
        # `resolved` lookup and the `uncertain` array agree on the same id
        # across repeated calls with the same input.
        token_id = minter.next_id(span["type"])
        decision = resolved.get(token_id)

        if decision == "strip":
            minter.mint(
                span["type"], span["value"],
                score=score, layer="gliner", pattern=span["label"],
                token=token_id,
            )
            planned.append((span["start"], span["end"], token_id))
            continue

        if decision == "keep":
            # The user already said this is not personal data. Leave the text
            # alone and do not ask again this session.
            continue

        uncertain.append({
            "id": token_id,
            "token": token_id,
            "label": span["label"],
            "score": round(float(score), 4),
            "preview": span["value"],
            "source": source,
        })

    working = text
    for start, end, token in sorted(planned, key=lambda p: p[0], reverse=True):
        working = working[:start] + token + working[end:]
    return working


def strip(task: str, dom: str, elements: list, resolved: dict) -> dict:
    resolved = resolved or {}
    elements = elements or []
    minter = TokenMinter()
    uncertain: list = []

    task_text = task or ""
    dom_text = dom or ""

    tokenized_task = _apply(
        task_text,
        _merge_spans(redactor.regex_spans(task_text), entities.gliner_spans(task_text)),
        minter, "task", resolved, uncertain,
    )
    sanitized_dom = _apply(
        dom_text,
        _merge_spans(redactor.regex_spans(dom_text), entities.gliner_spans(dom_text)),
        minter, "dom", resolved, uncertain,
    )

    out_elements = [dict(el, pii=_element_is_pii(el)) for el in elements]

    return {
        "tokenizedTask": tokenized_task,
        "sanitizedDom": sanitized_dom,
        "tokens": dict(minter.tokens),
        "elements": out_elements,
        "uncertain": uncertain,
        "decisions": list(minter.decisions),
    }

"""strip.py: POST /strip orchestration.

Both PII layers run independently over the RAW text and their spans are merged
in the original coordinate space, then applied in one pass. One TokenMinter is
shared across the task text and the DOM text so numbering is a single
continuous per-type sequence: exactly one EMAIL#1 in the whole response.
Since 29 September 2026 the same (type, value) also reuses its token wherever
it appears, element labels included; see _decide() and _tokenize_label().

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


def _answer_for(resolved: dict, token: str, value: str):
    """The user's answer for this uncertain span: "strip", "keep" or None (ask).

    Token ids restart at #1 on every /strip call, so an answer keyed by token alone
    applied to whatever value held that id on a later page: "keep" for the link label
    "Account statements" kept a real account number that became ACCOUNTNUMBER#1 on the
    next step (3 October 2026). An answer is {"decision", "value"} and applies only to
    the value it was given for. A legacy bare "strip" still applies (it can only remove
    text); a legacy bare "keep" is ignored, so the user is asked again.

    Matched on (type, value), not on the key's number (code review, 3 October 2026): the
    same value can get a different id on the next page ("Neha" is PERSONNAME#2 once
    another name comes first), and the extension cannot know the id before this call.
    The key's TYPE prefix must match the span's type."""
    entry = resolved.get(token)
    if isinstance(entry, dict) and entry.get("value") == value and entry.get("decision") in ("strip", "keep"):
        return entry["decision"]
    span_type = token.split("#", 1)[0]
    for key, other in resolved.items():
        if (isinstance(other, dict) and isinstance(key, str) and key.split("#", 1)[0] == span_type
                and other.get("value") == value and other.get("decision") in ("strip", "keep")):
            return other["decision"]
    return "strip" if entry == "strip" else None


def _decide(sources: list, minter: TokenMinter, resolved: dict, uncertain: list) -> dict:
    """Decide every span of every source together and return, per source name,
    the planned (start, end, token) replacements.

    `sources` is [(name, spans)] in reading order (task before DOM). Deciding
    them together is what makes one token per repeated value hold: a value is
    either replaced everywhere or nowhere, so a name the model is sure of in
    the page header cannot survive in plaintext where it scored lower in the
    task, and one uncertain question covers every occurrence.

    Per (type, value), in order:
    - any regex hit, or any GLiNER score >= STRIP_THRESHOLD: replaced
      everywhere, silently;
    - otherwise uncertain. The id is reserved in first-occurrence order so a
      `resolved` lookup and the `uncertain` array agree on the same id across
      repeated calls with the same input. `strip` replaces every occurrence,
      `keep` leaves them all and is not asked again, no answer yet adds ONE
      uncertain entry (highest score, first occurrence's preview and source).
    """
    # Pass 1: reserve ids in reading order and find the certain values.
    certain = {}  # (type, value) -> the span that makes it certain
    best = {}     # (type, value) -> (highest-scoring span, source of first occurrence)
    for name, spans in sources:
        for span in spans:
            key = (span["type"], span["value"])
            minter.reserve(*key)
            if span["layer"] == "regex" or span["score"] >= entities.STRIP_THRESHOLD:
                certain.setdefault(key, span)
            if key not in best:
                best[key] = (span, name)
            elif span.get("score", 0) > best[key][0].get("score", 0):
                best[key] = (span, best[key][1])

    # Pass 2: plan replacements and record decisions per source.
    planned = {name: [] for name, _ in sources}
    asked = set()
    for name, spans in sources:
        for span in spans:
            key = (span["type"], span["value"])
            token = minter.token_for(*key)

            if key in certain:
                basis = span if (span["layer"] == "regex" or span["score"] >= entities.STRIP_THRESHOLD) else certain[key]
                minter.mint(
                    span["type"], span["value"],
                    score=1.0 if basis["layer"] == "regex" else basis["score"],
                    layer=basis["layer"],
                    pattern=basis["pattern"] if basis["layer"] == "regex" else basis["label"],
                    token=token, source=name,
                )
                planned[name].append((span["start"], span["end"], token))
                continue

            decision = _answer_for(resolved, token, span["value"])
            if decision == "strip":
                # layer "user": the person stripped it, the model only asked (the extension's
                # trace reports it so, without having to match token ids).
                minter.mint(
                    span["type"], span["value"],
                    score=span["score"], layer="user", pattern=span["label"],
                    token=token, source=name,
                )
                planned[name].append((span["start"], span["end"], token))
                continue

            if decision == "keep":
                # The user already said this is not personal data. Leave the text
                # alone and do not ask again this session.
                continue

            if token in asked:
                continue
            asked.add(token)
            top, first_source = best[key]
            uncertain.append({
                "id": token,
                "token": token,
                "label": top["label"],
                "score": round(float(top["score"]), 4),
                "preview": span["value"],
                "source": first_source,
            })
    return planned


def _render(text: str, planned: list) -> str:
    """Apply replacements in descending start order so an earlier substitution
    cannot shift the offsets of one still pending."""
    working = text
    for start, end, token in sorted(planned, key=lambda p: p[0], reverse=True):
        working = working[:start] + token + working[end:]
    return working


def _render_each(texts: list, planned: list) -> dict:
    """Apply replacements planned over "\\n".join(texts) back onto each text on its own.
    No span crosses a separator: GLiNER scores one line at a time and no regex pattern
    matches a newline."""
    out, start = {}, 0
    for text in texts:
        end = start + len(text)
        local = [(s - start, e - start, tok) for s, e, tok in planned if start <= s and e <= end]
        out[text] = _render(text, local)
        start = end + 1
    return out


def _apply(text: str, spans: list, minter: TokenMinter, source: str,
           resolved: dict, uncertain: list) -> str:
    """Decide and replace the spans of one source on its own."""
    return _render(text, _decide([(source, spans)], minter, resolved, uncertain)[source])


# Element labels (added 29 September 2026). strip() used to return elements
# unchanged apart from the pii flag, so a label such as "Signed in as <name>"
# reached POST /plan in plaintext even when the same name had been tokenized in
# sanitizedDom. A label is short and has no context of its own, so it is not
# scored by GLiNER here (the same text was already scored as part of the DOM
# line that carries it); instead:
#   1. the regex layer runs on it, minting through the shared minter, and
#   2. every value minted anywhere in this request is replaced by its token,
#      longest first, as an exact substring, in one pass so an inserted token
#      is never re-matched by a shorter value.
# A value the user chose to keep was never minted, so it stays.
def _tokenize_label(label: str, minter: TokenMinter) -> str:
    if not label:
        return label
    for span in redactor.regex_spans(label):
        minter.mint(span["type"], span["value"], score=1.0, layer="regex",
                    pattern=span["pattern"], source="label")
    by_value = {}
    for token, value in minter.tokens.items():
        if value:
            by_value.setdefault(value, token)
    if not by_value:
        return label
    # Whole-word only where the value starts or ends with a word character, so a
    # minted "Ravi" never rewrites the inside of "Ravishankar" (which the planner
    # would then see as "PERSONNAME#1shankar": broken text and a false token).
    def _bounded(v: str) -> str:
        head = r"(?<!\w)" if re.match(r"\w", v[0]) else ""
        tail = r"(?!\w)" if re.match(r"\w", v[-1]) else ""
        return head + re.escape(v) + tail

    ordered = sorted(by_value, key=len, reverse=True)
    alternation = re.compile("|".join(_bounded(v) for v in ordered))

    def _sub(m: "re.Match[str]") -> str:
        token = by_value[m.group(0)]
        minter.record(token, "label")
        return token

    return alternation.sub(_sub, label)


def strip(task: str, dom: str, elements: list, resolved: dict) -> dict:
    resolved = resolved or {}
    elements = elements or []
    minter = TokenMinter()
    uncertain: list = []

    task_text = task or ""
    dom_text = dom or ""

    # Labels the DOM text does not carry (3 October 2026). content.js cuts the serialised
    # DOM at 30 KB, so on a long page the last controls' labels were never scored by
    # GLiNER: _tokenize_label only applies regex and values minted elsewhere, and a name
    # there reached /plan in plaintext. Every distinct label not already inside the DOM
    # text is scored, one line each (so one batched, cached GLiNER call), and decided in
    # the same pass as the task and DOM: one token per value, one question per value.
    unscored = []
    for el in elements:
        label = el.get("label")
        if isinstance(label, str) and label.strip() and label not in dom_text and label not in unscored:
            unscored.append(label)
    labels_text = "\n".join(unscored)

    sources = [
        ("task", _merge_spans(redactor.regex_spans(task_text), entities.gliner_spans(task_text))),
        ("dom", _merge_spans(redactor.regex_spans(dom_text), entities.gliner_spans(dom_text))),
        ("label", _merge_spans(redactor.regex_spans(labels_text), entities.gliner_spans(labels_text))),
    ]
    planned = _decide(sources, minter, resolved, uncertain)
    tokenized_task = _render(task_text, planned["task"])
    sanitized_dom = _render(dom_text, planned["dom"])
    rendered_labels = _render_each(unscored, planned["label"])

    out_elements = []
    for el in elements:
        # pii is classified on the page's own label, before tokenization, so
        # the flag means what it always meant: this control names a PII field.
        item = dict(el, pii=_element_is_pii(el))
        if isinstance(el.get("label"), str):
            item["label"] = _tokenize_label(rendered_labels.get(el["label"], el["label"]), minter)
        out_elements.append(item)

    return {
        "tokenizedTask": tokenized_task,
        "sanitizedDom": sanitized_dom,
        "tokens": dict(minter.tokens),
        "elements": out_elements,
        "uncertain": uncertain,
        "decisions": list(minter.decisions),
    }

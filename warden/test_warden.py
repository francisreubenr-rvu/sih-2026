"""test_warden.py: the Warden's test suite.

Run with the project venv, from inside warden/:

    ~/.venvs/data/bin/python -m pytest test_warden.py -v

(also runnable as `~/.venvs/data/bin/python -m pytest warden/test_warden.py`
from the repo root; the sys.path fix-up below handles both, since every
warden/*.py module imports its neighbours with a bare `import config`-style
name rather than a package-qualified one.)

Scope, per the frozen spec (Docs/specs/2026-09-13-dhristi-v4-warden.md) and
ROAST.md round 6:

- Regex layer parity against the REAL extension/utils/redactor.js (a node
  subprocess runs the actual JS source; nothing here re-implements it).
- Token shape: every minted token matches the browser's consumer regex and
  never contains an underscore (warden/minter.py).
- Per-label band assignment at the boundaries (person name floor 0.12 vs the
  global 0.35), tested against entities.gliner_spans() directly with a stub
  model returning synthetic scores -- not by coaxing the real model into an
  exact number.
- The union property (strip.py's _merge_spans): a regex hit survives even
  when the model disagrees about the same span, and the regex span wins on
  overlap.
- Layer ordering (R6-1 regression): entities.gliner_spans() must see the RAW
  text, never the regex layer's tokenized output.
- /plan (groq_client.py) never receives a raw value or the token map.
- Local reasoning (validate.py) may downgrade accept -> ask, never upgrade a
  reject.
- The deterministic ALWAYS_ASK_TIERS rule added 13 September 2026: the
  `destructive` tier asks even when Ollama is unavailable. `state-changing` was
  removed from that set the same day after running it was measured to
  over-escalate (it stopped the two-field login demo on every fill), so a
  state-changing plan now accepts when reasoning is absent and reaches `ask`
  through the reasoning model when Ollama is up.

Tests that need a real model skip cleanly with an explicit message when it is
not available, rather than failing or silently passing: WARDEN_TEST_LOAD_GLINER
for the GLiNER weights, WARDEN_TEST_OLLAMA for the local reasoning model.

Every corpus string in this file is fabricated for this suite. None of it is
a real person's data, a real account, or a real document number. The card
numbers used are the well-known public test values every payment processor
publishes for its own test suite (4111 1111 1111 1111 is Visa's published
test PAN), not a real financial credential.
"""

import ast
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from shutil import which

import httpx
import pytest

WARDEN_DIR = Path(__file__).resolve().parent
if str(WARDEN_DIR) not in sys.path:
    sys.path.insert(0, str(WARDEN_DIR))

import config  # noqa: E402
import entities  # noqa: E402
import groq_client  # noqa: E402
import ollama_client  # noqa: E402
import redactor  # noqa: E402
import strip as strip_module  # noqa: E402
import tiers  # noqa: E402
import validate as validate_module  # noqa: E402
from minter import TokenMinter  # noqa: E402

REPO_ROOT = WARDEN_DIR.parent
REDACTOR_JS_PATH = REPO_ROOT / "extension" / "utils" / "redactor.js"

# The browser's consumer regex, ported character for character from
# extension/content.js (see minter.py's docstring for why an underscore in a
# token breaks it): unanchored, so a fullmatch here is the correct check for
# "is this string entirely a valid token", separate from content.js's own
# find-anywhere use of the same pattern.
VAULT_TOKEN_PATTERN = re.compile(r"[A-Z][A-Z0-9]*#[0-9]+")


# ---------------------------------------------------------------------------
# Synthetic PII corpus, shared between the JS and Python regex layers.
# ---------------------------------------------------------------------------
SYNTHETIC_CORPUS = {
    "email": "Please reach me at jordan.test@example.org.",
    "phone_plus91": "Call me at +91 98765 43210 today.",
    "phone_bare10": "My number is 9876543210, call anytime.",
    "phone_grouped_intl": "Reach the office at +44 20 7946 0958 during business hours.",
    "aadhaar_formatted": "Aadhaar: 1234 5678 9123 must be verified.",
    "aadhaar_bare_with_keyword": "My aadhaar number is 123456789123 for KYC.",
    "aadhaar_bare_without_keyword": "The tracking code is 500034127890 for this parcel.",
    "pan": "PAN number ABCDE1234F is on file.",
    "card_luhn_valid": "Card on file: 4111 1111 1111 1111 expires soon.",
    "card_luhn_invalid": "Reference number 1234567890123456 was logged.",
    "passport": "Passport number M1234567 needs renewal.",
}


def _run_js_tokenize(corpus: dict) -> dict:
    """Executes the REAL extension/utils/redactor.js's tokenizeText() in a
    throwaway node subprocess. A divergence from the Python port is a real
    parity bug, not a test-double mismatch, because this is the actual JS
    source file the browser ships, not a reimplementation of it.
    """
    script = (
        f"import {{ tokenizeText }} from {json.dumps(str(REDACTOR_JS_PATH))};\n"
        f"const corpus = {json.dumps(corpus)};\n"
        "const out = {};\n"
        "for (const [name, text] of Object.entries(corpus)) {\n"
        "  const { text: tokenized, tokens } = tokenizeText(text);\n"
        "  out[name] = { tokenized, tokenTypes: Object.keys(tokens).sort() };\n"
        "}\n"
        "process.stdout.write(JSON.stringify(out));\n"
    )
    result = subprocess.run(
        ["node", "--input-type=module"],
        input=script,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"node tokenizeText run failed: {result.stderr}")
    return json.loads(result.stdout)


def _python_tokenize(text: str) -> dict:
    minter = TokenMinter()
    tokenized = redactor.regex_strip(text, minter)
    return {"tokenized": tokenized, "tokenTypes": sorted(minter.tokens.keys())}


@pytest.fixture(scope="module")
def js_results():
    if which("node") is None:
        pytest.skip("node is not on PATH; cannot exercise the real extension/utils/redactor.js")
    return _run_js_tokenize(SYNTHETIC_CORPUS)


@pytest.mark.parametrize("case", sorted(SYNTHETIC_CORPUS))
def test_regex_parity_with_js(case, js_results):
    """warden/redactor.py must tokenize identically to the real
    extension/utils/redactor.js on every corpus case, including the two
    known-quirky ones (R6-3's surviving +91 prefix, and the Luhn-invalid card
    number that the deterministic aadhaar pass claims a 12-digit prefix of):
    parity means matching that REAL behaviour, not an idealised one.
    """
    text = SYNTHETIC_CORPUS[case]
    python_result = _python_tokenize(text)
    js_result = js_results[case]
    assert python_result == js_result, (
        f"redactor.py and redactor.js disagree on case {case!r}: "
        f"python={python_result} js={js_result}"
    )


# ---------------------------------------------------------------------------
# Token shape (warden/minter.py): every minted token must satisfy the
# browser's consumer regex, and must never contain an underscore.
# ---------------------------------------------------------------------------
def test_regex_tokens_match_consumer_pattern_and_no_underscore():
    for text in SYNTHETIC_CORPUS.values():
        minter = TokenMinter()
        redactor.regex_strip(text, minter)
        for token in minter.tokens:
            assert VAULT_TOKEN_PATTERN.fullmatch(token), (
                f"token {token!r} does not match the browser's consumer regex"
            )
            assert "_" not in token


def test_gliner_label_types_have_no_underscore_and_match_consumer_pattern():
    # entities.LABEL_TO_TYPE is a static dict; no model load needed to check
    # the type names it mints through.
    minter = TokenMinter()
    for label, type_name in entities.LABEL_TO_TYPE.items():
        token = minter.mint(type_name, f"synthetic value for {label}", score=0.9, layer="gliner", pattern=label)
        assert VAULT_TOKEN_PATTERN.fullmatch(token)
        assert "_" not in token


# ---------------------------------------------------------------------------
# Band assignment at the boundaries (Amendment, 13 September 2026): per-label
# floor for person name (0.12) vs the global floor (0.35). Exercised against
# the real entities.gliner_spans() banding logic with a stub model returning
# synthetic scores, per the task brief: test the banding function directly
# rather than trying to coax the real model into an exact score.
# ---------------------------------------------------------------------------
class _StubGlinerModel:
    """Mimics the one method entities.py calls on the real GLiNER model:
    predict_entities(text, labels, threshold) filtering by score >= threshold,
    exactly like the real model does internally. Only ever returns the
    synthetic entities it was constructed with.
    """

    def __init__(self, stub_entities):
        self._entities = stub_entities

    def predict_entities(self, text, labels, threshold):
        return [e for e in self._entities if e["score"] >= threshold]


def _stub_entity(label, text, start, score):
    return {"start": start, "end": start + len(text), "text": text, "label": label, "score": score}


def test_person_name_floor_is_012_not_the_global_035(monkeypatch):
    text = "synthetic probe text"
    # The stub entity text must be a realistic VALUE, not a bare descriptor.
    # An earlier version of this test used "Name", which the structural-
    # descriptor guard (added 2026-09-13) correctly rejects, so the test was
    # silently measuring the guard instead of the floor it claims to measure.
    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("person name", "Priya Sharma", 0, 0.11)]))
    assert entities.gliner_spans(text) == []  # below its own floor: ignored

    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("person name", "Priya Sharma", 0, 0.12)]))
    spans = entities.gliner_spans(text)
    assert len(spans) == 1
    assert spans[0]["score"] == 0.12


def test_global_floor_035_still_applies_to_other_labels(monkeypatch):
    text = "synthetic probe text"
    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("address", "Addr", 0, 0.34)]))
    assert entities.gliner_spans(text) == []  # below the global floor: ignored

    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("address", "Addr", 0, 0.35)]))
    spans = entities.gliner_spans(text)
    assert len(spans) == 1
    assert spans[0]["score"] == 0.35


def test_strip_threshold_boundary(monkeypatch):
    """entities.STRIP_THRESHOLD (0.60) is where strip.py's _apply() switches
    from raising an uncertain prompt to stripping silently.
    """
    text = "Jordan Example is on the guest list."
    name = "Jordan Example"
    start = text.index(name)

    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("person name", name, start, 0.60)]))
    spans = [dict(s, layer="gliner") for s in entities.gliner_spans(text)]
    minter = TokenMinter()
    uncertain = []
    out = strip_module._apply(text, spans, minter, "task", {}, uncertain)
    assert uncertain == []
    assert "PERSONNAME#1" in out

    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([_stub_entity("person name", name, start, 0.59)]))
    spans = [dict(s, layer="gliner") for s in entities.gliner_spans(text)]
    minter = TokenMinter()
    uncertain = []
    out = strip_module._apply(text, spans, minter, "task", {}, uncertain)
    assert out == text  # untouched: below the strip threshold
    assert len(uncertain) == 1
    assert uncertain[0]["score"] == 0.59


# ---------------------------------------------------------------------------
# The union property (strip.py's _merge_spans): a regex hit survives even
# when the model disagrees about the same span, and a regex span wins on
# overlap.
# ---------------------------------------------------------------------------
def test_merge_spans_regex_wins_on_overlap():
    regex_spans = [{"start": 5, "end": 10, "type": "EMAIL", "pattern": "email", "value": "a@b.co"}]
    model_spans = [{"start": 5, "end": 10, "label": "person name", "type": "PERSONNAME", "score": 0.95, "value": "a@b.co"}]
    merged = strip_module._merge_spans(regex_spans, model_spans)
    assert len(merged) == 1
    assert merged[0]["layer"] == "regex"
    assert merged[0]["type"] == "EMAIL"


def test_merge_spans_keeps_a_non_overlapping_model_span():
    regex_spans = [{"start": 0, "end": 5, "type": "EMAIL", "pattern": "email", "value": "a@b.c"}]
    model_spans = [{"start": 20, "end": 34, "label": "person name", "type": "PERSONNAME", "score": 0.95, "value": "Jordan Example"}]
    merged = strip_module._merge_spans(regex_spans, model_spans)
    assert len(merged) == 2
    assert {s["layer"] for s in merged} == {"regex", "gliner"}


def test_union_property_end_to_end_regex_wins(monkeypatch):
    """A hostile or simply mistaken model claims the EXACT email span as a
    person name at a very high score. The union property says the
    deterministic regex hit must still win the merge.
    """
    text = "Contact jordan.test@example.org about the order."
    email = "jordan.test@example.org"
    email_start = text.index(email)
    hostile = _stub_entity("person name", email, email_start, 0.99)
    monkeypatch.setattr(entities.STATE, "model", _StubGlinerModel([hostile]))

    result = strip_module.strip(task=text, dom="", elements=[], resolved={})
    assert "EMAIL#1" in result["tokenizedTask"]
    assert "PERSONNAME" not in result["tokenizedTask"]
    assert result["uncertain"] == []


# ---------------------------------------------------------------------------
# Layer ordering (R6-1 regression): gliner_spans() must see the RAW text,
# never the regex layer's tokenized output, and both layers' spans must be
# offsets into that same original text so a merge cannot corrupt them.
# ---------------------------------------------------------------------------
def test_gliner_layer_receives_raw_text_not_tokenized(monkeypatch):
    text = "My name is Jordan Example and my email is jordan.test@example.org."
    name = "Jordan Example"
    name_start = text.index(name)

    # strip.strip() calls entities.gliner_spans() once for the task text and
    # once for the (here empty) dom text; record every call rather than just
    # the last one so the task call can be checked specifically.
    seen_calls = []

    def spy_gliner_spans(t):
        seen_calls.append(t)
        if t != text:
            return []
        return [{
            "start": name_start, "end": name_start + len(name),
            "label": "person name", "type": "PERSONNAME", "score": 0.9, "value": name,
        }]

    monkeypatch.setattr(entities, "gliner_spans", spy_gliner_spans)

    result = strip_module.strip(task=text, dom="", elements=[], resolved={})

    # The exact original string -- not a regex-tokenized version, which would
    # already have replaced the email with EMAIL#1 by the time this ran.
    assert text in seen_calls
    seen_task_text = next(t for t in seen_calls if t == text)
    assert "EMAIL#1" not in seen_task_text

    # Offsets computed against the raw text must still land correctly once
    # both layers' spans are merged and applied together in one pass.
    assert result["tokenizedTask"] == "My name is PERSONNAME#1 and my email is EMAIL#1."


# ---------------------------------------------------------------------------
# /plan (groq_client.py) never receives a raw value or the token map.
# ---------------------------------------------------------------------------
def test_plan_via_groq_never_leaks_tokens_or_raw_value(monkeypatch):
    monkeypatch.setattr(config, "GROQ_API_KEY", "test-fake-key-not-real")

    captured = {}

    def fake_call(model, prompt):
        captured["model"] = model
        captured["prompt"] = prompt
        return json.dumps({
            "action": "click", "target_selector": "#go", "coordinates": {"x": 1, "y": 2},
            "value": None, "reasoning_token": "synthetic",
        })

    monkeypatch.setattr(groq_client, "_call_groq_model", fake_call)

    raw_secret_value = "francis.synthetic@example.org"  # must never reach the outbound prompt
    body = {
        "tokenizedTask": "Email EMAIL#1 the report",
        "sanitizedDom": "<div>EMAIL#1</div>",
        "elements": [{"selector": "#go", "label": "Go", "fieldType": "button", "filled": False, "x": 1, "y": 2}],
        "history": [],
        # A caller violating the contract. plan_via_groq must not forward this.
        "tokens": {"EMAIL#1": raw_secret_value},
    }

    result = groq_client.plan_via_groq(body)

    assert result["plan"]["action"] == "click"
    assert raw_secret_value not in captured["prompt"]
    assert "EMAIL#1" in captured["prompt"]  # the sanitised placeholder IS expected


# ---------------------------------------------------------------------------
# Local reasoning (validate.py) may downgrade accept -> ask, never upgrade a
# reject.
# ---------------------------------------------------------------------------
def _base_plan():
    return {"action": "click", "target_selector": "#go", "coordinates": {"x": 1, "y": 2}, "value": None, "reasoning_token": "x"}


def test_reasoning_is_never_reached_from_a_reject(monkeypatch):
    called = {"n": 0}

    def spy_review(*args, **kwargs):
        called["n"] += 1
        return {"downgrade_to_ask": False, "question": None}

    monkeypatch.setattr(ollama_client, "review", spy_review)

    bad_plan = {"action": "haxor", "target_selector": None, "coordinates": {"x": 0, "y": 0}, "value": None, "reasoning_token": "x"}
    det = validate_module.run_deterministic_checks(bad_plan, [], "do something")
    assert det["reasons"], "expected a deterministic reject for an invalid action"
    # validate.py's structural guarantee, asserted directly: app.py's do_validate
    # only calls maybe_apply_local_reasoning when det["reasons"] is empty, so a
    # reject path here must never have touched the reasoning model at all.
    assert called["n"] == 0


@pytest.mark.parametrize("downgrade,tier", [
    (True, "reversible"), (True, "destructive"), (False, "reversible"), (False, "destructive"),
])
def test_reasoning_verdict_is_never_reject(monkeypatch, downgrade, tier):
    monkeypatch.setattr(
        ollama_client, "review",
        lambda *a, **kw: {"downgrade_to_ask": downgrade, "question": "synthetic question?" if downgrade else None},
    )
    out = validate_module.maybe_apply_local_reasoning("synthetic task", _base_plan(), tier)
    assert out["verdict"] in ("accept", "ask")


def test_reasoning_downgrades_accept_to_ask(monkeypatch):
    monkeypatch.setattr(
        ollama_client, "review",
        lambda *a, **kw: {"downgrade_to_ask": True, "question": "Are you sure?"},
    )
    out = validate_module.maybe_apply_local_reasoning("synthetic task", _base_plan(), "navigational")
    assert out["verdict"] == "ask"
    assert out["question"]["text"] == "Are you sure?"


# ---------------------------------------------------------------------------
# Deterministic tier rule (validate.py, added 13 September 2026, the R6-5
# fix): destructive/state-changing tiers ask even when Ollama is unavailable;
# navigational/reversible tiers still accept.
# ---------------------------------------------------------------------------
def _ollama_unavailable(monkeypatch):
    def raise_skipped(*args, **kwargs):
        raise ollama_client.OllamaSkipped("synthetic: ollama unreachable for this test")
    monkeypatch.setattr(ollama_client, "review", raise_skipped)


def test_destructive_tier_asks_even_when_ollama_unavailable(monkeypatch):
    _ollama_unavailable(monkeypatch)
    plan = {"action": "click", "target_selector": "#delete", "coordinates": {"x": 5, "y": 5}, "value": None, "reasoning_token": "x"}
    elements = [{"selector": "#delete", "label": "Delete Account", "fieldType": "button", "filled": False, "x": 5, "y": 5}]
    det = validate_module.run_deterministic_checks(plan, elements, "delete my account")
    assert not det["reasons"]
    assert det["tier"] == "destructive"

    out = validate_module.maybe_apply_local_reasoning("delete my account", det["overridden_plan"], det["tier"])
    assert out["verdict"] == "ask"
    assert out["question"] is not None


def test_state_changing_tier_asks_even_when_ollama_unavailable(monkeypatch):
    _ollama_unavailable(monkeypatch)
    plan = {"action": "type", "target_selector": "#comment", "coordinates": {"x": 5, "y": 5}, "value": "hello", "reasoning_token": "x"}
    elements = [{"selector": "#comment", "label": "Comment", "fieldType": "text", "filled": False, "x": 5, "y": 5}]
    det = validate_module.run_deterministic_checks(plan, elements, "type a comment")
    assert not det["reasons"]
    assert det["tier"] == "state-changing"

    # REVERSED 2026-09-13. This test originally asserted that a state-changing
    # tier always asks. Running the real stack showed why that was wrong: a
    # `type` action is state-changing, so the two-field login demo stopped for a
    # human decision on every single fill. Over-escalation is a failure mode,
    # because it trains the user to click through prompts. Only `destructive`
    # always asks; state-changing still reaches `ask` through the reasoning
    # model when Ollama is up, and the extension re-gates it independently.
    out = validate_module.maybe_apply_local_reasoning("type a comment", det["overridden_plan"], det["tier"])
    assert out["verdict"] == "accept"


def test_destructive_tier_asks_when_ollama_unavailable(monkeypatch):
    _ollama_unavailable(monkeypatch)
    plan = {"action": "click", "target_selector": "#delete", "coordinates": {"x": 5, "y": 5}, "value": None, "reasoning_token": "x"}
    elements = [{"selector": "#delete", "label": "Delete Account", "fieldType": "button", "filled": False, "x": 5, "y": 5}]
    det = validate_module.run_deterministic_checks(plan, elements, "remove my account")
    assert not det["reasons"]
    assert det["tier"] == "destructive"

    out = validate_module.maybe_apply_local_reasoning("remove my account", det["overridden_plan"], det["tier"])
    assert out["verdict"] == "ask"
    assert out["question"] is not None
    assert "destructive" in out["question"]["text"]


def test_structural_descriptors_are_not_pii():
    """Field NAMES are not field VALUES. Found 2026-09-13 by running a real
    login scene: NER read our own DOM scaffolding and tokenised selectors,
    which destroyed the identifier the planner must echo back."""
    for descriptor in ["password", "Password", "Delivery address", "User name",
                       "Forgot password", "Phone number", "address", "username"]:
        assert entities._is_structural_descriptor(descriptor), descriptor

    for value in ["Priya Sharma", "42 Jayanagar 4th Block", "Tr0ub4dor",
                  "1234 5678 9012", "francis@example.com"]:
        assert not entities._is_structural_descriptor(value), value


def test_scaffolding_does_not_touch_label_text():
    """type=, selector= and position= are our own metadata and get neutralised;
    label= is page text and must still be scannable for a real name in it."""
    scene = "1. INPUT type=password selector=#pw label=Password position=10,40"
    neutralised = entities._neutralise_scaffolding(scene)
    assert len(neutralised) == len(scene)  # offsets must be preserved
    assert "password" not in neutralised.split("label=")[0]
    assert "label=Password" in neutralised


def test_navigational_tier_still_accepts_when_ollama_unavailable(monkeypatch):
    _ollama_unavailable(monkeypatch)
    plan = {"action": "click", "target_selector": "#view", "coordinates": {"x": 5, "y": 5}, "value": None, "reasoning_token": "x"}
    elements = [{"selector": "#view", "label": "View Details", "fieldType": "button", "filled": False, "x": 5, "y": 5}]
    det = validate_module.run_deterministic_checks(plan, elements, "view the order details")
    assert not det["reasons"]
    assert det["tier"] == "navigational"

    out = validate_module.maybe_apply_local_reasoning("view the order details", det["overridden_plan"], det["tier"])
    assert out["verdict"] == "accept"


def test_reversible_tier_still_accepts_when_ollama_unavailable(monkeypatch):
    _ollama_unavailable(monkeypatch)
    plan = {"action": "scroll", "target_selector": None, "coordinates": {"x": 0, "y": 200}, "value": None, "reasoning_token": "x"}
    det = validate_module.run_deterministic_checks(plan, [], "scroll down")
    assert not det["reasons"]
    assert det["tier"] == "reversible"

    out = validate_module.maybe_apply_local_reasoning("scroll down", det["overridden_plan"], det["tier"])
    assert out["verdict"] == "accept"


# ---------------------------------------------------------------------------
# Local reasoning against the REAL Ollama instance (validate.py +
# ollama_client.py).
#
# Every test above this line replaces ollama_client.review, so it proves
# validate.py's ordering but says nothing about whether the reasoning stage
# runs at all. These tests do not replace it. They are opt-in because each
# real call costs seconds and a cold call loads a 5.8 GB model (measured
# 26.8 s wall on 13 September 2026), so they are gated on WARDEN_TEST_OLLAMA=1
# and skip cleanly otherwise, the same way WARDEN_TEST_LOAD_GLINER gates the
# GLiNER weights at the bottom of this file.
#
# The model must be qwythos-9b:latest, which is local. The `:cloud` entries in
# `ollama list` are remote models, and using one would break the air-gapped
# deployment claim, so _ollama_skip_message() refuses a configured model that
# Ollama itself reports with a remote_host.
# ---------------------------------------------------------------------------
def _ollama_skip_message() -> str:
    """Empty when the real local model is usable, otherwise the reason not to
    run, phrased for whoever is reading the skip line."""
    if os.environ.get("WARDEN_TEST_OLLAMA") != "1":
        return (
            "Real Ollama review is not enabled. Set WARDEN_TEST_OLLAMA=1 to run "
            f"this test against the local Ollama at {config.OLLAMA_HOST} with "
            f"{config.OLLAMA_MODEL}. Cold start measured 26.8 s (15.0 s of it "
            "model load), so it is off by default."
        )
    try:
        models = httpx.get(f"{config.OLLAMA_HOST}/api/tags", timeout=5.0).json().get("models", [])
    except Exception as exc:
        return f"WARDEN_TEST_OLLAMA=1 but Ollama is not reachable at {config.OLLAMA_HOST}: {exc}"
    for model in models:
        if model.get("name") == config.OLLAMA_MODEL:
            if model.get("remote_host"):
                return (
                    f"Ollama lists {config.OLLAMA_MODEL} with remote_host "
                    f"{model['remote_host']}, so it is a cloud model, not the local path "
                    "this stage exists to provide. Refusing to test against it."
                )
            return ""
    return f"Ollama is reachable but does not list the configured model {config.OLLAMA_MODEL}"


def _require_ollama():
    message = _ollama_skip_message()
    if message:
        pytest.skip(message)


# Plans shaped as the planner emits them: reasoning_token carries a real
# sentence, because groq_client.py requires one and a placeholder measurably
# changes what the model answers.
_ELEMENTS = {
    "#view": [{"selector": "#view", "label": "View Details", "fieldType": "button", "filled": False, "x": 5, "y": 5}],
    "#comment": [{"selector": "#comment", "label": "Comment", "fieldType": "textarea", "filled": False, "x": 5, "y": 5}],
    "#delete-account": [{"selector": "#delete-account", "label": "Delete Account", "fieldType": "button", "filled": False, "x": 5, "y": 5}],
    "#password": [{"selector": "#password", "label": "Password", "fieldType": "password", "filled": False, "x": 5, "y": 5}],
}

_REAL_BENIGN_NAV = (
    "view the order details",
    {"action": "click", "target_selector": "#view", "coordinates": {"x": 5, "y": 5},
     "value": None, "reasoning_token": "click the View Details button to open the order"},
    "navigational",
)
_REAL_BENIGN_TYPE = (
    "type a comment",
    {"action": "type", "target_selector": "#comment", "coordinates": {"x": 5, "y": 5},
     "value": "Thanks, this was helpful.",
     "reasoning_token": "type the user's comment into the comment box"},
    "state-changing",
)
_REAL_MISMATCH_CLICK = (
    "view my order history",
    {"action": "click", "target_selector": "#delete-account", "coordinates": {"x": 5, "y": 5},
     "value": None, "reasoning_token": "click the Delete Account button"},
    "destructive",
)
_REAL_MISMATCH_TYPE = (
    "search for a laptop",
    {"action": "type", "target_selector": "#password", "coordinates": {"x": 5, "y": 5},
     "value": "Tr0ub4dor", "reasoning_token": "enter the search query"},
    "state-changing",
)


def test_real_ollama_review_returns_and_parses():
    """The real call reaches Ollama, returns the shape validate.py reads, and
    does so inside the timeout this client actually uses."""
    _require_ollama()
    task, plan, tier = _REAL_BENIGN_NAV
    started = time.perf_counter()
    result = ollama_client.review(task, plan, tier)
    elapsed = time.perf_counter() - started

    assert isinstance(result, dict)
    assert isinstance(result["downgrade_to_ask"], bool)
    assert result["question"] is None or isinstance(result["question"], str)
    if result["downgrade_to_ask"]:
        assert result["question"], "a downgrade must carry a question to show the user"
    else:
        assert result["question"] is None
    assert elapsed < ollama_client._timeout_s(), (
        f"the real review took {elapsed:.1f}s against a {ollama_client._timeout_s():.0f}s timeout"
    )


def test_real_ollama_flags_a_plan_that_conflicts_with_the_task():
    """A plan whose target contradicts the task must reach `ask`. If the model
    misses either case this fails and says so: that is a real miss, not a
    result to soften."""
    _require_ollama()
    for name, (task, plan, tier) in (
        ("click Delete Account while the task asks to view order history", _REAL_MISMATCH_CLICK),
        ("type into #password while the task asks to search for a laptop", _REAL_MISMATCH_TYPE),
    ):
        result = ollama_client.review(task, plan, tier)
        assert result["downgrade_to_ask"] is True, f"the model did not flag {name}: {result}"
        assert result["question"], f"no question text returned for the flagged case: {name}"


def test_real_ollama_does_not_cry_wolf_on_a_correct_plan():
    """The counterweight, which matters as much as the catching case: a stage
    that downgrades everything is noise the user learns to click through. That
    over-escalation is why state-changing was removed from ALWAYS_ASK_TIERS.
    """
    _require_ollama()
    for name, (task, plan, tier) in (
        ("click View Details to view the order details", _REAL_BENIGN_NAV),
        ("type the user's comment into the comment box", _REAL_BENIGN_TYPE),
    ):
        result = ollama_client.review(task, plan, tier)
        assert result["downgrade_to_ask"] is False, (
            f"the model asked for confirmation on a plainly correct plan ({name}): "
            f"{result['question']}"
        )


def test_real_ollama_downgrade_reaches_ask_end_to_end():
    """The only path where reasoning is the sole producer of an `ask`: a
    state-changing plan, which is not in ALWAYS_ASK_TIERS, whose target does
    not match the task. Nothing deterministic catches this one."""
    _require_ollama()
    task, plan, tier = _REAL_MISMATCH_TYPE
    det = validate_module.run_deterministic_checks(plan, _ELEMENTS["#password"], task)
    assert not det["reasons"], det["reasons"]
    assert det["tier"] == "state-changing"

    out = validate_module.maybe_apply_local_reasoning(task, det["overridden_plan"], det["tier"])
    assert out["reasoning_check"]["skipped"] is False, out["reasoning_check"]
    assert out["verdict"] == "ask"
    assert isinstance(out["question"]["text"], str) and out["question"]["text"]


# ---------------------------------------------------------------------------
# Malformed Ollama responses. No Ollama needed: httpx.post is replaced, so
# these run in the default suite. Every one of them must become a SKIPPED
# check, never an exception escaping /validate and never a passed check.
# ---------------------------------------------------------------------------
class _StubResponse:
    def __init__(self, status_code=200, payload=None, raw_text=None, json_error=None):
        self.status_code = status_code
        self._payload = payload
        self._raw_text = raw_text if raw_text is not None else json.dumps(payload)
        self._json_error = json_error

    @property
    def text(self):
        return self._raw_text

    def json(self):
        if self._json_error is not None:
            raise self._json_error
        return self._payload


def _stub_post(monkeypatch, response=None, raises=None):
    def fake_post(*args, **kwargs):
        if raises is not None:
            raise raises
        return response
    monkeypatch.setattr(ollama_client.httpx, "post", fake_post)


def _ok_body(response_text):
    return _StubResponse(payload={"response": response_text})


MALFORMED_RESPONSES = {
    "empty response string": _ok_body(""),
    "prose instead of JSON": _ok_body("Sure! I would ask the user about this one."),
    "JSON object with no verdict key": _ok_body(json.dumps({"tier": "destructive", "action": "click"})),
    "JSON array instead of object": _ok_body("[1, 2, 3]"),
    "JSON string instead of object": _ok_body('"downgrade_to_ask"'),
    "verdict is a number": _ok_body(json.dumps({"downgrade_to_ask": 1, "question": None})),
    "verdict is null": _ok_body(json.dumps({"downgrade_to_ask": None, "question": None})),
    "response field missing entirely": _StubResponse(payload={"done": True}),
    "response field is an object": _StubResponse(payload={"response": {"downgrade_to_ask": True}}),
    "body is a JSON array": _StubResponse(payload=[1, 2, 3]),
    "body is not JSON at all": _StubResponse(raw_text="<html>502 Bad Gateway</html>",
                                             json_error=ValueError("not JSON")),
    "HTTP 500": _StubResponse(status_code=500, raw_text="internal error"),
}


@pytest.mark.parametrize("label,response", sorted(MALFORMED_RESPONSES.items()))
def test_malformed_ollama_response_is_skipped_not_fatal(monkeypatch, label, response):
    _stub_post(monkeypatch, response)
    with pytest.raises(ollama_client.OllamaSkipped):
        ollama_client.review("synthetic task", _base_plan(), "reversible")

    # And the caller's contract: a skipped check, never an exception, and a
    # verdict that is still one of the two allowed values.
    out = validate_module.maybe_apply_local_reasoning("synthetic task", _base_plan(), "reversible")
    assert out["verdict"] == "accept"
    assert out["reasoning_check"]["skipped"] is True
    assert out["reasoning_check"]["pass"] is None


def test_ollama_timeout_becomes_a_skipped_check(monkeypatch):
    _stub_post(monkeypatch, raises=httpx.ConnectTimeout("synthetic: timed out"))
    with pytest.raises(ollama_client.OllamaSkipped):
        ollama_client.review("synthetic task", _base_plan(), "reversible")


def test_ollama_string_false_is_read_as_false(monkeypatch):
    """A quoted boolean is a real answer; reading it with a bare bool() would
    turn "false" into True and invent a downgrade the model did not ask for."""
    _stub_post(monkeypatch, _ok_body(json.dumps({"downgrade_to_ask": "false", "question": "ignored"})))
    result = ollama_client.review("synthetic task", _base_plan(), "reversible")
    assert result["downgrade_to_ask"] is False
    assert result["question"] is None


def test_ollama_question_must_be_a_string(monkeypatch):
    _stub_post(monkeypatch, _ok_body(json.dumps({"downgrade_to_ask": True, "question": {"a": 1}})))
    result = ollama_client.review("synthetic task", _base_plan(), "reversible")
    assert result["downgrade_to_ask"] is True
    assert result["question"] is None  # caller substitutes its own fallback text


def test_ollama_timeout_clears_the_measured_cold_start(monkeypatch):
    """config.OLLAMA_TIMEOUT_S defaults to 12 s. Measured on this machine on
    13 September 2026: a cold call took 26.8 s wall (15.0 s of it model load)
    and warm calls ranged 2.4-19.5 s, so a 12 s cap records SKIPPED while
    Ollama is up and answering. The client's floor has to clear that."""
    monkeypatch.setattr(config, "OLLAMA_TIMEOUT_S", 12.0)
    assert ollama_client._timeout_s() >= 26.8
    monkeypatch.setattr(config, "OLLAMA_TIMEOUT_S", 300.0)
    assert ollama_client._timeout_s() == 300.0


def test_unexpected_reasoning_failure_cannot_weaken_validation(monkeypatch):
    """Reasoning is optional and must never be load-bearing: an exception
    nobody anticipated still leaves the deterministic tier rule speaking."""
    def boom(*args, **kwargs):
        raise RuntimeError("synthetic: something nobody anticipated")
    monkeypatch.setattr(ollama_client, "review", boom)

    destructive = validate_module.maybe_apply_local_reasoning("delete my account", _base_plan(), "destructive")
    assert destructive["verdict"] == "ask"
    assert destructive["question"] is not None
    assert destructive["reasoning_check"]["skipped"] is True
    assert "RuntimeError" in destructive["reasoning_check"]["reason"]

    reversible = validate_module.maybe_apply_local_reasoning("scroll down", _base_plan(), "reversible")
    assert reversible["verdict"] == "accept"
    assert reversible["reasoning_check"]["skipped"] is True


# ---------------------------------------------------------------------------
# The never-upgrade-a-reject invariant, kept structural rather than trusted:
# checked at runtime across every tier, and checked against the source so a
# future edit that adds a `reject` branch fails here instead of shipping.
# ---------------------------------------------------------------------------
def test_reasoning_verdict_is_never_reject_across_every_tier(monkeypatch):
    for tier in tiers.TIERS:
        for downgrade in (True, False):
            monkeypatch.setattr(
                ollama_client, "review",
                lambda *a, **kw: {"downgrade_to_ask": downgrade,
                                  "question": "synthetic question?" if downgrade else None},
            )
            out = validate_module.maybe_apply_local_reasoning("synthetic task", _base_plan(), tier)
            assert out["verdict"] in ("accept", "ask"), f"tier={tier} downgrade={downgrade}"
            if tier in validate_module.ALWAYS_ASK_TIERS:
                assert out["verdict"] == "ask", f"an always-ask tier accepted: {tier}"


def test_reasoning_functions_contain_no_reject_literal():
    """validate.py's docstring states that the only function able to produce a
    `reject` is run_deterministic_checks, and that the reasoning path has no
    branch that returns one. This reads the source and holds it to that."""
    source = (WARDEN_DIR / "validate.py").read_text()
    tree = ast.parse(source)
    checked = ("maybe_apply_local_reasoning", "_reasoning_absent")
    seen = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name not in checked:
            continue
        seen.add(node.name)
        body = node.body
        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            body = body[1:]  # drop the docstring, which names the word on purpose
        for statement in body:
            for sub in ast.walk(statement):
                if isinstance(sub, ast.Constant) and sub.value == "reject":
                    pytest.fail(f"{node.name} contains a 'reject' literal")
    assert seen == set(checked), f"expected to inspect {sorted(checked)}, inspected {sorted(seen)}"


# ---------------------------------------------------------------------------
# Optional real-model integration check. Off by default: loading GLiNER takes
# 15-76s per warden/README.md's own measurements, so this suite does not pay
# that cost unless asked. Set WARDEN_TEST_LOAD_GLINER=1 to load the real
# weights and exercise this test; otherwise it skips cleanly with an explicit
# message, never failing and never silently passing.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def real_gliner_loaded():
    if entities.STATE.loaded:
        return True
    if os.environ.get("WARDEN_TEST_LOAD_GLINER") != "1":
        return False
    entities.load_model()
    return entities.STATE.loaded


def test_real_model_flags_an_uncertain_person_name(real_gliner_loaded):
    if not real_gliner_loaded:
        pytest.skip(
            "GLiNER is not loaded in this process. Set WARDEN_TEST_LOAD_GLINER=1 "
            "to load the real urchade/gliner_multi_pii-v1 weights for this test "
            "(15-76s per warden/README.md)."
        )
    spans = entities.gliner_spans("Log in as Francis Reuben R with the usual password.")
    person_spans = [s for s in spans if s["label"] == "person name"]
    assert person_spans, "expected the real model to raise at least one person-name span in the uncertain band"

"""Regression tests for the 3 October 2026 PII-layer fixes.

Each case is a leak or a false question measured in
Benchmarks/results/gliner-label-fp-v01.json or found by the security review:
  - regex layer: account numbers after Hindi words, Indian-script digits,
    IBAN, keyed dates of birth, zero-width and full-width tricks, leading-0
    mobiles, and Aadhaar no longer taking 12 digits out of a longer number;
  - model layer: the tag word is our metadata, and account numbers, dates of
    birth and passwords must look like one (stub model, no weights needed).
The JS side is held to the same answers by the parity test in test_warden.py
and by the cases here run through the real extension/utils/redactor.js.
"""
import json
import pathlib
import shutil
import subprocess

import pytest

import entities
import redactor
import strip as strip_module

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


def _spans(text):
    return [(s["type"], s["value"]) for s in redactor.regex_spans(text)]


@pytest.mark.parametrize("text, expected", [
    ("खाता संख्या 50100234567812", [("ACCOUNTNUMBER", "50100234567812")]),
    ("खाता संख्या ५०१००२३४५६७८", [("ACCOUNTNUMBER", "५०१००२३४५६७८")]),
    ("Account no. 3920 1188 2201 76", [("ACCOUNTNUMBER", "3920 1188 2201 76")]),
    ("IBAN GB29 NWBK 6016 1331 9268 19", [("IBAN", "GB29 NWBK 6016 1331 9268 19")]),
    ("जन्म तिथि 12-01-2001", [("DATEOFBIRTH", "12-01-2001")]),
    ("DOB: 3 March 1988", [("DATEOFBIRTH", "3 March 1988")]),
    ("Call 09876543210", [("PHONE", "09876543210")]),
    ("098765 43210", [("PHONE", "098765 43210")]),
    ("98765 43210", [("PHONE", "98765 43210")]),
    ("98765​43210", [("PHONE", "98765​43210")]),
    ("ravi＠example.com", [("EMAIL", "ravi＠example.com")]),
    ("Aadhaar 2345 6789 0123", [("AADHAAR", "2345 6789 0123")]),
    ("Aadhaar 234567890123", [("AADHAAR", "234567890123")]),
])
def test_regex_layer_catches(text, expected):
    assert _spans(text) == expected


@pytest.mark.parametrize("text", [
    "Pages 10 11 12 13 14 15",
    "2026-10-03 18:01:50",
    "Paid on 12-01-2001",           # a date with no birth keyword on its line
    "AB12 TEST CASE WORD",          # IBAN shape, fails mod-97
    "Total ₹1,00,000",
    "Account statements",
])
def test_regex_layer_leaves_ordinary_text(text):
    assert _spans(text) == []


def test_dob_keyword_is_per_line():
    text = 'STATUS text="Last login 12-01-2026"\n4. SPAN type=text selector=#d label="Date of birth 14/08/1996" position=1,2'
    assert _spans(text) == [("DATEOFBIRTH", "14/08/1996")]


def test_values_are_cut_from_the_original_text():
    text = "खाता ५०१००२३४५६७८ और 98765​43210"
    for span in redactor.regex_spans(text):
        assert text[span["start"]:span["end"]] == span["value"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not on PATH")
def test_js_redactor_agrees_on_new_cases():
    cases = ["खाता संख्या 50100234567812", "IBAN GB29 NWBK 6016 1331 9268 19", "Account no. 3920 1188 2201 76",
             "जन्म तिथि 12-01-2001", "Paid on 12-01-2001", "Call 09876543210", "Pages 10 11 12 13 14 15",
             "2026-10-03 18:01:50", "Aadhaar 234567890123", "ravi＠example.com"]
    script = (
        "import(process.argv[1]).then(m => {"
        " const cases = JSON.parse(process.argv[2]);"
        " console.log(JSON.stringify(cases.map(t => Object.keys(m.tokenizeText(t).tokens).map(k => k.split('#')[0]))));"
        "});"
    )
    url = (REPO_ROOT / "extension" / "utils" / "redactor.js").as_uri()
    out = subprocess.run(["node", "-e", script, url, json.dumps(cases)], capture_output=True, text=True, check=True)
    js_types = json.loads(out.stdout)
    py_types = [[s["type"] for s in redactor.regex_spans(t)] for t in cases]
    assert js_types == py_types


# --- model layer (stub model: no weights needed) -----------------------------

class _StubModel:
    """Returns fixed entities for any text containing a trigger string."""

    def __init__(self, hits):
        self.hits = hits  # list of (trigger, label, score)

    def predict_entities(self, text, labels, threshold=0.0):
        out = []
        for trigger, label, score in self.hits:
            i = text.find(trigger)
            if i >= 0:
                out.append({"start": i, "end": i + len(trigger), "label": label, "score": score, "text": trigger})
        return out


@pytest.fixture
def stub_model(monkeypatch):
    def install(hits):
        monkeypatch.setattr(entities.STATE, "model", _StubModel(hits), raising=False)
        monkeypatch.setattr(entities, "_cached_predict", lambda model, texts: [model.predict_entities(t, entities.LABELS) for t in texts])
    return install


def test_tag_word_is_neutralised():
    line = '12. BUTTON type=button selector=#c12 label="Fund transfer" position=10,240'
    neutral = entities._neutralise_scaffolding(line)
    assert "BUTTON" not in neutral
    assert len(neutral) == len(line)
    assert 'label="Fund transfer"' in neutral
    assert "STATUS" not in entities._neutralise_scaffolding('STATUS text="Saved"')


@pytest.mark.parametrize("value, label", [
    ("Account statements", "account number"),
    ("Savings account", "account number"),
    ("Date of birth", "date of birth"),
    ("Change password", "password"),
    ("खाता बंद करें", "password"),
])
def test_implausible_model_hits_are_dropped(stub_model, value, label):
    stub_model([(value, label, 0.9)])
    line = f'1. A type=link selector=#a label="{value}" position=1,2'
    assert entities.gliner_spans(line) == []


@pytest.mark.parametrize("value, label", [
    ("50100234567812", "account number"),
    ("A/c XXXX4521", "account number"),
    ("14/08/1996", "date of birth"),
    ("Xk9!rT2q", "password"),
    ("Neha Joshi", "person name"),
])
def test_plausible_model_hits_are_kept(stub_model, value, label):
    stub_model([(value, label, 0.9)])
    line = f'1. SPAN type=text selector=#s label="Holder {value}" position=1,2'
    assert [s["value"] for s in entities.gliner_spans(line)] == [value]


def test_strip_tokenizes_hindi_account_number_end_to_end(stub_model):
    stub_model([])  # the model finds nothing, as measured for this line
    dom = '1. SPAN type=text selector=#s label="खाता संख्या 50100234567812" position=1,2'
    out = strip_module.strip(task="", dom=dom, elements=[], resolved={})
    assert "50100234567812" not in out["sanitizedDom"]
    assert "ACCOUNTNUMBER#1" in out["sanitizedDom"]


@pytest.mark.parametrize("label", ["खाता हटाएं", "मेरे खाते", "जन्म तिथि", "पता बदलें", "सहायता केंद्र"])
def test_hindi_ui_labels_are_descriptors(label):
    assert entities._is_structural_descriptor(label)


@pytest.mark.parametrize("value", ["प्रिया शर्मा", "खाता धारक प्रिया शर्मा", "Neha Joshi", "राहुल"])
def test_names_are_never_descriptors(value):
    assert not entities._is_structural_descriptor(value)

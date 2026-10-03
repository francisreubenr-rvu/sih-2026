#!/usr/bin/env python3
"""Measure GLiNER questions on ordinary UI text, and the recall cost of a fix.

ROAST round 29 found the Warden asking the user about ordinary UI text: the link
label "Account statements" scored 0.42 as an account number, and the task "Delete
my account" 35%. Each costs a prompt and strips a label the planner needs.

This runs the Warden's own scoring path (entities.gliner_spans, strip.strip) on:
  negatives: ordinary EN/HI control labels and tasks with no personal value;
  positives: lines carrying a synthetic personal value of each type.
Both sets are hand-written by the author and synthetic; they measure this rule
on these strings, not the model in general.

Every candidate rule is reported against the shipped rule on both sets, so a
change that removes questions by losing personal values shows up as lost recall.

Run from the repo root (GLiNER weights download on first use):
    python3 scripts/gliner-label-fp/measure.py [--out Benchmarks/results/gliner-label-fp-v01.json]
"""
import argparse
import json
import pathlib
import platform
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))

import entities  # noqa: E402
import strip as strip_module  # noqa: E402

# Same format as extension/content.js serializeDom().
def line(i, tag, typ, label):
    sel = "#c" + str(i)
    return f'{i}. {tag.upper()} type={typ} selector={sel} label="{label}" position=10,{20 * i}'


NEG_LABELS = [
    # Banking and statements
    "Account statements", "Account summary", "My accounts", "Account settings", "Account details",
    "Open a new account", "Close account", "Delete my account", "Account overview", "Savings account",
    "Current account", "Account services", "Download statement", "Mini statement", "Transaction history",
    "Fund transfer", "Add beneficiary", "Manage payees", "Pay bills", "Recharge", "Card services",
    "Block card", "Debit card", "Credit card offers", "Loan accounts", "Fixed deposits",
    # Profile and identity
    "Profile", "Edit profile", "Change password", "Update mobile number", "Personal details",
    "Contact us", "Customer service", "Help centre", "Sign out", "Log in", "Register",
    "Date of birth", "Name as per PAN", "Address proof", "Upload documents", "Verify email",
    # Government and DigiLocker-like
    "Issued documents", "Search documents", "Aadhaar services", "Driving licence", "Vehicle registration",
    "Income certificate", "Caste certificate", "Birth certificate", "Apply for passport", "Track application",
    "Grievance", "Dashboard", "Notifications", "Settings", "Language", "Accessibility",
    # Shopping
    "Your orders", "Returns", "Track order", "Saved addresses", "Payment methods", "Wishlist",
    "Add to cart", "Buy now", "Checkout", "Continue shopping", "Apply coupon",
    # Hindi
    "खाता विवरण", "मेरे खाते", "खाता हटाएं", "खाता बंद करें", "पासवर्ड बदलें", "प्रोफ़ाइल",
    "जन्म तिथि", "पता बदलें", "लॉग आउट", "सहायता", "दस्तावेज़ खोजें", "भुगतान करें",
]

NEG_TASKS = [
    "Delete my account", "Download my account statement for March", "Show my account summary",
    "Close my savings account", "Change my password", "Update my address", "Find my driving licence",
    "Track my order", "Open account settings", "Log out of my account",
    "मेरा खाता हटाएं", "मेरा खाता विवरण दिखाएं", "मेरा पासवर्ड बदलें",
]

# Synthetic personal values (no real person). Each line carries one value of one type.
POS = [
    ("ACCOUNTNUMBER", "Account number 50100234567812"),
    ("ACCOUNTNUMBER", "Savings account 0123 4567 8901"),
    ("ACCOUNTNUMBER", "A/c XXXX4521"),
    ("ACCOUNTNUMBER", "Account no. 3920 1188 2201 76"),
    ("ACCOUNTNUMBER", "खाता संख्या 50100234567812"),
    ("ACCOUNTNUMBER", "खाता संख्या ५०१००२३४५६७८"),
    ("ACCOUNTNUMBER", "Beneficiary account 778899001122"),
    ("ACCOUNTNUMBER", "IBAN GB29 NWBK 6016 1331 9268 19"),
    ("PERSONNAME", "Signed in as Ananya Krishnan"),
    ("PERSONNAME", "Welcome back, Rohit Mehra"),
    ("PERSONNAME", "Account holder Neha Joshi"),
    ("PERSONNAME", "Pay Suresh Iyer"),
    ("PERSONNAME", "नमस्ते, प्रिया शर्मा"),
    ("DATEOFBIRTH", "Date of birth 14/08/1996"),
    ("DATEOFBIRTH", "DOB: 3 March 1988"),
    ("DATEOFBIRTH", "जन्म तिथि 12-01-2001"),
    ("ADDRESS", "Ship to 42 MG Road, Bengaluru 560001"),
    ("ADDRESS", "Flat 3B, Lake View Apartments, Pune"),
    ("PASSWORD", "Temporary password Xk9!rT2q"),
]


# The personal value inside each POS line, for the end-to-end leak check.
POS_VALUE = ["50100234567812", "0123 4567 8901", "XXXX4521", "3920 1188 2201 76", "50100234567812",
             "५०१००२३४५६७८", "778899001122", "GB29 NWBK 6016 1331 9268 19", "Ananya Krishnan", "Rohit Mehra",
             "Neha Joshi", "Suresh Iyer", "प्रिया शर्मा", "14/08/1996", "3 March 1988", "12-01-2001",
             "42 MG Road, Bengaluru 560001", "Flat 3B, Lake View Apartments, Pune", "Xk9!rT2q"]
assert len(POS_VALUE) == len(POS)


def band(score, label):
    if score >= entities.STRIP_THRESHOLD:
        return "strip"
    if score >= entities.uncertain_floor_for(label):
        return "ask"
    return "ignore"


HAS_DIGIT = re.compile(r"\d")  # str patterns match Devanagari digits too


def rule_shipped(span):
    return True


def rule_account_needs_digit(span):
    """An account number is digits (masked or not); a span with none is a word."""
    if span["type"] == "ACCOUNTNUMBER":
        return bool(HAS_DIGIT.search(span["value"]))
    return True


def rule_account_and_dob_need_digit(span):
    if span["type"] in ("ACCOUNTNUMBER", "DATEOFBIRTH"):
        return bool(HAS_DIGIT.search(span["value"]))
    return True


RULES = {
    "shipped": rule_shipped,
    "account_needs_digit": rule_account_needs_digit,
    "account_and_dob_need_digit": rule_account_and_dob_need_digit,
}


def score_text(text):
    t0 = time.perf_counter()
    spans = entities.gliner_spans(text)
    return spans, (time.perf_counter() - t0) * 1000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    opts = ap.parse_args()

    t0 = time.perf_counter()
    entities.load_model()
    if not entities.STATE.loaded:
        print("GLiNER did not load:", entities.STATE.load_error, file=sys.stderr)
        return 2
    load_s = time.perf_counter() - t0

    cases = []
    for i, label in enumerate(NEG_LABELS, 1):
        tag = "A" if i % 2 else "BUTTON"
        cases.append({"set": "negative", "kind": "label", "text": line(i, tag, "link" if tag == "A" else "button", label), "expect": None})
    for task in NEG_TASKS:
        cases.append({"set": "negative", "kind": "task", "text": task, "expect": None})
    for i, (typ, text) in enumerate(POS, 1):
        cases.append({"set": "positive", "kind": "label", "text": line(i, "SPAN", "text", text), "expect": typ,
                      "text_index": i - 1})

    for case in cases:
        # End to end through strip() as /strip runs it (regex and model layers, the
        # task or the DOM line as the extension sends it). A positive leaks when its
        # value survives in the outgoing text and the user is not asked about it.
        is_task = case["kind"] == "task"
        out = strip_module.strip(task=case["text"] if is_task else "", dom="" if is_task else case["text"],
                                 elements=[], resolved={})
        sent = out["tokenizedTask"] if is_task else out["sanitizedDom"]
        case["strip"] = {"sent": sent, "asked": [u["preview"] for u in out["uncertain"]],
                         "tokens": sorted(out["tokens"].keys())}
        if case["set"] == "positive":
            value = POS_VALUE[case["text_index"]]
            case["strip"]["value_leaked"] = value in sent and not any(value in a or a in value for a in case["strip"]["asked"])
        else:
            original = case["text"] if is_task else re.search(r'label="([^"]*)"', case["text"]).group(1)
            case["strip"]["label_intact"] = original in sent
        spans, ms = score_text(case["text"])
        case["ms"] = round(ms, 1)
        case["spans"] = [
            {"type": s["type"], "value": s["value"], "score": round(float(s["score"]), 4), "band": band(s["score"], s["label"])}
            for s in spans
        ]

    summary = {}
    for name, keep in RULES.items():
        neg_q = neg_cases = 0
        pos_found = pos_total = 0
        for case in cases:
            kept = [s for s in case["spans"] if keep(s) and s["band"] != "ignore"]
            if case["set"] == "negative":
                # Any kept span on a no-PII line is a question or a silent strip of UI text.
                if kept:
                    neg_cases += 1
                neg_q += len(kept)
            else:
                pos_total += 1
                if any(s["type"] == case["expect"] for s in kept):
                    pos_found += 1
        n_neg = sum(c["set"] == "negative" for c in cases)
        summary[name] = {
            "negative_lines_with_a_span": f"{neg_cases}/{n_neg}",
            "negative_spans": neg_q,
            "positive_values_caught": f"{pos_found}/{pos_total}",
        }

    pos = [c for c in cases if c["set"] == "positive"]
    neg = [c for c in cases if c["set"] == "negative"]
    summary["end_to_end_strip"] = {
        "positive_values_leaked_unasked": [POS_VALUE[c["text_index"]] for c in pos if c["strip"]["value_leaked"]],
        "negative_labels_altered": [c["text"] if c["kind"] == "task" else re.search(r'label="([^"]*)"', c["text"]).group(1)
                                    for c in neg if not c["strip"]["label_intact"]],
        "negative_lines_asked": sum(bool(c["strip"]["asked"]) for c in neg),
        "negatives": len(neg), "positives": len(pos),
    }

    record = {
        "name": "gliner-label-fp-v01",
        "date": time.strftime("%Y-%m-%d"),
        "model": entities.MODEL_ID,
        "thresholds": {"strip": entities.STRIP_THRESHOLD, "uncertain_floor": entities.UNCERTAIN_FLOOR,
                       "per_label": entities.UNCERTAIN_FLOOR_BY_LABEL},
        "runtime": {"python": platform.python_version(), "cpu_only": True, "model_load_s": round(load_s, 1)},
        "scope": ("Author-written synthetic EN/HI UI labels and tasks (negatives) and synthetic personal "
                  "values (positives), scored one line at a time through entities.gliner_spans as the "
                  "Warden ships it. Not a blind set; Hindi not native-reviewed. Measures these strings only."),
        "summary": summary,
        "cases": cases,
    }
    text = json.dumps(record, indent=2, ensure_ascii=False) + "\n"
    if opts.out:
        (ROOT / opts.out).write_text(text, encoding="utf-8")
    print(json.dumps(summary, indent=2))
    for c in cases:
        if c["set"] == "negative" and any(s["band"] != "ignore" for s in c["spans"]):
            print("NEG", c["text"][:70], [(s["type"], s["value"], s["score"], s["band"]) for s in c["spans"]])
        if c["set"] == "positive":
            print("POS", c["expect"], c["text"][-50:], [(s["type"], s["value"], s["score"], s["band"]) for s in c["spans"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())

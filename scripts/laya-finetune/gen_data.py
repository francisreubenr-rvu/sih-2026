"""Synthetic training data for fine-tuning Laya as Dhristi's fast-path decision model.

Every example is one planner step, rendered exactly as warden/fastpath.py renders it at run time
(fastpath.state_for / fastpath.questions), with gold answers for its two questions:

  next       choice over the actions the scene allows (+ "none of these")
  free_text  does finishing the task still need typed text that is not a vault token?

The domains, labels and wording are deliberately different from the evaluation sets
(scripts/cloud-models/cases.py and cases_heldout.py). check_overlap() reports any task string or
page that appears in both; the committed data must report none.

    python scripts/laya-finetune/gen_data.py --n 900 --seed 20260930 --out scripts/laya-finetune/train.jsonl
"""

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))
sys.path.insert(0, str(ROOT / "scripts" / "cloud-models"))

import fastpath  # noqa: E402

# (token type, field kind, label variants)
FIELD_BANK = {
    "PERSONNAME": ("text", ["Name in full", "Applicant name", "Name as on ID", "Passenger name", "Your name", "Patient name"]),
    "EMAIL": ("email", ["Email address", "E-mail", "Email for correspondence", "Work email", "Email for updates"]),
    "PHONE": ("tel", ["Mobile", "Phone number", "Contact number", "WhatsApp number", "Alternate phone"]),
    "ADDRESS": ("text", ["Street address", "Residential address", "House / flat and street", "Correspondence address"]),
    "ZIPCODE": ("text", ["PIN", "Postal code", "Pincode", "ZIP"]),
    "DATEOFBIRTH": ("date", ["Date of birth", "DOB", "Birth date"]),
    "PAN": ("text", ["PAN", "Permanent Account Number", "PAN card number"]),
    "AADHAAR": ("text", ["Aadhaar", "Aadhaar number (12 digits)", "UID"]),
    "PASSPORT": ("text", ["Passport number", "Passport no."]),
    "BANKACCOUNT": ("text", ["Account number", "Bank account no.", "Savings account"]),
}
FREE_BANK = {
    "message": ("textarea", ["Your message", "Your query", "Comments", "Tell us more"],
                ["about the delayed refund", "that I will join late", "saying the parcel arrived damaged",
                 "asking for a copy of the receipt", "that the hostel tap is leaking", "to thank the doctor"]),
    "title": ("text", ["Post title", "Subject line", "Heading"],
              ["asking about the exam timetable", "titled Lab schedule change", "titled Robotics club recruitment",
               "called Notes for week 3", "named Monsoon trek plan"]),
    "amount": ("number", ["Amount (INR)", "Top-up amount", "Donation amount"],
               ["of 750 rupees", "for 1200 rupees", "of 300 rupees", "worth 2500 rupees", "for 95 rupees"]),
    "query": ("search", ["Search the catalogue", "Search courses", "Find a train"],
              ["for Chandrayaan papers", "for Bengaluru to Mysuru trains", "for evening yoga classes",
               "for second-hand cycles", "for Kannada novels", "for flights to Kochi"]),
}

FORMS = [
    # (domain, task verb phrase, submit labels, distractor labels, success statuses, heading)
    ("library", "Renew my library membership", ["Renew membership", "Renew"], ["Cancel membership", "Report lost card"],
     ["Membership renewed", "Renewal complete"], "City library (synthetic)"),
    ("admission", "Apply to the B.Sc programme", ["Submit application", "Apply now"], ["Withdraw application", "Save and exit"],
     ["Application received", "Your application has been submitted"], "Admissions portal (synthetic)"),
    ("tax", "File the tax verification", ["Verify and continue", "Proceed"], ["Discard return", "Download blank form"],
     ["Verification successful", "PAN verified"], "Tax e-filing (synthetic)"),
    ("clinic", "Book a clinic appointment", ["Confirm booking", "Book slot"], ["Cancel all appointments", "Call the clinic"],
     ["Appointment confirmed", "Slot booked"], "Clinic appointments (synthetic)"),
    ("rail", "Book a train ticket", ["Pay and book", "Continue to pay"], ["Clear passengers", "Cancel ticket"],
     ["Booking confirmed", "Ticket booked"], "Rail reservations (synthetic)"),
    ("kyc", "Complete the gas connection KYC", ["Submit KYC", "Complete KYC"], ["Close connection", "Skip KYC"],
     ["KYC submitted", "KYC complete"], "Gas agency (synthetic)"),
    ("rsvp", "RSVP for the alumni meet", ["Send RSVP", "Confirm attendance"], ["Decline invitation", "Remove me from the list"],
     ["RSVP recorded", "See you there"], "Alumni meet (synthetic)"),
    ("visa", "Start the visa application", ["Save and continue", "Next step"], ["Delete application", "Start over"],
     ["Step 1 saved", "Details saved"], "Visa services (synthetic)"),
]
NAV_SITES = [
    ("Mission archive (synthetic)", ["Missions", "Datasets", "Publications", "Outreach", "Careers", "Reach us"]),
    ("University (synthetic)", ["Admissions", "Departments", "Examinations", "Hostel", "Library", "Alumni"]),
    ("Municipal services (synthetic)", ["Property tax", "Water supply", "Birth certificates", "Complaints", "Tenders"]),
    ("Railways (synthetic)", ["PNR status", "Timetable", "Refunds", "Lost and found", "Accessibility"]),
]
TOGGLE_SETS = [
    ("Two-factor settings (synthetic)", ["Require OTP at login", "Remember this device", "Alert me on new login"], ["Save security settings", "Apply"]),
    ("Privacy (synthetic)", ["Show my profile to others", "Allow search engines", "Share usage data"], ["Save privacy settings", "Save changes"]),
    ("Accessibility (synthetic)", ["High contrast mode", "Larger text", "Reduce motion"], ["Store preferences", "Apply changes"]),
]
DISTRACTOR_LINKS = ["Help", "Privacy policy", "Back", "Language: English", "Terms"]


def el(sel, label, kind, filled=False, x=40, y=100):
    return {"selector": sel, "x": x, "y": y, "fieldType": kind, "label": label, "filled": filled}


def render_dom(elements, status=None):
    out = [f'{i + 1}. {e["fieldType"].upper()} selector={e["selector"]} label="{e["label"]}"' for i, e in enumerate(elements)]
    if status:
        out.append(f'STATUS text="{status}"')
    return "\n".join(out)


def step_example(task, elements, history, status, accept, free_remaining, heading):
    body = {"tokenizedTask": task, "sanitizedDom": f"{heading}\n" + render_dom(elements, status),
            "elements": elements, "history": history}
    return {"body": body, "accept": accept, "free_text": free_remaining}


def form_trajectory(rng):
    domain, verb, submits, distractors, successes, heading = rng.choice(FORMS)
    n_tok = rng.randint(1, 4)
    tok_types = rng.sample(sorted(FIELD_BANK), n_tok)
    free_kind = rng.choice(sorted(FREE_BANK)) if rng.random() < FREE_IN_FORM else None
    fields = []
    for i, t in enumerate(tok_types):
        kind, labels = FIELD_BANK[t]
        fields.append({"sel": f"#{domain[:3]}-{t.lower()}", "label": rng.choice(labels), "kind": kind, "token": f"{t}#1"})
    task_bits = [f"{FIELD_BANK[f['token'].split('#')[0]][1][0].lower()} {f['token']}" for f in fields]
    if free_kind:
        fk, flabels, phrases = FREE_BANK[free_kind]
        fields.insert(rng.randint(0, len(fields)), {"sel": f"#{domain[:3]}-{free_kind}", "label": rng.choice(flabels), "kind": fk, "token": None})
        task_bits.append(rng.choice(phrases))
    task = f"{verb} with " + ", ".join(task_bits)
    submit = rng.choice(submits)
    extra = rng.sample(distractors, rng.randint(1, 2)) + rng.sample(DISTRACTOR_LINKS, rng.randint(0, 2))
    rng.shuffle(extra)

    filled = set()
    history = []
    order = fields[:]
    if rng.random() < 0.5:
        rng.shuffle(order)
    out = []

    def scene(status=None):
        els = [el(f["sel"], f["label"], f["kind"], f["sel"] in filled, y=100 + 50 * i) for i, f in enumerate(fields)]
        els.append(el(f"#{domain[:3]}-go", submit, "button", y=120 + 50 * len(fields)))
        for j, d in enumerate(extra):
            els.append(el(f"#{domain[:3]}-x{j}", d, "link" if d in DISTRACTOR_LINKS else "button", x=260, y=120 + 50 * len(fields)))
        return els

    for f in order:
        remaining = [g for g in fields if g["sel"] not in filled]
        free_left = any(g["token"] is None for g in remaining)
        # One right answer per step, so a calibrated model can be confident: while a free-text
        # field is still empty the step needs the LLM ("none of these", and free_text is true);
        # otherwise type the topmost empty token field. (v1/v2 accepted every remaining field and
        # the escape at once, which split the target over up to five options.)
        top = None if free_left else next(g for g in fields if g["sel"] not in filled and g["token"])
        accept = [fastpath.ESCAPE] if free_left else [f"type {top['sel']} {top['token']}"]
        out.append(step_example(task, scene(), list(history), None, accept, free_left, heading))
        filled.add(f["sel"])
        history.append({"action": "type", "target": f["sel"], **({"value": f["token"]} if f["token"] else {}), "status": "ok"})
    out.append(step_example(task, scene(), list(history), None, [f"click #{domain[:3]}-go"], False, heading))
    history.append({"action": "click", "target": f"#{domain[:3]}-go", "status": "ok"})
    out.append(step_example(task, scene(), list(history), rng.choice(successes), ["finish"], False, heading))
    return out


def nav_trajectory(rng):
    heading, sections = rng.choice(NAV_SITES)
    shown = rng.sample(sections, rng.randint(3, len(sections)))
    target = rng.choice(shown)
    task = rng.choice(["Open the {} page", "Take me to {}", "Go to the {} section", "Show me {}"]).format(target)
    els = [el(f"#nav-{i}", s, "link", x=40 + 90 * i, y=20) for i, s in enumerate(shown)]
    if rng.random() < 0.4:
        els.append(el("#cookie-ok", rng.choice(["Allow cookies", "Got it"]), "button", y=600))
    tsel = f"#nav-{shown.index(target)}"
    first = step_example(task, els, [], None, [f"click {tsel}"], False, heading)
    done = step_example(task, els, [{"action": "click", "target": tsel, "status": "ok"}],
                        rng.choice([f"{target}", f"You are on {target}", f"{target} page"]), ["finish"], False, f"{heading} - {target}")
    return [first, done]


def toggle_trajectory(rng):
    heading, toggles, saves = rng.choice(TOGGLE_SETS)
    target = rng.choice(toggles)
    save = rng.choice(saves)
    task = rng.choice(["Turn on {} and save", "Enable {} then save", "Switch on {} and keep it"]).format(target.lower())
    ids = {t: f"#tg-{i}" for i, t in enumerate(toggles)}
    extra = rng.choice(["Reset to defaults", "Erase my account", "Sign out everywhere"])

    def els(on):
        out = [el(ids[t], t, "checkbox", t in on, y=100 + 40 * i) for i, t in enumerate(toggles)]
        return out + [el("#tg-save", save, "button", y=260), el("#tg-x", extra, "button", x=260, y=260)]

    return [
        step_example(task, els(set()), [], None, [f"click {ids[target]}"], False, heading),
        step_example(task, els({target}), [{"action": "click", "target": ids[target], "status": "ok"}], None, ["click #tg-save"], False, heading),
        step_example(task, els({target}), [{"action": "click", "target": ids[target], "status": "ok"}, {"action": "click", "target": "#tg-save", "status": "ok"}],
                     rng.choice(["Settings saved", "Changes applied"]), ["finish"], False, heading),
    ]


def free_only_trajectory(rng):
    kind = rng.choice(sorted(FREE_BANK))
    fk, labels, phrases = FREE_BANK[kind]
    label = rng.choice(labels)
    go = rng.choice(["Find", "Post", "Submit note", "Pay"])
    task = rng.choice(["Search {}", "Write a post {}", "Send a note {}", "Top up the wallet {}"]).format(rng.choice(phrases))
    els = [el("#f-in", label, fk), el("#f-go", go, "button", x=300), el("#f-help", "Help", "link", x=400, y=20)]
    return [
        step_example(task, els, [], None, [fastpath.ESCAPE], True, "Service (synthetic)"),
        step_example(task, [dict(els[0], filled=True)] + els[1:], [{"action": "type", "target": "#f-in", "status": "ok"}], None,
                     ["click #f-go"], False, "Service (synthetic)"),
    ]


WRONG_MASS = 0.02
# Share of forms that also need free text. v3 used 0.3 (and free_only weight 0.15): 14% of steps
# needed free text, and both CPU fine-tunes answered that base rate on every step.
FREE_IN_FORM = 0.5


def targets(example):
    body = example["body"]
    opts = list(fastpath.options(body))
    acc = [a for a in example["accept"] if a in opts]
    assert acc, (example["accept"], opts)
    # 2% of the mass spread over the wrong options in total. v1/v2 gave each wrong option 2%, about
    # a third of the mass on a typical 15-option step, which capped a calibrated model near 0.8.
    eps = WRONG_MASS / max(1, len(opts) - len(acc))
    choice = {k: (1 - WRONG_MASS) / len(acc) if k in acc else eps for k in opts}
    free = {"false": 0.05, "true": 0.95} if example["free_text"] else {"false": 0.95, "true": 0.05}
    return {"next": choice, "free_text": free}


def check_overlap(rows):
    from cases import PLAN_CASES
    from cases_heldout import HELDOUT
    evals = PLAN_CASES + HELDOUT
    eval_tasks = {c["tokenizedTask"] for c in evals}
    eval_labels = {e["label"] for c in evals for e in c["elements"]}
    train_tasks = {r["body"]["tokenizedTask"] for r in rows}
    train_labels = {e["label"] for r in rows for e in r["body"]["elements"]}
    return {"shared_tasks": sorted(eval_tasks & train_tasks), "shared_labels": sorted(eval_labels & train_labels)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=900, help="approximate number of step examples")
    ap.add_argument("--seed", type=int, default=20260930)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    rows = []
    makers = [(form_trajectory, 0.5), (nav_trajectory, 0.15), (toggle_trajectory, 0.1), (free_only_trajectory, 0.25)]
    while len(rows) < a.n:
        r = rng.random()
        acc = 0
        for fn, w in makers:
            acc += w
            if r <= acc:
                rows.extend(fn(rng))
                break
    rows = rows[: a.n]
    with open(a.out, "w") as f:
        for r in rows:
            f.write(json.dumps({"body": r["body"], "accept": r["accept"], "free_text": r["free_text"], "gold": targets(r)}) + "\n")
    ov = check_overlap(rows)
    print(json.dumps({"examples": len(rows), "free_text_true": sum(r["free_text"] for r in rows),
                      "escape_gold": sum(r["accept"] == [fastpath.ESCAPE] for r in rows), **ov}, indent=1))


if __name__ == "__main__":
    main()

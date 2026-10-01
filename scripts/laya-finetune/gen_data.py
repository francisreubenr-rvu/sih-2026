"""Synthetic training data for fine-tuning Laya as Dhristi's fast-path decision model.

Every example is one planner step, rendered exactly as warden/fastpath.py renders it at run time
(fastpath.state_for / fastpath.questions), with gold answers for its two questions:

  next       choice over the actions the scene allows (+ "none of these")
  free_text  does finishing the task still need typed text that is not a vault token?

The domains, labels and wording are deliberately different from the evaluation sets
(scripts/cloud-models/cases.py and cases_heldout.py). check_overlap() reports any task string or
label that appears in both; the committed data must report none.

v5 (1 October 2026) adds three situations the v4 generator never produced, plus wider wording:
  overwrite        a pre-filled field that the task asks to change (filled is not the same as done)
  click_then_type  a choice control (category, tab) to click before typing, often with free text
                   asked for as "about <topic>" in the middle of the task
  optional fields  an empty field the task never mentions, which is skipped (not free text)
Free-text requests are composed from framings x topics instead of a short fixed list, so the
model has to learn the cue rather than the phrases.

--split train|val partitions every wording bank (domains, labels, task templates, topics,
framings): val uses only wording that train never sees, so validation measures new wording on the
same situations. --split all (the default) uses every bank, as v4 did. The v4 data files
(train_v3.jsonl, train_v4.jsonl, and the Colab v01 run) come from the generator at commit e9cd7ab.

    python scripts/laya-finetune/gen_data.py --n 20000 --seed 20261020 --split train --out train.jsonl
    python scripts/laya-finetune/gen_data.py --n 2000 --seed 20261021 --split val --out val.jsonl
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

SPLIT = "all"


def part(bank):
    """The share of a wording bank this split may use: val gets every fourth entry (the last
    entry when the bank has fewer than four), train gets the rest, all gets everything."""
    bank = list(bank)
    if SPLIT == "all" or len(bank) < 2:
        return bank
    val_idx = {i for i in range(len(bank)) if i % 4 == 3} or {len(bank) - 1}
    return [b for i, b in enumerate(bank) if (i in val_idx) == (SPLIT == "val")]


# token type -> (field kind, label variants, words used for it in a task)
FIELD_BANK = {
    "PERSONNAME": ("text", ["Name in full", "Applicant name", "Name as on ID", "Passenger name", "Your name", "Patient name",
                            "Account holder", "Member name"], ["name", "full name", "legal name"]),
    "EMAIL": ("email", ["Email address", "E-mail", "Email for correspondence", "Work email", "Email for updates",
                        "Personal email", "Login email", "Mail ID"], ["email", "email address", "mail"]),
    "PHONE": ("tel", ["Mobile", "Phone number", "Contact number", "WhatsApp number", "Alternate phone", "Cell number",
                      "Mobile no.", "Primary phone"], ["phone", "mobile", "contact number"]),
    "ADDRESS": ("text", ["Street address", "Residential address", "House / flat and street", "Correspondence address",
                         "Permanent address", "Delivery address"], ["address", "street address"]),
    "ZIPCODE": ("text", ["PIN", "Postal code", "Pincode", "ZIP", "Area PIN"], ["PIN", "postal code"]),
    "DATEOFBIRTH": ("date", ["Date of birth", "DOB", "Birth date", "Born on"], ["date of birth", "DOB"]),
    "PAN": ("text", ["PAN", "Permanent Account Number", "PAN card number", "PAN no."], ["PAN"]),
    "AADHAAR": ("text", ["Aadhaar", "Aadhaar number (12 digits)", "UID", "Aadhaar no."], ["Aadhaar"]),
    "PASSPORT": ("text", ["Passport number", "Passport no.", "Passport ID"], ["passport number"]),
    "BANKACCOUNT": ("text", ["Account number", "Bank account no.", "Savings account", "A/c number"], ["account number"]),
}

# Free text, composed: (field kind, field labels, framings, values). A framing turns a value into
# the words of the task; values are topics, titles, amounts or search terms.
TOPICS = ["a delayed refund", "the hostel tap that keeps leaking", "a parcel that arrived damaged", "my lost library card",
          "the late evening bus", "a wrong name on my certificate", "the broken street light near gate 3",
          "an extra charge on my electricity bill", "the noisy generator next door", "a missing marksheet",
          "a cancelled lab session", "the slow campus Wi-Fi", "a duplicate order", "a torn passbook page",
          "the water cooler on floor 2", "my exam hall ticket", "a pothole on 5th cross", "an unanswered email from admin",
          "the canteen menu", "my scholarship status", "a late pension credit", "the lift in block C",
          "a mismatch in my ration card", "the parking pass renewal", "my hostel room change", "a stuck cheque deposit",
          "the clinic opening hours", "a damaged meter seal", "the library fine I already paid", "my transfer certificate"]
FREE_KINDS = {
    "message": ("textarea", ["Your message", "Your query", "Comments", "Tell us more", "Details", "Write here",
                             "Explain the issue", "Remarks"],
                ["about {}", "regarding {}", "saying it is about {}", "to report {}", "explaining {}", "with a note about {}",
                 "describing {}", "mentioning {}"], TOPICS),
    "title": ("text", ["Post title", "Subject line", "Heading", "Thread title", "Headline"],
              ["titled {}", "called {}", "named {}", "with the heading {}", "with the title {}"],
              ["Lab schedule change", "Robotics club recruitment", "Notes for week 3", "Monsoon trek plan", "Quiz night results",
               "Lost and found: blue bottle", "Carpool from Jayanagar", "Mess feedback for June", "Seminar hall booking",
               "Unit 4 doubts"]),
    "amount": ("number", ["Amount (INR)", "Top-up amount", "Donation amount", "Value in rupees", "Sum to pay"],
               ["of {} rupees", "for {} rupees", "worth {} rupees", "of Rs {}", "for Rs. {}"],
               ["750", "1200", "300", "2500", "95", "4100", "60", "18000", "999", "5250"]),
    "query": ("search", ["Search the catalogue", "Search courses", "Find a train", "Look up", "Search listings"],
              ["for {}", "looking for {}", "to find {}", "that match {}", "for anything on {}"],
              ["Chandrayaan papers", "Bengaluru to Mysuru trains", "evening yoga classes", "second-hand cycles",
               "Kannada novels", "flights to Kochi", "used drafters", "Python night classes", "PG rooms near campus",
               "monsoon trekking shoes"]),
}

FORMS = [
    # (domain, task verbs, submit labels, distractor labels, success statuses, heading)
    ("library", ["Renew my library membership", "Extend my library card"], ["Renew membership", "Renew"],
     ["Cancel membership", "Report lost card"], ["Membership renewed", "Renewal complete"], "City library (synthetic)"),
    ("admission", ["Apply to the B.Sc programme", "Send my B.Sc application"], ["Submit application", "Apply now"],
     ["Withdraw application", "Save and exit"], ["Application received", "Your application has been submitted"],
     "Admissions portal (synthetic)"),
    ("tax", ["File the tax verification", "Complete the tax e-verification"], ["Verify and continue", "Proceed"],
     ["Discard return", "Download blank form"], ["Verification successful", "PAN verified"], "Tax e-filing (synthetic)"),
    ("clinic", ["Book a clinic appointment", "Get me a slot at the clinic"], ["Confirm booking", "Book slot"],
     ["Cancel all appointments", "Call the clinic"], ["Appointment confirmed", "Slot booked"], "Clinic appointments (synthetic)"),
    ("rail", ["Book a train ticket", "Reserve a seat on the train"], ["Pay and book", "Continue to pay"],
     ["Clear passengers", "Cancel ticket"], ["Booking confirmed", "Ticket booked"], "Rail reservations (synthetic)"),
    ("kyc", ["Complete the gas connection KYC", "Finish KYC for my gas connection"], ["Submit KYC", "Complete KYC"],
     ["Close connection", "Skip KYC"], ["KYC submitted", "KYC complete"], "Gas agency (synthetic)"),
    ("rsvp", ["RSVP for the alumni meet", "Confirm my seat at the alumni meet"], ["Send RSVP", "Confirm attendance"],
     ["Decline invitation", "Remove me from the list"], ["RSVP recorded", "See you there"], "Alumni meet (synthetic)"),
    ("visa", ["Start the visa application", "Begin my visa form"], ["Save and continue", "Next step"],
     ["Delete application", "Start over"], ["Step 1 saved", "Details saved"], "Visa services (synthetic)"),
    ("hostel", ["Register for the hostel", "Sign me up for a hostel room"], ["Register", "Submit registration"],
     ["Vacate room", "Withdraw registration"], ["Registration done", "Hostel request received"], "Hostel office (synthetic)"),
    ("insurance", ["Enrol in the group insurance", "Join the student insurance plan"], ["Enrol now", "Confirm enrolment"],
     ["Opt out of cover", "Download policy terms"], ["Enrolment confirmed", "You are covered"], "Insurance desk (synthetic)"),
    ("scholarship", ["Apply for the merit scholarship", "Put in my scholarship form"], ["Send form", "Apply"],
     ["Withdraw claim", "Clear form"], ["Form received", "Scholarship application logged"], "Scholarship cell (synthetic)"),
    ("transport", ["Get a bus pass", "Apply for the campus bus pass"], ["Issue pass", "Request pass"],
     ["Cancel existing pass", "Report misuse"], ["Pass issued", "Bus pass requested"], "Transport office (synthetic)"),
]
FORM_TEMPLATES = ["{verb} with {bits}", "{verb} using {bits}", "{verb}. Details: {bits}", "{verb}; my details are {bits}",
                  "I want to {verb_l} with {bits}", "Please {verb_l}: {bits}", "{verb} for me, {bits}", "Can you {verb_l}? Use {bits}"]
# where a free-text request sits: after the token details, or right after the verb ("Raise ... about X; use EMAIL#1")
FREE_FIRST_TEMPLATES = ["{verb} {free}; use {bits}", "{verb} {free}, and fill in {bits}", "{verb} {free}. Contact: {bits}",
                        "{verb} {free}; {bits}"]
TOKEN_BIT = ["{word} {tok}", "{tok} as my {word}", "{word} is {tok}", "{word}: {tok}"]
OPTIONAL_FIELDS = [("text", "Coupon code (optional)"), ("text", "Referral code (optional)"), ("text", "Landmark (optional)"),
                   ("text", "Middle name (optional)"), ("text", "GST number (if any)"), ("tel", "Office phone (optional)"),
                   ("text", "Nickname (optional)"), ("text", "Promo code (optional)")]

NAV_SITES = [
    ("Mission archive (synthetic)", ["Missions", "Datasets", "Publications", "Outreach", "Careers", "Reach us"]),
    ("University (synthetic)", ["Admissions", "Departments", "Examinations", "Hostel", "Library", "Alumni"]),
    ("Municipal services (synthetic)", ["Property tax", "Water supply", "Birth certificates", "Complaints", "Tenders"]),
    ("Railways (synthetic)", ["PNR status", "Timetable", "Refunds", "Lost and found", "Accessibility"]),
    ("Hospital (synthetic)", ["OPD timings", "Specialists", "Lab reports", "Visitor rules", "Emergency"]),
    ("Bank (synthetic)", ["Loans", "Fixed deposits", "Branch locator", "Interest rates", "Grievances"]),
    ("Transport (synthetic)", ["Routes", "Fares", "Passes", "Live tracking", "Holiday schedule"]),
    ("College club (synthetic)", ["Events", "Members", "Gallery", "Join us", "Sponsors"]),
]
NAV_TEMPLATES = ["Open the {} page", "Take me to {}", "Go to the {} section", "Show me {}", "I need the {} page",
                 "Navigate to {}", "Where is {}? Open it", "Bring up {}"]
TOGGLE_SETS = [
    ("Two-factor settings (synthetic)", ["Require OTP at login", "Remember this device", "Alert me on new login"], ["Save security settings", "Apply"]),
    ("Privacy (synthetic)", ["Show my profile to others", "Allow search engines", "Share usage data"], ["Save privacy settings", "Save changes"]),
    ("Accessibility (synthetic)", ["High contrast mode", "Larger text", "Reduce motion"], ["Store preferences", "Apply changes"]),
    ("Data saver (synthetic)", ["Load images on Wi-Fi only", "Compress videos", "Prefetch pages"], ["Keep settings", "Done"]),
    ("Reading (synthetic)", ["Night reading mode", "Dyslexia-friendly font", "Auto scroll"], ["Save reading options", "Confirm"]),
    ("Payments (synthetic)", ["Auto-pay bills", "One-tap UPI", "International transactions"], ["Save payment options", "Update options"]),
]
TOGGLE_TEMPLATES = ["Turn on {} and save", "Enable {} then save", "Switch on {} and keep it", "Activate {}, then save it",
                    "I want {} on; save that", "Tick {} and save the change", "Set {} to on and save", "Make sure {} is enabled and saved"]
DISTRACTOR_LINKS = ["Help", "Privacy policy", "Back", "Language: English", "Terms", "FAQ", "Contact support", "Site map"]
DANGER = ["Reset to defaults", "Erase my account", "Sign out everywhere", "Delete all data", "Deactivate profile", "Clear history"]

# overwrite: profile pages with values on file; the task asks for a new one
OVERWRITE_PAGES = [
    ("Member profile (synthetic)", ["Save profile changes", "Update details"], ["Remove profile photo", "Deactivate membership"]),
    ("Account settings (synthetic)", ["Save settings", "Apply changes"], ["Close my account", "Log out of all devices"]),
    ("Student record (synthetic)", ["Submit correction", "Save record"], ["Withdraw admission", "Request transcript"]),
    ("Patient file (synthetic)", ["Save file", "Confirm changes"], ["Delete file", "Share with doctor"]),
    ("Billing contact (synthetic)", ["Store contact", "Save billing info"], ["Stop all bills", "Download invoice"]),
    ("Alumni directory (synthetic)", ["Publish update", "Save entry"], ["Hide my entry", "Remove from directory"]),
]
OVERWRITE_TEMPLATES = ["Replace my {word} with {tok}", "Correct the {word} on file to {tok}", "Set a new {word}: {tok}",
                       "My {word} is now {tok}, update it", "Swap my {word} for {tok} and save", "Put {tok} in place of my old {word}",
                       "The {word} should be {tok}; fix it", "Overwrite the {word} with {tok}"]
SAVED = ["Changes saved", "Profile updated", "Details updated", "Saved successfully", "Record updated"]

# click_then_type: a category or tab to choose before the fields
CHOICE_PAGES = [
    ("Complaint desk (synthetic)", "Raise a complaint", ["Electricity", "Water", "Roads", "Sanitation"], ["Lodge complaint", "Send complaint"]),
    ("Helpdesk (synthetic)", "Open a helpdesk request", ["Fees", "Hostel", "Exams", "Library"], ["Create request", "Submit request"]),
    ("Feedback portal (synthetic)", "Leave feedback", ["Food", "Transport", "Faculty", "Facilities"], ["Post feedback", "Send feedback"]),
    ("Grievance cell (synthetic)", "File a grievance", ["Harassment", "Discrimination", "Records", "Other"], ["File grievance", "Submit grievance"]),
    ("Service request (synthetic)", "Log a service request", ["Plumbing", "Carpentry", "Electrical", "Cleaning"], ["Log request", "Book service"]),
    ("Bank support (synthetic)", "Write to bank support", ["Cards", "Loans", "Net banking", "Cheques"], ["Send to support", "Raise query"]),
]
CHOICE_TEMPLATES = ["{verb} under {choice} {free}; reply to {tok}", "{verb} in the {choice} category {free}. My contact is {tok}",
                    "{verb} {free}, filed under {choice}, and use {tok} for replies", "Pick {choice} and {verb_l} {free}; use {tok}",
                    "{verb} ({choice}) {free}; {word} {tok}", "Choose {choice}, then {verb_l} {free}. {word}: {tok}"]
CHOICE_TOKEN_ONLY = ["{verb} under {choice} with {word} {tok}", "Pick {choice} and {verb_l}; {word} {tok}",
                     "{verb} in {choice}, {word} {tok}", "Choose {choice} and {verb_l} using {tok}"]
CHOICE_LABELS = ["Category: {}", "{}", "Section: {}", "Type: {}"]


def el(sel, label, kind, filled=False, x=40, y=100):
    return {"selector": sel, "x": x, "y": y, "fieldType": kind, "label": label, "filled": filled}


def render_dom(elements, status=None):
    out = [f'{i + 1}. {e["fieldType"].upper()} selector={e["selector"]} label="{e["label"]}"' for i, e in enumerate(elements)]
    if status:
        out.append(f'STATUS text="{status}"')
    return "\n".join(out)


def step_example(task, elements, history, status, accept, free_remaining, heading, family):
    body = {"tokenizedTask": task, "sanitizedDom": f"{heading}\n" + render_dom(elements, status),
            "elements": elements, "history": history}
    return {"body": body, "accept": accept, "free_text": free_remaining, "family": family}


def lower_first(s):
    return s[:1].lower() + s[1:]


def free_request(rng, kind=None):
    kind = kind or rng.choice(sorted(FREE_KINDS))
    fk, labels, framings, values = FREE_KINDS[kind]
    return kind, fk, rng.choice(part(labels)), rng.choice(part(framings)).format(rng.choice(part(values)))


def token_bit(rng, t):
    return rng.choice(part(TOKEN_BIT)).format(word=rng.choice(part(FIELD_BANK[t][2])), tok=f"{t}#1")


def form_trajectory(rng):
    domain, verbs, submits, distractors, successes, heading = rng.choice(part(FORMS))
    verb = rng.choice(part(verbs))
    tok_types = rng.sample(sorted(FIELD_BANK), rng.randint(1, 4))
    p = domain[:3]
    fields = [{"sel": f"#{p}-{t.lower()}", "label": rng.choice(part(FIELD_BANK[t][1])), "kind": FIELD_BANK[t][0],
               "token": f"{t}#1"} for t in tok_types]
    bits = ", ".join(token_bit(rng, t) for t in tok_types)
    free = None
    if rng.random() < FREE_IN_FORM:
        kind, fk, flabel, free = free_request(rng)
        fields.insert(rng.randint(0, len(fields)), {"sel": f"#{p}-{kind}", "label": flabel, "kind": fk, "token": None})
    if rng.random() < 0.3:
        ok, olabel = rng.choice(part(OPTIONAL_FIELDS))
        fields.insert(rng.randint(0, len(fields)), {"sel": f"#{p}-opt", "label": olabel, "kind": ok, "token": None, "optional": True})
    if free and rng.random() < 0.5:
        task = rng.choice(part(FREE_FIRST_TEMPLATES)).format(verb=verb, free=free, bits=bits)
    else:
        task = rng.choice(part(FORM_TEMPLATES)).format(verb=verb, verb_l=lower_first(verb), bits=bits + (f", {free}" if free else ""))
    submit = rng.choice(part(submits))
    extra = rng.sample(part(distractors), 1) + rng.sample(part(DISTRACTOR_LINKS), rng.randint(0, 2))
    rng.shuffle(extra)

    filled, history, out = set(), [], []
    needed = [f for f in fields if not f.get("optional")]
    order = needed[:]
    if rng.random() < 0.5:
        rng.shuffle(order)

    def scene(status=None):
        els = [el(f["sel"], f["label"], f["kind"], f["sel"] in filled, y=100 + 50 * i) for i, f in enumerate(fields)]
        els.append(el(f"#{p}-go", submit, "button", y=120 + 50 * len(fields)))
        for j, d in enumerate(extra):
            els.append(el(f"#{p}-x{j}", d, "link" if d in DISTRACTOR_LINKS else "button", x=260, y=120 + 50 * len(fields)))
        return els

    for f in order:
        free_left = any(g["token"] is None and g["sel"] not in filled for g in needed)
        # One right answer per step: while a required free-text field is empty the step needs the LLM
        # ("none of these", free_text true); otherwise type the topmost empty token field.
        top = None if free_left else next(g for g in fields if g["sel"] not in filled and g["token"])
        accept = [fastpath.ESCAPE] if free_left else [f"type {top['sel']} {top['token']}"]
        out.append(step_example(task, scene(), list(history), None, accept, free_left, heading, "form"))
        filled.add(f["sel"])
        history.append({"action": "type", "target": f["sel"], **({"value": f["token"]} if f["token"] else {}), "status": "ok"})
    out.append(step_example(task, scene(), list(history), None, [f"click #{p}-go"], False, heading, "form"))
    history.append({"action": "click", "target": f"#{p}-go", "status": "ok"})
    out.append(step_example(task, scene(), list(history), rng.choice(part(successes)), ["finish"], False, heading, "form"))
    return out


def overwrite_trajectory(rng):
    """Fields already hold values; the task names new ones. A filled field is done only once the
    history shows it typed."""
    heading, saves, dangers = rng.choice(part(OVERWRITE_PAGES))
    present = rng.sample(sorted(FIELD_BANK), rng.randint(2, 4))
    change = rng.sample(present, 1 if rng.random() < 0.7 else 2)
    sels = {t: f"#pf-{t.lower()}" for t in present}
    labels = {t: rng.choice(part(FIELD_BANK[t][1])) for t in present}
    if len(change) == 1:
        t = change[0]
        task = rng.choice(part(OVERWRITE_TEMPLATES)).format(word=rng.choice(part(FIELD_BANK[t][2])), tok=f"{t}#1")
    else:
        a, b = change
        task = (rng.choice(part(OVERWRITE_TEMPLATES)).format(word=rng.choice(part(FIELD_BANK[a][2])), tok=f"{a}#1")
                + rng.choice([", and ", "; also ", ". Also "]) + token_bit(rng, b))
    save, danger = rng.choice(part(saves)), rng.choice(part(dangers))

    def scene():
        els = [el(sels[t], labels[t], FIELD_BANK[t][0], True, y=100 + 50 * i) for i, t in enumerate(present)]
        return els + [el("#pf-save", save, "button", y=320), el("#pf-x", danger, "button", x=260, y=320)]

    history, out = [], []
    for t in [t for t in present if t in change]:  # top-down
        out.append(step_example(task, scene(), list(history), None, [f"type {sels[t]} {t}#1"], False, heading, "overwrite"))
        history.append({"action": "type", "target": sels[t], "value": f"{t}#1", "status": "ok"})
    out.append(step_example(task, scene(), list(history), None, ["click #pf-save"], False, heading, "overwrite"))
    history.append({"action": "click", "target": "#pf-save", "status": "ok"})
    out.append(step_example(task, scene(), list(history), rng.choice(part(SAVED)), ["finish"], False, heading, "overwrite"))
    return out


def click_then_type_trajectory(rng):
    """A category to choose (a radio button) between the contact field and the text area."""
    heading, verb, choices, submits = rng.choice(part(CHOICE_PAGES))
    shown = choices[:]
    choice = rng.choice(shown)
    t = rng.choice(["EMAIL", "PHONE"])
    word = rng.choice(part(FIELD_BANK[t][2]))
    with_free = rng.random() < 0.65
    if with_free:
        _, fk, flabel, free = free_request(rng, "message")
        task = rng.choice(part(CHOICE_TEMPLATES)).format(verb=verb, verb_l=lower_first(verb), choice=choice, free=free,
                                                         tok=f"{t}#1", word=word)
    else:
        task = rng.choice(part(CHOICE_TOKEN_ONLY)).format(verb=verb, verb_l=lower_first(verb), choice=choice, tok=f"{t}#1", word=word)
    clabel = rng.choice(part(CHOICE_LABELS))
    submit = rng.choice(part(submits))
    tok_sel, text_sel = "#ct-contact", "#ct-text"
    ids = {c: f"#ct-c{i}" for i, c in enumerate(shown)}

    def scene(typed_tok, picked, typed_text, status=None):
        els = [el(tok_sel, rng_label, FIELD_BANK[t][0], typed_tok, y=100)]
        els += [el(ids[c], clabel.format(c), "radio", picked and c == choice, x=40 + 110 * i, y=150) for i, c in enumerate(shown)]
        if with_free:
            els.append(el(text_sel, flabel, fk, typed_text, y=200))
        return els + [el("#ct-go", submit, "button", y=300), el("#ct-help", rng_link, "link", x=300, y=20)]

    rng_label = rng.choice(part(FIELD_BANK[t][1]))
    rng_link = rng.choice(part(DISTRACTOR_LINKS))
    # As in form_trajectory: while the free-text area is empty, every step is "none of these".
    h, out = [], []
    first = [fastpath.ESCAPE] if with_free else [f"type {tok_sel} {t}#1"]
    out.append(step_example(task, scene(False, False, False), list(h), None, first, with_free, heading, "click_then_type"))
    h.append({"action": "type", "target": tok_sel, "value": f"{t}#1", "status": "ok"})
    second = [fastpath.ESCAPE] if with_free else [f"click {ids[choice]}"]
    out.append(step_example(task, scene(True, False, False), list(h), None, second, with_free, heading, "click_then_type"))
    h.append({"action": "click", "target": ids[choice], "status": "ok"})
    if with_free:
        out.append(step_example(task, scene(True, True, False), list(h), None, [fastpath.ESCAPE], True, heading, "click_then_type"))
        h.append({"action": "type", "target": text_sel, "status": "ok"})
    out.append(step_example(task, scene(True, True, with_free), list(h), None, ["click #ct-go"], False, heading, "click_then_type"))
    h.append({"action": "click", "target": "#ct-go", "status": "ok"})
    out.append(step_example(task, scene(True, True, with_free), list(h), rng.choice(part(SAVED + ["Request logged", "Ticket created"])),
                            ["finish"], False, heading, "click_then_type"))
    return out


def nav_trajectory(rng):
    heading, sections = rng.choice(part(NAV_SITES))
    shown = rng.sample(sections, rng.randint(3, len(sections)))
    target = rng.choice(shown)
    task = rng.choice(part(NAV_TEMPLATES)).format(target)
    els = [el(f"#nav-{i}", s, "link", x=40 + 90 * i, y=20) for i, s in enumerate(shown)]
    if rng.random() < 0.4:
        els.append(el("#cookie-ok", rng.choice(part(["Allow cookies", "Got it", "OK, understood", "Fine by me"])), "button", y=600))
    tsel = f"#nav-{shown.index(target)}"
    first = step_example(task, els, [], None, [f"click {tsel}"], False, heading, "nav")
    done = step_example(task, els, [{"action": "click", "target": tsel, "status": "ok"}],
                        rng.choice([f"{target}", f"You are on {target}", f"{target} page"]), ["finish"], False,
                        f"{heading} - {target}", "nav")
    return [first, done]


def toggle_trajectory(rng):
    heading, toggles, saves = rng.choice(part(TOGGLE_SETS))
    target = rng.choice(toggles)
    save = rng.choice(saves)
    task = rng.choice(part(TOGGLE_TEMPLATES)).format(target.lower())
    ids = {t: f"#tg-{i}" for i, t in enumerate(toggles)}
    extra = rng.choice(part(DANGER))

    def els(on):
        out = [el(ids[t], t, "checkbox", t in on, y=100 + 40 * i) for i, t in enumerate(toggles)]
        return out + [el("#tg-save", save, "button", y=260), el("#tg-x", extra, "button", x=260, y=260)]

    c1 = {"action": "click", "target": ids[target], "status": "ok"}
    return [
        step_example(task, els(set()), [], None, [f"click {ids[target]}"], False, heading, "toggle"),
        step_example(task, els({target}), [c1], None, ["click #tg-save"], False, heading, "toggle"),
        step_example(task, els({target}), [c1, {"action": "click", "target": "#tg-save", "status": "ok"}],
                     rng.choice(["Settings saved", "Changes applied", "Preferences stored"]), ["finish"], False, heading, "toggle"),
    ]


def free_only_trajectory(rng):
    kind, fk, label, free = free_request(rng)
    go = rng.choice(part(["Find", "Post", "Submit note", "Pay", "Go", "Send it", "Finish up", "Proceed now"]))
    task = rng.choice(part({"message": ["Send a note {}", "Write to the office {}", "Leave a message {}", "Drop a line {}"],
                            "title": ["Write a post {}", "Start a thread {}", "Create a notice {}", "Publish an update {}"],
                            "amount": ["Top up the wallet {}", "Pay the hostel fee {}", "Add money to my card {}", "Make a donation {}"],
                            "query": ["Search {}", "Run a search {}", "Find listings {}", "Browse the site {}"]}[kind])).format(free)
    els = [el("#f-in", label, fk), el("#f-go", go, "button", x=300), el("#f-help", rng.choice(part(DISTRACTOR_LINKS)), "link", x=400, y=20)]
    return [
        step_example(task, els, [], None, [fastpath.ESCAPE], True, "Service (synthetic)", "free_only"),
        step_example(task, [dict(els[0], filled=True)] + els[1:], [{"action": "type", "target": "#f-in", "status": "ok"}], None,
                     ["click #f-go"], False, "Service (synthetic)", "free_only"),
    ]


WRONG_MASS = 0.02
# Share of forms that also need free text (v4: 0.5).
FREE_IN_FORM = 0.45
MAKERS = [(form_trajectory, 0.30), (overwrite_trajectory, 0.17), (click_then_type_trajectory, 0.18),
          (free_only_trajectory, 0.17), (nav_trajectory, 0.10), (toggle_trajectory, 0.08)]


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
    global SPLIT
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=900, help="approximate number of step examples")
    ap.add_argument("--seed", type=int, default=20260930)
    ap.add_argument("--split", choices=("all", "train", "val"), default="all",
                    help="wording banks to draw from; train and val never share an entry")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    SPLIT = a.split
    rng = random.Random(a.seed)
    rows = []
    while len(rows) < a.n:
        r, acc = rng.random(), 0
        for fn, w in MAKERS:
            acc += w
            if r <= acc:
                rows.extend(fn(rng))
                break
        else:
            rows.extend(MAKERS[0][0](rng))
    rows = rows[: a.n]
    with open(a.out, "w") as f:
        for r in rows:
            f.write(json.dumps({"body": r["body"], "accept": r["accept"], "free_text": r["free_text"], "family": r["family"],
                                "gold": targets(r)}) + "\n")
    fam = {}
    for r in rows:
        fam[r["family"]] = fam.get(r["family"], 0) + 1
    ov = check_overlap(rows)
    print(json.dumps({"examples": len(rows), "split": a.split, "free_text_true": sum(r["free_text"] for r in rows),
                      "escape_gold": sum(r["accept"] == [fastpath.ESCAPE] for r in rows), "families": fam, **ov}, indent=1))


if __name__ == "__main__":
    main()

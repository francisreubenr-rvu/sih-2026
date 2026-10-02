"""Held-out planner cases for the decision-model fast path (written 30 September 2026, after the
fast path was designed on cases.py, and not used to tune it).

Same shape as cases.py. `needs_llm` marks steps whose correct action types free text that is not a
vault token: a choice model cannot produce it, so the fast path must defer on those.
"""


def el(sel, label, kind="button", filled=False, x=40, y=100):
    return {"selector": sel, "x": x, "y": y, "fieldType": kind, "label": label, "filled": filled}


def case(cid, task, dom, elements, accept, history=(), needs_llm=False):
    return {"id": cid, "tokenizedTask": task, "sanitizedDom": dom, "elements": list(elements),
            "history": list(history), "accept": accept, "needs_llm": needs_llm}


def lines(elements, status=()):
    out = [f'{i + 1}. {e["fieldType"].upper()} selector={e["selector"]} label="{e["label"]}"' for i, e in enumerate(elements)]
    return "\n".join(out + [f'STATUS text="{s}"' for s in status])


SHIP = [el("#name", "Full name", "text"), el("#phone", "Phone", "tel", y=150), el("#addr", "Address line 1", "text", y=200),
        el("#pin", "PIN code", "text", y=250), el("#cont", "Continue to payment", y=320), el("#back", "Back to cart", "link", y=360)]
SHIP_FILLED = [dict(e, filled=True) if e["selector"] in ("#name", "#phone") else e for e in SHIP]
BANK = [el("#acct", "Beneficiary account number", "text"), el("#ifsc", "IFSC", "text", y=150), el("#amt", "Amount", "number", y=200),
        el("#add", "Add beneficiary", y=260), el("#cancel", "Cancel", y=260, x=200)]
MAIL = [el("#to", "To", "email"), el("#subj", "Subject", "text", y=140), el("#body", "Message", "textarea", y=220),
        el("#send", "Send", y=320), el("#discard", "Discard draft", y=320, x=200)]
LOGIN = [el("#user", "Email or phone", "email"), el("#pw", "Password", "password", y=150), el("#signin", "Sign in", y=200),
         el("#forgot", "Forgot password?", "link", y=240)]
SETTINGS = [el("#t-profile", "Profile", "link", y=40), el("#t-security", "Security", "link", x=120, y=40),
            el("#t-notif", "Notifications", "link", x=220, y=40), el("#logout", "Log out", "link", x=400, y=40),
            el("#closeacct", "Close account", y=500)]
NOTIF = [el("#email-alerts", "Email alerts", "checkbox"), el("#sms-alerts", "SMS alerts", "checkbox", y=140),
         el("#save-n", "Save preferences", y=200)]
SEARCH = [el("#q", "Search products", "search"), el("#go", "Search", x=300), el("#cart", "Cart (2)", "link", x=400, y=20)]
SUPPORT = [el("#topic", "Topic", "select"), el("#desc", "Describe the problem", "textarea", y=160),
           el("#email", "Reply-to email", "email", y=260), el("#submit", "Submit ticket", y=320)]

HELDOUT = [
    case("ship-name", "Ship to PERSONNAME#1, phone PHONE#1, at ADDRESS#1, PIN ZIPCODE#1, then continue",
         lines(SHIP), SHIP, ["type #name PERSONNAME#1", "type #phone PHONE#1", "type #addr ADDRESS#1", "type #pin ZIPCODE#1"]),
    case("ship-addr", "Ship to PERSONNAME#1, phone PHONE#1, at ADDRESS#1, PIN ZIPCODE#1, then continue",
         lines(SHIP_FILLED), SHIP_FILLED, ["type #addr ADDRESS#1", "type #pin ZIPCODE#1"],
         history=[{"action": "type", "target": "#name", "value": "PERSONNAME#1", "status": "ok"},
                  {"action": "type", "target": "#phone", "value": "PHONE#1", "status": "ok"}]),
    case("ship-continue", "Ship to PERSONNAME#1, phone PHONE#1, at ADDRESS#1, PIN ZIPCODE#1, then continue",
         lines([dict(e, filled=True) if e["fieldType"] != "button" and e["fieldType"] != "link" else e for e in SHIP]),
         [dict(e, filled=True) if e["fieldType"] not in ("button", "link") else e for e in SHIP], ["click #cont"],
         history=[{"action": "type", "target": s, "value": v, "status": "ok"} for s, v in
                  [("#name", "PERSONNAME#1"), ("#phone", "PHONE#1"), ("#addr", "ADDRESS#1"), ("#pin", "ZIPCODE#1")]]),
    case("bank-acct", "Add a beneficiary with account BANKACCOUNT#1 and IFSC IFSC#1",
         lines(BANK), BANK, ["type #acct BANKACCOUNT#1", "type #ifsc IFSC#1"]),
    case("bank-add-not-cancel", "Add a beneficiary with account BANKACCOUNT#1 and IFSC IFSC#1",
         lines([dict(e, filled=e["selector"] in ("#acct", "#ifsc")) for e in BANK]),
         [dict(e, filled=e["selector"] in ("#acct", "#ifsc")) for e in BANK], ["click #add"],
         history=[{"action": "type", "target": "#acct", "value": "BANKACCOUNT#1", "status": "ok"},
                  {"action": "type", "target": "#ifsc", "value": "IFSC#1", "status": "ok"}]),
    case("bank-done", "Add a beneficiary with account BANKACCOUNT#1 and IFSC IFSC#1",
         lines(BANK, ["Beneficiary added"]), BANK, ["finish"],
         history=[{"action": "type", "target": "#acct", "value": "BANKACCOUNT#1", "status": "ok"},
                  {"action": "type", "target": "#ifsc", "value": "IFSC#1", "status": "ok"},
                  {"action": "click", "target": "#add", "status": "ok"}]),
    case("mail-to", "Email EMAIL#1 that the meeting moved to Friday",
         lines(MAIL), MAIL, ["type #to EMAIL#1"]),
    case("mail-body-free", "Email EMAIL#1 that the meeting moved to Friday",
         lines([dict(e, filled=e["selector"] == "#to") for e in MAIL]), [dict(e, filled=e["selector"] == "#to") for e in MAIL],
         ["type #subj *meeting*", "type #body *Friday*", "type #subj *Friday*", "type #body *meeting*"],
         history=[{"action": "type", "target": "#to", "value": "EMAIL#1", "status": "ok"}], needs_llm=True),
    case("mail-send", "Email EMAIL#1 that the meeting moved to Friday",
         lines([dict(e, filled=e["selector"] in ("#to", "#subj", "#body")) for e in MAIL]),
         [dict(e, filled=e["selector"] in ("#to", "#subj", "#body")) for e in MAIL], ["click #send"],
         history=[{"action": "type", "target": "#to", "value": "EMAIL#1", "status": "ok"},
                  {"action": "type", "target": "#subj", "status": "ok"}, {"action": "type", "target": "#body", "status": "ok"}]),
    case("login-user", "Sign in as EMAIL#1", lines(LOGIN), LOGIN, ["type #user EMAIL#1"]),
    case("login-no-forgot", "Sign in as EMAIL#1; I will type the password myself",
         lines([dict(e, filled=e["selector"] in ("#user", "#pw")) for e in LOGIN]),
         [dict(e, filled=e["selector"] in ("#user", "#pw")) for e in LOGIN], ["click #signin"],
         history=[{"action": "type", "target": "#user", "value": "EMAIL#1", "status": "ok"}]),
    case("settings-security", "Open my security settings", lines(SETTINGS), SETTINGS, ["click #t-security"]),
    case("settings-notif", "Go to notification settings", lines(SETTINGS), SETTINGS, ["click #t-notif"]),
    case("notif-sms", "Turn on SMS alerts and save", lines(NOTIF), NOTIF, ["click #sms-alerts"]),
    case("notif-save", "Turn on SMS alerts and save", lines([dict(e, filled=e["selector"] == "#sms-alerts") for e in NOTIF]),
         [dict(e, filled=e["selector"] == "#sms-alerts") for e in NOTIF], ["click #save-n"],
         history=[{"action": "click", "target": "#sms-alerts", "status": "ok"}]),
    case("notif-done", "Turn on SMS alerts and save", lines(NOTIF, ["Preferences saved"]), NOTIF, ["finish"],
         history=[{"action": "click", "target": "#sms-alerts", "status": "ok"}, {"action": "click", "target": "#save-n", "status": "ok"}]),
    case("search-free", "Find a USB-C charger under 1000 rupees", lines(SEARCH), SEARCH,
         ["type #q *charger*", "type #q *USB*"], needs_llm=True),
    case("search-go", "Find a USB-C charger under 1000 rupees", lines([dict(SEARCH[0], filled=True)] + SEARCH[1:]),
         [dict(SEARCH[0], filled=True)] + SEARCH[1:], ["click #go"],
         history=[{"action": "type", "target": "#q", "status": "ok"}], needs_llm=False),
    case("cart-open", "Open my cart", lines(SEARCH), SEARCH, ["click #cart"]),
    case("support-email", "Raise a support ticket about a failed payment; reply to EMAIL#1",
         lines(SUPPORT), SUPPORT, ["type #email EMAIL#1", "click #topic", "type #desc *payment*"]),
    case("support-desc-free", "Raise a support ticket about a failed payment; reply to EMAIL#1",
         lines([dict(e, filled=e["selector"] in ("#email", "#topic")) for e in SUPPORT]),
         [dict(e, filled=e["selector"] in ("#email", "#topic")) for e in SUPPORT], ["type #desc *payment*"],
         history=[{"action": "type", "target": "#email", "value": "EMAIL#1", "status": "ok"},
                  {"action": "click", "target": "#topic", "status": "ok"}], needs_llm=True),
    case("support-submit", "Raise a support ticket about a failed payment; reply to EMAIL#1",
         lines([dict(e, filled=True) if e["selector"] != "#submit" else e for e in SUPPORT]),
         [dict(e, filled=True) if e["selector"] != "#submit" else e for e in SUPPORT], ["click #submit"],
         history=[{"action": "type", "target": "#email", "value": "EMAIL#1", "status": "ok"},
                  {"action": "click", "target": "#topic", "status": "ok"}, {"action": "type", "target": "#desc", "status": "ok"}]),
    case("profile-phone", "Change my phone number to PHONE#1",
         lines([el("#ph", "Mobile number", "tel", filled=True), el("#upd", "Update", y=160), el("#rm", "Remove number", y=160, x=200)]),
         [el("#ph", "Mobile number", "tel", filled=True), el("#upd", "Update", y=160), el("#rm", "Remove number", y=160, x=200)],
         ["type #ph PHONE#1"]),
    case("profile-phone-update", "Change my phone number to PHONE#1",
         lines([el("#ph", "Mobile number", "tel", filled=True), el("#upd", "Update", y=160), el("#rm", "Remove number", y=160, x=200)]),
         [el("#ph", "Mobile number", "tel", filled=True), el("#upd", "Update", y=160), el("#rm", "Remove number", y=160, x=200)],
         ["click #upd"], history=[{"action": "type", "target": "#ph", "value": "PHONE#1", "status": "ok"}]),
    case("download-statement", "Download my September statement",
         lines([el("#aug", "August 2026 statement (PDF)", "link"), el("#sep", "September 2026 statement (PDF)", "link", y=140),
                el("#oct", "October 2026 statement (PDF)", "link", y=180)]),
         [el("#aug", "August 2026 statement (PDF)", "link"), el("#sep", "September 2026 statement (PDF)", "link", y=140),
          el("#oct", "October 2026 statement (PDF)", "link", y=180)], ["click #sep"]),
    case("already-logged-in", "Sign in as EMAIL#1",
         lines([el("#acct", "Signed in as EMAIL#1", "link"), el("#logout", "Log out", "link", x=300)], ["Welcome back"]),
         [el("#acct", "Signed in as EMAIL#1", "link"), el("#logout", "Log out", "link", x=300)], ["finish"]),
    case("cookie-then-link", "Open the pricing page",
         lines([el("#ok", "Accept all cookies", y=600), el("#pricing", "Pricing", "link", x=200, y=20),
                el("#docs", "Docs", "link", x=280, y=20)]),
         [el("#ok", "Accept all cookies", y=600), el("#pricing", "Pricing", "link", x=200, y=20),
          el("#docs", "Docs", "link", x=280, y=20)], ["click #pricing", "click #ok"]),
    case("rename-free", "Rename my workspace to Orbit Ops",
         lines([el("#wsname", "Workspace name", "text", filled=True), el("#rename", "Rename")]),
         [el("#wsname", "Workspace name", "text", filled=True), el("#rename", "Rename")], ["type #wsname *Orbit Ops*"],
         needs_llm=True),
    case("aadhaar-type", "Enter my Aadhaar AADHAAR#1 and verify",
         lines([el("#aad", "Aadhaar number", "text"), el("#verify", "Verify", y=160), el("#skip", "Skip for now", "link", y=200)]),
         [el("#aad", "Aadhaar number", "text"), el("#verify", "Verify", y=160), el("#skip", "Skip for now", "link", y=200)],
         ["type #aad AADHAAR#1"]),
    case("aadhaar-verify", "Enter my Aadhaar AADHAAR#1 and verify",
         lines([el("#aad", "Aadhaar number", "text", filled=True), el("#verify", "Verify", y=160),
                el("#skip", "Skip for now", "link", y=200)]),
         [el("#aad", "Aadhaar number", "text", filled=True), el("#verify", "Verify", y=160), el("#skip", "Skip for now", "link", y=200)],
         ["click #verify"], history=[{"action": "type", "target": "#aad", "value": "AADHAAR#1", "status": "ok"}]),
]

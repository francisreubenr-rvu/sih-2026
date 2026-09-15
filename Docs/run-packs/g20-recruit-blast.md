# G20 run pack — recruit blast (Francis)

**Status:** Copy-paste ready. **Zero** non-author results until real sessions are logged. Do **not** mark G20 pass. No purchases. No Google login required.

**Protocol:** `Docs/human-evaluation-protocol.md`  
**Forms:** `Docs/human-evaluation-forms.md`  
**Log (after real sessions only):** `Benchmarks/results/human-evaluation.json`  
**Honesty:** Synthetic fixtures preferred. Keep private invite lists **out of git**. G11 untouched. `submission_ready` false. `g03_claim` false.

**Target:** invite ≥8 → complete ≥5 **non-author** participants + ≥3 **narrative reviewers**.

---

## Short recruit message (EN) — copy/paste

**Subject / opener:** Quick 20-min privacy UX check for a student SIH prototype (synthetic data only)

Hi ________,

I am Francis (RVU). For our SIH prototype **Dhristi** (on-device screen protect / selective redaction), I need **non-author** feedback — people who did not build the code or write the claims.

**What you would do (≈20 minutes):**
1. Look at a **synthetic** demo page only (no real accounts, no personal data).
2. Try: open fixture → toolbar capture → protect → read the “on this device” trust chip → glance at outbound JSON (no pixels leave the device).
3. Answer a short Likert + 2–3 free-text confusion notes (stored anonymized as P#).

**Optional second ask (≈15 minutes, can be async):** skim the public site / short pitch narrative and score clarity of privacy limits with a 1–5 rubric (reviewer R#).

**Constraints we already disclose:** face-only detector; text OCR limits; full-flow &lt;200 ms **not** claimed (G11 fail). Synthetic fixtures only.

If you are free this week, reply with a 20-min slot (in person or call). Thank you — no purchase or Google login needed.

— Francis

**Eligibility:** not a repo author / not primary claims writer for this entry. Classmates OK if they did not implement Dhristi.

---

## Optional Hindi (HI) — short version

**विषय:** SIH प्रोटोटाइप — 20 मिनट प्राइवेसी UX चेक (केवल सिंथेटिक डेटा)

नमस्ते ________,

मैं Francis (RVU) हूँ। हमारे SIH प्रोटोटाइप **Dhristi** (डिवाइस पर स्क्रीन प्रोटेक्ट / selective redaction) के लिए **non-author** फीडबैक चाहिए — जिन्होंने कोड/claims नहीं लिखे।

**आप क्या करेंगे (≈20 मिनट):** सिंथेटिक डेमो पेज → toolbar capture → protect → “इस उपकरण पर” trust chip → outbound JSON देखें (पिक्सेल डिवाइस नहीं छोड़ते)। छोटा Likert + 2–3 नोट्स (P# के रूप में anonymized)।

**वैकल्पिक (≈15 मिनट):** साइट/pitch पढ़कर 1–5 rubric (R#)।

**ईमानदारी:** face-only detector; OCR सीमाएँ; full-flow &lt;200 ms claim नहीं (G11 fail)। केवल synthetic fixtures। कोई खरीद / Google login नहीं।

इस हफ़्ते 20 मिनट का स्लॉट हो तो जवाब दें। धन्यवाद।

— Francis

---

## Links for facilitators / participants

| What | Where |
|------|--------|
| Protocol (tasks + rubric) | `Docs/human-evaluation-protocol.md` |
| Printable forms | `Docs/human-evaluation-forms.md` |
| Public site (narrative review) | https://francisreubenr-rvu.github.io/sih-2026/ |
| Results log (anonymized only) | `Benchmarks/results/human-evaluation.json` |
| What leaves device (honesty) | `Docs/what-leaves-device.md` |

Facilitator prep: `cd Prototype && npm start` → load unpacked `Prototype/extension-build/` → open fixture. Remote OK if facilitator drives the browser and participant instructs verbally.

---

## Privacy note (say aloud / paste in invite thread)

- Prefer **synthetic fixtures** only. Never open production, personal email, banking, DigiLocker, or Aadhaar-bearing tabs during eval.
- Repo stores **anonymized IDs** (`P1`… / `R1`…) only — no real names, emails, phones, or screenshots of personal data.
- DigiLocker styling on the UI is **aesthetic / “on this device” trust language**, not a partner or custody claim.
- Invite tracking stays in your private notes; do not commit PII.

---

## After sessions

1. Fill forms from `Docs/human-evaluation-forms.md`.
2. Append anonymized JSON shapes from the protocol into `Benchmarks/results/human-evaluation.json`.
3. Keep `"status": "unknown"` until ≥5 participants **and** ≥3 narrative reviewers exist for real.
4. Team practice → `team_rehearsal` only (does not count toward G20).

## Explicit non-goals

- No ghost participants or fake Likert scores.
- No G11 / `submission_ready` / `g03_claim` flips from this pack.

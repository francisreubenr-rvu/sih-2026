# Dhristi — human demo path (judges / team)

**Product:** Dhristi (SIH26171) · former name Sightline  
**Audience:** judges, teammates rehearsing the toolbar `activeTab` path  
**Honesty rule:** do not claim G11 &lt;200 ms full-flow pass, Firefox live validation, or official rubric score. Toolbar glyph capture is human-only.

---

## Setup (before the room)

1. **Clone / pull** `francisreubenr-rvu/sih-2026` on the demo laptop. Prefer the branch that has the Dhristi rename merged (or `feat/rename-dhristi`).
2. **Node.js 22+** and `cd Prototype && npm ci` (or `npm install`).
3. **Optional planner:** start Ollama with `qwen2.5:7b-instruct` on `11434` (or the port in `.env`). Privacy-only Capture & protect works **without** Ollama — preferred if the model is cold.
4. **Start the local server:** `npm start` → workspace at `http://127.0.0.1:9041/`.
5. **Load unpacked extension (Chromium):**
   - `chrome://extensions` → Developer mode → Load unpacked → `Prototype/extension-build/` (after `npm run build:extension`).
   - Pin the **Dhristi** toolbar icon.
6. **Synthetic fixture tab:** open `http://127.0.0.1:9041/` (or the operations / validation fixture pages). Stay on `http(s)` — not `chrome://`.
7. **Pre-flight:** confirm trust chip reads **on this device** / **इस उपकरण पर**; EN/HI toggle works; no real DigiLocker / bank / personal account is open.

**Fallback if extension build missing:** run `cd Prototype && npm run build:extension`, or unzip `Docs/dhristi-extension-v01.zip` / `Website/downloads/dhristi-extension-v01.zip` and load that folder.

---

## Minute-by-minute spoken script (EN)

| Time | What you do | What you say |
|------|-------------|--------------|
| **0:00–0:30** | Show website wordmark + local workspace tab | “This is **Dhristi** — on-device visual perception for a light-weight browser agent, SIH26171. Original pixels stay in the browser. Only a protected semantic scene can leave.” |
| **0:30–1:00** | Point at synthetic fixture (faces / PII-looking fields) | “We use a **synthetic fixture**, not a live citizen account. Faces and sensitive-looking regions are what the local filter is meant to protect.” |
| **1:00–1:20** | Click the **Dhristi toolbar icon** (required) | “Chrome only grants `activeTab` after a **toolbar gesture**. Opening the popup from the extensions page is not enough for production capture — that refusal is intentional.” |
| **1:20–1:40** | Trust chip + Hindi one-liner | EN: “Capture and privacy filter run **on this device**.” HI (chip): **“इस उपकरण पर”** — “Raw pixels are not uploaded for this step.” |
| **1:40–2:20** | Click **Capture & protect**; watch stages Inject → … → Review | “Local UltraFace plus DOM regions; selective preview keeps non-sensitive layout visible locally. Outbound JSON is **semantics-only** — no screenshot field.” |
| **2:20–2:50** | Show sanitized summary / proposal (privacy-only if no Ollama) | “Default path can stop at a privacy review without calling a planner. If the local model is up, a proposed action still needs **human confirm** before any click.” |
| **2:50–3:20** | Confirm or Cancel deliberately | “Nothing submits a real form. Confirm is bounded; Cancel and expiry fail closed.” |
| **3:20–4:00** | Limits (spoken, not slide-only) | “Full-flow latency under 200 ms is still a **fail** when the planner is included. WebPII text redraw still retained annotated PII on 58/100 screens historically — that is why text export stays off. Firefox package exists; live Firefox run is not claimed here.” |
| **4:00–4:30** | Close | “Dhristi is an inspectable engineering boundary: useful context, smaller exposure, reviewed action. Evaluate the mechanism and its recorded limits.” |

### Hindi one-liners (trust moments)

- Trust chip: **इस उपकरण पर** (on this device).
- After capture: **मूल पिक्सेल यहीं रहते हैं** (original pixels stay here).
- Before confirm: **हर क्रिया की पुष्टि आवश्यक है** (every action needs confirmation).
- On activeTab error: use the in-UI HI string (toolbar gesture) — do not invent a softer claim.

---

## Click path (toolbar / activeTab)

1. Focus the **fixture** tab (`http://127.0.0.1:9041/…`).
2. Click the **Dhristi** puzzle/toolbar icon (not “Inspect popup” from `chrome://extensions`).
3. Optional: toggle **हिं** to show DigiLocker-credible bilingual UI; toggle back to **EN** for the spoken track.
4. Paste pairing token only if exercising planner pairing from the workspace; privacy-only demo can skip token if the UI allows Capture & protect without planner.
5. **Capture & protect** → wait for stage strip to reach **Review**.
6. If planner proposal appears → **Confirm** once on a safe synthetic control, or **Cancel** to show fail-closed.
7. If error mentions toolbar / activeTab → close popup, click toolbar icon again, retry (do not load a harness overlay for judges).

---

## What to say about privacy / on-device / Dhristi

- **Name:** Dhristi (user spelling). Former working name Sightline; unrelated Devpost “SightLine” is not this project.
- **Boundary:** browser retains the original screen; protected geometric / labeled context is what a reasoning step may see.
- **On-device:** face detection (UltraFace ONNX/WASM) and redaction preview run in the extension; lab OCR/PII weights are **not** in the MV3 zip.
- **Egress:** `assertSanitizedPayload` / scheme `dhristi-semantic-v1` — no raw screenshot, DOM dump, or password value in the plan request.
- **Not claimed:** zero leakage, store listing, official SIH score, or &lt;200 ms end-to-end with LLM.

---

## Failure fallbacks

| Failure | Fallback |
|---------|----------|
| Ollama down / slow | Stay on **privacy-only** Capture & protect; say planner is optional. |
| `activeTab` / toolbar error | Close popup → click toolbar icon → retry. Do not demo harness `<all_urls>` overlay. |
| Extension fails to load | Load from regenerated `dhristi-extension-v01.zip`; or show Website recorded demo video + open local workspace JS demo. |
| Detector miss on tiny face | Acknowledge scale sensitivity; show selective regions that did fire; do not invent detections. |
| Wrong tab (`chrome://`, Web Store) | Switch to localhost fixture; explain restricted pages cannot be captured. |
| Demo laptop audio issues | Use this script as captions; video on Website is silent by design. |

---

## Rehearsal checklist pointers

- Use `Docs/demo-rehearsal-checklist.md` and `Docs/demo-judge-checklist.md` (toolbar glyph still human-only).
- Confirm zips and Website download link say **dhristi-extension**, not the old Sightline filename.
- Run once cold: load unpacked → toolbar → Capture & protect → Review in under five minutes.
- Second run: force Cancel and an intentional activeTab mistake so recovery is muscle memory.
- Never mark G03 toolbar, G11, G14, or G20 as pass without new measured evidence.


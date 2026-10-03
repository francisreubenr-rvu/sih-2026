// redactor.js: PII redaction for text and screenshots.
//
// Pure ES module: no `document`, `window`, or `Image` in the primary path, so
// the same file runs inside the service worker (OffscreenCanvas +
// createImageBitmap) and the content script. The only DOM touch is the
// explicit legacy fallback for environments without OffscreenCanvas, which by
// definition are window contexts.
//
// Privacy-critical paths are commented inline. The guiding rule is: when in
// doubt, over-mask (never leak). Screenshot redaction fails CLOSED: if a
// capture cannot be verified as masked (decode error, canvas failure), the
// original capture is discarded rather than ever returned unmasked.

const MASK_TOKEN = '<mask-pii/>';

// ---------------------------------------------------------------------------
// Luhn checksum
// ---------------------------------------------------------------------------
// Card numbers are masked ONLY when they pass Luhn. Digit-count alone is
// deliberately insufficient: arbitrary 13-19 digit strings (order IDs,
// barcodes, timestamps, account numbers) would otherwise be destroyed.
function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// IBAN mod-97 check, digit by digit so no BigInt is needed.
function ibanValid(m) {
  const compact = m.replace(/ /g, '').toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = parseInt(ch, 36);
    for (const d of String(v)) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

// ---------------------------------------------------------------------------
// Match copy (added 3 October 2026, mirrors warden/redactor.py match_copy)
// ---------------------------------------------------------------------------
// Every pass matches on a copy where Indian-script digits and full-width ASCII
// map to ASCII, non-breaking spaces to a space, and zero-width and soft-hyphen
// characters to "-". Each mapping is one UTF-16 unit for one, so offsets into
// the copy index the original. Measured leaks it closes: "खाता संख्या
// 50100234567812" and its Devanagari-digit form, "98765\u200b43210", "ravi＠example.com".
const INDIC_DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];
function mapMatchChar(code) {
  for (const zero of INDIC_DIGIT_ZEROS) if (code >= zero && code <= zero + 9) return 48 + code - zero;
  if (code >= 0xff01 && code <= 0xff5e) return code - 0xfee0;
  if (code === 0x00a0 || code === 0x2007 || code === 0x202f) return 32;
  if (code === 0x00ad || (code >= 0x200b && code <= 0x200d) || code === 0x2060 || code === 0xfeff) return 45;
  return code;
}
export function matchCopy(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) out += String.fromCharCode(mapMatchChar(text.charCodeAt(i)));
  return out;
}

// Any other run of 9 to 18 digits is an account number. Groups need 3+ digits
// except a final group of 2, so pagination ("10 11 12 13 14") and timestamps
// ("2026-10-03 18:01") cannot add up to one. Runs after the Aadhaar heuristic.
const ACCOUNT_RE = /(?<![0-9])[0-9]{3,}(?:[ -][0-9]{3,})*(?:[ -][0-9]{2})?(?![0-9])/g;
const accountValid = (m) => {
  const n = m.replace(/[ -]/g, '').length;
  return n >= 9 && n <= 18;
};
// A date on a line that names a date of birth (EN or HI) is a date of birth.
const DOB_KEYWORD_RE = /date of birth|\bdob\b|\bbirth|\bborn\b|जन्म/i;
const DATE_RE = /(?<![0-9])(?:[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{4})(?![0-9])/gi;
function replaceDobLines(working, replacer) {
  if (!DOB_KEYWORD_RE.test(working)) return working;
  return working.split('\n').map((line) => (DOB_KEYWORD_RE.test(line) ? line.replace(DATE_RE, replacer) : line)).join('\n');
}

// ---------------------------------------------------------------------------
// Pattern set (single source of truth)
// ---------------------------------------------------------------------------
// Order matters: longer / more specific patterns run first so a card number
// (13-19 digits) is consumed whole before a phone or Aadhaar pattern can
// match a substring of it. Each pass replaces matches with a placeholder that
// contains no digits (MASK_TOKEN for redactText, a TYPE#n token for
// tokenizeText), so later patterns naturally skip already-replaced spans.
// This array is the ONLY definition of the PII pattern set in the extension.
// Both redactText() and tokenizeText() below walk it in this exact order;
// background.js imports tokenizeText rather than keeping its own copy.
const passes = [
  {
    name: 'email',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    confidence: 'regex-exact'
  },
  {
    // Before the digit passes, so Aadhaar or card cannot take the digits out of
    // an IBAN. Validated by the IBAN mod-97 check.
    name: 'iban',
    re: /\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    confidence: 'regex-exact',
    validate: ibanValid
  },
  {
    name: 'pan',
    re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    confidence: 'regex-exact'
  },
  {
    name: 'passport',
    re: /\b[A-Za-z][0-9]{7}\b/g,
    confidence: 'regex-exact'
  },
  {
    name: 'card',
    re: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g,
    confidence: 'regex-exact',
    validate: (m) => {
      const digits = m.replace(/[ -]/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    }
  },
  {
    // Not part of a longer grouped number: "3920 1188 2201 76" is one account
    // number, and taking its first 12 digits as Aadhaar used to leave "76".
    name: 'aadhaar',
    re: /(?<!\d)(?<!\d[ -])\d{4}[ -]\d{4}[ -]\d{4}(?![ -]?\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)\+91[ -]?[6-9]\d{9}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)[6-9]\d{2}[ -]\d{3}[ -]\d{4}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)0?[6-9]\d{4}[ -]\d{5}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)0?[6-9]\d{9}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)\+[1-9]\d{1,3}[ -]?\d{6,14}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    // Grouped international (e.g. "+44 20 7946 0958", "+1 555 123 4567").
    // The single-separator pattern above only handles one optional separator,
    // so this catches multi-group numbers. Total-digit floor (>= 7) keeps it
    // from over-triggering on short "+1 23 45" fragments.
    name: 'phone',
    re: /(?<!\d)\+[1-9]\d{1,3}(?:[ -]\d{2,4}){2,5}(?!\d)/g,
    confidence: 'regex-exact',
    validate: (m) => m.replace(/[ -]/g, '').length >= 7
  }
];

// Bare 12-digit Aadhaar keyword-proximity heuristic, shared by redactText()
// and tokenizeText(). Tradeoff: a bare 12-digit run is ambiguous (it could be
// a timestamp, barcode, or account number), so it is only treated as Aadhaar
// when the surrounding text explicitly signals an Aadhaar context. Checked
// against the ORIGINAL text, not the working (partially replaced) string, so
// a keyword elsewhere in the passage still triggers it.
const AADHAAR_KEYWORD_RE = /aadhaar|aadhar|uidai/i;
const AADHAAR_BARE_RE = /(?<!\d)\d{12}(?!\d)/g;

// ---------------------------------------------------------------------------
// Text redaction
// ---------------------------------------------------------------------------

// Apply one regex to `text`, replacing every match with MASK_TOKEN. `validate`
// (optional) receives the raw match and may veto masking (used by the Luhn
// gate). Returns the masked text plus per-match decisions.
function applyPattern(text, regex, pattern, confidence, validate) {
  const decisions = [];
  let count = 0;
  const masked = text.replace(regex, (match) => {
    if (validate && !validate(match)) return match; // veto: leave intact
    count += 1;
    decisions.push({ pattern, matchedLength: match.length, confidence });
    return MASK_TOKEN;
  });
  return { text: masked, count, decisions };
}

export function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: text ?? '', count: 0, decisions: [] };
  }

  const decisions = [];
  let count = 0;
  let working = matchCopy(text);

  for (const pass of passes) {
    const result = applyPattern(working, pass.re, pass.name, pass.confidence, pass.validate);
    working = result.text;
    count += result.count;
    decisions.push(...result.decisions);
  }

  // Aadhaar keyword-proximity (heuristic). See AADHAAR_KEYWORD_RE above for
  // the tradeoff this encodes.
  if (AADHAAR_KEYWORD_RE.test(text)) {
    const result = applyPattern(working, AADHAAR_BARE_RE, 'aadhaar', 'heuristic-label');
    working = result.text;
    count += result.count;
    decisions.push(...result.decisions);
  }

  const account = applyPattern(working, ACCOUNT_RE, 'accountnumber', 'regex-exact', accountValid);
  working = account.text;
  count += account.count;
  decisions.push(...account.decisions);

  working = replaceDobLines(working, (match) => {
    count += 1;
    decisions.push({ pattern: 'dateofbirth', matchedLength: match.length, confidence: 'heuristic-label' });
    return MASK_TOKEN;
  });

  return { text: working, count, decisions };
}

// ---------------------------------------------------------------------------
// Tokenization (for the token vault)
// ---------------------------------------------------------------------------
// Unlike redactText(), which discards every matched value behind a single
// opaque MASK_TOKEN, tokenizeText() keeps the raw matches around (in
// `tokens`) so a caller (background.js's token vault) can rehydrate them
// later. It walks the exact same `passes` array, in the exact same order, so
// its classification of what counts as PII never diverges from redactText().
//
// Replaces each match with an uppercase `TYPE#n` token (EMAIL#1, PHONE#1,
// AADHAAR#1, PAN#1, CARD#1, PASSPORT#1, ...), numbered per type starting at
// 1. A match that fails a pass's `validate` predicate is left alone, exactly
// as in redactText().
// Values are cut from the match copy, so a value that held Indian-script digits
// or a zero-width character is minted in ASCII digits with "-" (the Warden's
// regex_spans keeps the page's own characters; warden/redactor.py regex_strip
// matches this function for the parity test).
export function tokenizeText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: text ?? '', tokens: {} };
  }

  const tokens = {};
  const counts = {};
  let working = matchCopy(text);

  const mint = (match, patternName) => {
    const type = patternName.toUpperCase();
    counts[type] = (counts[type] || 0) + 1;
    const token = `${type}#${counts[type]}`;
    tokens[token] = match;
    return token;
  };

  for (const pass of passes) {
    working = working.replace(pass.re, (match) => {
      if (pass.validate && !pass.validate(match)) return match; // veto: leave intact
      return mint(match, pass.name);
    });
  }

  // Aadhaar keyword-proximity (heuristic), same trigger as redactText().
  if (AADHAAR_KEYWORD_RE.test(text)) {
    working = working.replace(AADHAAR_BARE_RE, (match) => mint(match, 'aadhaar'));
  }

  working = working.replace(ACCOUNT_RE, (match) => (accountValid(match) ? mint(match, 'accountnumber') : match));
  working = replaceDobLines(working, (match) => mint(match, 'dateofbirth'));

  return { text: working, tokens };
}

// ---------------------------------------------------------------------------
// Screenshot redaction
// ---------------------------------------------------------------------------

function mimeFromDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);/.exec(dataUrl);
  return m ? m[1] : 'image/png';
}

// Re-encode only to a type the canvas encoders reliably support.
function encodeMime(dataUrl) {
  const m = mimeFromDataUrl(dataUrl);
  return m === 'image/png' || m === 'image/jpeg' ? m : 'image/png';
}

// Decode a data URL to a Blob without fetch (worker-safe, no network path).
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] || 'image/png';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}

async function loadBitmap(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }
  // Legacy window fallback (createImageBitmap is universal in modern engines).
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return { canvas: new OffscreenCanvas(width, height), offscreen: true };
  }
  // Fallback: only reachable in window contexts (service workers always have
  // OffscreenCanvas), so `document` is safe here.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, offscreen: false };
}

async function encodeCanvas(canvas, offscreen, mime) {
  if (offscreen) {
    const blob = await canvas.convertToBlob({ type: mime });
    return blobToDataUrl(blob);
  }
  return canvas.toDataURL(mime);
}

export async function redactScreenshot(dataUrl, fields = [], viewport = null) {
  const list = Array.isArray(fields) ? fields : [];
  const valid = list.filter(
    (f) =>
      f &&
      Number.isFinite(f.x) &&
      Number.isFinite(f.y) &&
      Number.isFinite(f.width) &&
      Number.isFinite(f.height) &&
      f.width > 0 &&
      f.height > 0
  );

  if (valid.length === 0) {
    return { dataUrl, maskedCount: 0, decisions: [] };
  }

  try {
    const bitmap = await loadBitmap(dataUrl);
    const width = bitmap.width || bitmap.naturalWidth || 0;
    const height = bitmap.height || bitmap.naturalHeight || 0;
    if (!width || !height) throw new Error('image has no dimensions');

    // The capture (captureVisibleTab) is in device pixels; the fields the
    // caller supplies are in CSS px from the scanned viewport. On a DPR-2
    // display the raw rects would only cover a quarter of each field, so
    // scale into capture-pixel space before drawing.
    const hasViewport =
      viewport &&
      Number.isFinite(viewport.width) &&
      viewport.width > 0 &&
      Number.isFinite(viewport.height) &&
      viewport.height > 0;
    const scaleX = hasViewport ? width / viewport.width : 1;
    const scaleY = hasViewport ? height / viewport.height : 1;

    const { canvas, offscreen } = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Privacy-critical: an OPAQUE fill (alpha 1.0) so masked regions cannot be
    // recovered by alpha-compositing or colour-channel tricks. Opacity is what
    // protects; the colour is the Signal neutral panel-2 (#eceff7), not black, because
    // the masked capture is shown in the light side panel (no dark grounds, DESIGN.md).
    ctx.fillStyle = '#eceff7';
    const decisions = [];
    for (const f of valid) {
      // Round outward (floor the origin, ceil the far edge) so scaling never
      // shaves a sliver off a masked field: over-mask rather than under-mask.
      const scaledX0 = Math.floor(f.x * scaleX);
      const scaledY0 = Math.floor(f.y * scaleY);
      const scaledX1 = Math.ceil((f.x + f.width) * scaleX);
      const scaledY1 = Math.ceil((f.y + f.height) * scaleY);

      // Clamp each box to the image bounds; skip anything that collapses to
      // zero area (fully out of frame).
      const x = Math.max(0, Math.min(scaledX0, width));
      const y = Math.max(0, Math.min(scaledY0, height));
      const w = Math.max(0, Math.min(scaledX1 - scaledX0, width - x));
      const h = Math.max(0, Math.min(scaledY1 - scaledY0, height - y));
      if (w <= 0 || h <= 0) continue;
      ctx.fillRect(x, y, w, h);
      decisions.push({
        pattern: f.kind || 'field',
        bbox: [x, y, w, h],
        confidence: f.confidence || 'regex-exact'
      });
    }

    const out = await encodeCanvas(canvas, offscreen, encodeMime(dataUrl));
    return { dataUrl: out, maskedCount: decisions.length, decisions };
  } catch (error) {
    // Fail CLOSED: an unmasked capture must never escape a redaction failure.
    // The caller is expected to treat a null dataUrl as "no screenshot".
    return { dataUrl: null, maskedCount: 0, decisions: [], error: error.message };
  }
}

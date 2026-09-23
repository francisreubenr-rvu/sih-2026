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
    name: 'aadhaar',
    re: /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/g,
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
    re: /(?<!\d)[6-9]\d{4}[ -]\d{5}(?!\d)/g,
    confidence: 'regex-exact'
  },
  {
    name: 'phone',
    re: /(?<!\d)[6-9]\d{9}(?!\d)/g,
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
  let working = text;

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
export function tokenizeText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: text ?? '', tokens: {} };
  }

  const tokens = {};
  const counts = {};
  let working = text;

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

    // Privacy-critical: opaque black fill (alpha 1.0) so masked regions cannot
    // be recovered by alpha-compositing or color-channel tricks.
    ctx.fillStyle = '#000000';
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

/**
 * DOM / free-text PII span detection for local mosaic hints.
 * Telemetry + selective preview only — never authorizes raw text export.
 * Face-only vision cannot cover passwords/OTP/cards/PII text (PS gap).
 */

/** @typedef {{ kind: string, start: number, end: number, rule: string }} TextSpan */

const PATTERNS = Object.freeze([
  { kind: 'email', rule: 'email', re: /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi },
  // Aadhaar 4-4-4 (synthetic fixtures).
  { kind: 'aadhaar', rule: 'aadhaar', re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { kind: 'pan', rule: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
  { kind: 'ifsc', rule: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi },
  { kind: 'voter-id', rule: 'voter-id', re: /\b[A-Z]{3}\d{7}\b/gi },
  { kind: 'gstin', rule: 'gstin', re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/gi },
  { kind: 'upi-vpa', rule: 'upi-vpa', re: /\b[\w.+-]{2,}@(?:upi|ybl|ibl|axl|paytm|okaxis|oksbi|okhdfcbank)\b/gi },
  // Card-like 13–19 digit runs (spaces/hyphens allowed).
  { kind: 'card-like', rule: 'card-like', re: /\b(?:\d[ -]*?){13,19}\b/g },
  // OTP / verification codes: labelled or “N-digit code” forms (PS passwords/OTP/cards).
  {
    kind: 'otp',
    rule: 'otp-labelled',
    re: /\b(?:otp|one[\s-]?time\s(?:password|code|pin)|verification\s(?:code|pin)|auth(?:entication)?\s(?:code|pin)|2fa\s(?:code|pin)|login\scode)\b(?:\s*(?:is|:|#|=|-))?\s*\d{4,8}\b/gi,
  },
  {
    kind: 'otp',
    rule: 'otp-n-digit',
    re: /\b(?:\d[\s-]?){0,1}(?:4|5|6|8)[\s-]?digit\s(?:code|otp|pin)\b(?:\s*(?:is|:|#|=))?\s*\d{4,8}\b/gi,
  },
  // Bare 6-digit tokens next to OTP/code vocabulary in the same string (handled via otp-labelled);
  // standalone 6-digit only when preceded by code/OTP within 24 chars (lookbehind-safe scan below).
  { kind: 'cvv', rule: 'cvv-labelled', re: /\b(?:cvv|cvc|csc|security\scode)\b(?:\s*(?:is|:|#|=))?\s*\d{3,4}\b/gi },
  {
    kind: 'password',
    rule: 'password-labelled',
    re: /\b(?:password|passwd|secret|passphrase)\b\s*(?:is|:|#|=)\s*\S{4,64}/gi,
  },
  { kind: 'number', rule: 'phone-like', re: /(?:\+?\d[\d\s().-]{7,}\d)/g },
  {
    kind: 'sensitive-label',
    rule: 'sensitive-label',
    re: /\b(?:password|secret|token|account|address|passport|aadhaar|आधार|pan|पैन|ifsc|voter|otp|cvv|cvc|pin|one[\s-]?time)\b/gi,
  },
]);

/**
 * Find sensitive character spans in free text.
 * Overlapping spans are kept; callers may merge for mosaic.
 */
export function detectSensitiveTextSpans(text) {
  /** @type {TextSpan[]} */
  const spans = [];
  if (!text || typeof text !== 'string') return spans;

  for (const { kind, rule, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (end > start) spans.push({ kind, start, end, rule });
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  // Contextual bare OTP: 4–8 digits within 28 chars after otp/code/pin vocabulary.
  const ctx = /\b(?:otp|code|pin|password)\b/gi;
  let cm;
  while ((cm = ctx.exec(text)) !== null) {
    const window = text.slice(cm.index, Math.min(text.length, cm.index + 28));
    const dig = window.match(/\b(\d{4,8})\b/);
    if (!dig) continue;
    const start = cm.index + window.indexOf(dig[1]);
    const end = start + dig[1].length;
    if (!spans.some(s => s.start <= start && s.end >= end && s.kind === 'otp')) {
      spans.push({ kind: 'otp', start, end, rule: 'otp-nearby-digits' });
    }
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  return suppressRedundantTextSpans(spans);
}

const SPECIFICITY = Object.freeze({
  email: 5, aadhaar: 5, pan: 5, ifsc: 5, 'voter-id': 5, gstin: 5, 'upi-vpa': 5,
  'card-like': 5, otp: 4, cvv: 4, password: 4,
  number: 2, 'sensitive-label': 1,
});

/**
 * Drop weaker spans fully covered by a stronger/equal longer span.
 * Keeps mosaic coverage while improving instance precision honesty.
 */
export function suppressRedundantTextSpans(spans) {
  if (!Array.isArray(spans) || spans.length <= 1) return spans ? [...spans] : [];
  const sorted = [...spans].sort((a, b) => {
    const sa = SPECIFICITY[a.kind] ?? 0, sb = SPECIFICITY[b.kind] ?? 0;
    if (sb !== sa) return sb - sa;
    return (b.end - b.start) - (a.end - a.start);
  });
  const kept = [];
  for (const span of sorted) {
    const covered = kept.some(k => span.start >= k.start && span.end <= k.end);
    if (covered) continue;
    // Card runs often contain a 12-digit Aadhaar-shaped prefix — keep card, drop aadhaar.
    if (span.kind === 'aadhaar' && kept.some(k => k.kind === 'card-like' && span.start >= k.start && span.end <= k.end)) continue;
    if (span.kind === 'aadhaar' && kept.some(k => k.kind === 'card-like' && !(span.end <= k.start || span.start >= k.end))) continue;
    kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Unique kind labels — backward-compatible with classifySensitive consumers. */
export function classifySensitiveKinds(text) {
  const found = [];
  const seen = new Set();
  for (const span of detectSensitiveTextSpans(text)) {
    if (seen.has(span.kind)) continue;
    seen.add(span.kind);
    found.push(span.kind);
  }
  return found;
}

/**
 * Form-control heuristics for password / OTP / card / email / tel fields.
 * Used by page-agent collect(); exported for held-out eval.
 */
export function classifySensitiveFormField({ type = '', name = '', autocomplete = '', inputmode = '', id = '' } = {}) {
  const t = String(type).toLowerCase();
  const blob = `${autocomplete} ${name} ${id} ${t} ${inputmode}`.toLowerCase();
  const kinds = [];
  if (t === 'password' || /password|passwd|new-password|current-password/.test(blob)) kinds.push('password');
  if (
    t === 'email' ||
    /(?:^|[\s_-])email(?:$|[\s_-])|username/.test(blob) ||
    autocomplete === 'email'
  ) kinds.push('email');
  if (t === 'tel' || /phone|tel|mobile/.test(blob)) kinds.push('tel');
  if (
    /one-time-code|otp|totp|2fa|verification|auth.?code/.test(blob) ||
    (inputmode === 'numeric' && /code|otp|pin/.test(blob))
  ) kinds.push('otp');
  if (/cc-number|card.?number|cardno|pan.?card/.test(blob)) kinds.push('card-like');
  if (/cc-csc|cvv|cvc|csc|security.?code/.test(blob)) kinds.push('cvv');
  if (/aadhaar|आधार|uidai/.test(blob)) kinds.push('aadhaar');
  if (/\bpan\b|permanent.?account/.test(blob)) kinds.push('pan');
  if (/ifsc/.test(blob)) kinds.push('ifsc');
  return [...new Set(kinds)];
}

export function isSensitiveFormField(attrs) {
  const kinds = classifySensitiveFormField(attrs);
  const type = String(attrs?.type || '').toLowerCase();
  return kinds.length > 0 || type === 'password' || type === 'email' || type === 'tel';
}

/**
 * Character-level redaction scores for text-span detectors.
 * coverage = GT PII chars covered by any prediction.
 * preservation = non-PII chars left unmasked.
 * Instance P/R uses span IoU on character intervals (threshold default 0.5).
 */
export function scoreTextSpanRedaction({ text, groundTruthSpans, predictedSpans, iouThreshold = 0.5 }) {
  if (typeof text !== 'string') throw new Error('Invalid text');
  if (!Array.isArray(groundTruthSpans) || !Array.isArray(predictedSpans)) throw new Error('Invalid spans');
  const n = text.length;
  const gt = new Uint8Array(n);
  const pred = new Uint8Array(n);
  const paint = (mask, span) => {
    const a = Math.max(0, Math.floor(span.start));
    const b = Math.min(n, Math.ceil(span.end));
    for (let i = a; i < b; i++) mask[i] = 1;
  };
  for (const s of groundTruthSpans) paint(gt, s);
  for (const s of predictedSpans) paint(pred, s);
  let pii = 0, covered = 0, non = 0, preserved = 0;
  for (let i = 0; i < n; i++) {
    if (gt[i]) {
      pii++;
      if (pred[i]) covered++;
    } else {
      non++;
      if (!pred[i]) preserved++;
    }
  }
  const matched = new Set();
  let tp = 0;
  for (const p of predictedSpans) {
    let best = 0, bestIdx = -1;
    for (let i = 0; i < groundTruthSpans.length; i++) {
      if (matched.has(i)) continue;
      const g = groundTruthSpans[i];
      const inter = Math.max(0, Math.min(p.end, g.end) - Math.max(p.start, g.start));
      const union = (p.end - p.start) + (g.end - g.start) - inter;
      const iou = union > 0 ? inter / union : 0;
      if (iou > best) { best = iou; bestIdx = i; }
    }
    if (best >= iouThreshold && bestIdx >= 0) { tp++; matched.add(bestIdx); }
  }
  const fp = predictedSpans.length - tp;
  const fn = groundTruthSpans.length - tp;
  return {
    piiCharCoverage: pii ? covered / pii : null,
    nonPiiPreservation: non ? preserved / non : null,
    piiChars: pii,
    piiCoveredChars: covered,
    nonPiiChars: non,
    nonPiiPreservedChars: preserved,
    instancePrecision: tp + fp ? tp / (tp + fp) : (groundTruthSpans.length === 0 && predictedSpans.length === 0 ? 1 : null),
    instanceRecall: tp + fn ? tp / (tp + fn) : (groundTruthSpans.length === 0 ? 1 : null),
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    status: 'held_out_synthetic_text_fixture',
  };
}

/**
 * Face-only predictor for honesty baselines: never emits text spans.
 * Organizer PS lists passwords/OTP/cards/PII text — face boxes alone score 0 recall here.
 */
export function faceOnlyTextPredictions() {
  return [];
}

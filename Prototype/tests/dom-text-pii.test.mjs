import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSensitiveTextSpans,
  classifySensitiveKinds,
  classifySensitiveFormField,
  scoreTextSpanRedaction,
  faceOnlyTextPredictions,
  suppressRedundantTextSpans,
} from '../shared/dom-text-pii.mjs';
import { classifySensitive } from '../shared/privacy.mjs';
import { localWordPolicy } from '../shared/text-privacy.mjs';

test('detects OTP / verification / n-digit code phrases that legacy label-only missed', () => {
  for (const text of [
    'Your one-time code is 391204',
    'verification code 847291',
    '6-digit code: 102938',
    'authentication code: 778899',
  ]) {
    const kinds = classifySensitive(text);
    assert.ok(kinds.includes('otp'), text);
    const spans = detectSensitiveTextSpans(text);
    assert.ok(spans.some(s => s.kind === 'otp' && /\d{4,8}/.test(text.slice(s.start, s.end))), text);
  }
});

test('detects CVV, password values, cards, and email without authorizing export', () => {
  assert.ok(classifySensitive('CVV 123').includes('cvv'));
  assert.ok(classifySensitive('password: hunter2secret').includes('password'));
  assert.ok(classifySensitive('4111 1111 1111 1111').includes('card-like'));
  assert.ok(classifySensitive('a@b.co').includes('email'));
  assert.deepEqual(classifySensitive('Pending Review Next'), []);
});

test('face-only predictor emits no text spans', () => {
  assert.deepEqual(faceOnlyTextPredictions(), []);
});

test('scoreTextSpanRedaction separates coverage from preservation', () => {
  const text = 'OTP 123456 ok';
  const gt = [{ kind: 'otp', start: 0, end: 10 }];
  const pred = detectSensitiveTextSpans(text);
  const scored = scoreTextSpanRedaction({ text, groundTruthSpans: gt, predictedSpans: pred });
  assert.equal(scored.piiCharCoverage, 1);
  assert.ok(scored.nonPiiPreservation > 0.5);
  assert.equal(scored.status, 'held_out_synthetic_text_fixture');
});

test('form-field heuristics catch one-time-code and card autocomplete', () => {
  assert.deepEqual(classifySensitiveFormField({ type: 'password' }), ['password']);
  assert.ok(classifySensitiveFormField({ autocomplete: 'one-time-code', name: 'otp' }).includes('otp'));
  assert.ok(classifySensitiveFormField({ autocomplete: 'cc-number' }).includes('card-like'));
  assert.ok(classifySensitiveFormField({ autocomplete: 'cc-csc' }).includes('cvv'));
  assert.deepEqual(classifySensitiveFormField({ type: 'search', name: 'q' }), []);
});

test('suppressRedundantTextSpans drops aadhaar prefix inside card runs', () => {
  const spans = suppressRedundantTextSpans([
    { kind: 'aadhaar', start: 0, end: 14, rule: 'aadhaar' },
    { kind: 'card-like', start: 0, end: 19, rule: 'card-like' },
  ]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].kind, 'card-like');
});

test('classifySensitiveKinds matches privacy.classifySensitive re-export', () => {
  const text = 'operator@upi OTP 112233';
  assert.deepEqual(classifySensitive(text), classifySensitiveKinds(text));
});

test('OCR localWordPolicy marks OTP digits on the same labelled line', () => {
  const word = (text, x, lineIndex) => ({ text, confidence: 95, lineIndex, rect: { x, y: 0, width: 20, height: 20 } });
  const items = [word('OTP:', 0, 0), word('482913', 40, 0), word('Review', 0, 1)];
  const result = localWordPolicy(items, new Map());
  assert.equal(result[0].sensitive, false); // label token with colon is field marker
  assert.equal(result[1].sensitive, true);
  assert.equal(result[2].sensitive, false);
});

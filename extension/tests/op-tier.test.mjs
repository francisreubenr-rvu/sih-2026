import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyClickTarget, decideGate, findSceneElement, nameMismatch, stricterTier, tierForPlan,
} from '../utils/op-tier.js';

test('any destructive string makes the click destructive', () => {
  const cases = [
    { visibleText: 'Delete my account', ariaLabel: 'Next' },
    { visibleText: 'Next', ariaLabel: 'Delete account' },
    { visibleText: 'Next', title: 'Remove' },
    { visibleText: '', value: 'Deactivate' },
    { visibleText: 'Next', formAction: 'https://example.test/account/delete', submitsForm: true },
    { visibleText: 'Next', formaction: 'https://example.test/account/close-account' },
    { visibleText: 'Next page', href: 'https://example.test/subscription/cancel_subscription' },
    { visibleText: 'Next', type: 'submit', formAction: 'https://example.test/erase' },
  ];
  for (const d of cases) assert.equal(classifyClickTarget(d), 'destructive', JSON.stringify(d));
});

test('a plain next link is navigational; a form submit or name mismatch is at least state-changing', () => {
  assert.equal(classifyClickTarget({ visibleText: 'Next page', href: 'https://example.test/p2' }), 'navigational');
  assert.equal(classifyClickTarget({ visibleText: 'Next', submitsForm: true, formAction: 'https://example.test/p2' }), 'state-changing');
  assert.equal(classifyClickTarget({ visibleText: 'Open archive', ariaLabel: 'Next' }), 'state-changing');
  assert.equal(classifyClickTarget({ visibleText: 'Save' }), 'state-changing');
  assert.equal(classifyClickTarget({ visibleText: 'Frobnicate' }), 'state-changing');
  assert.equal(classifyClickTarget(null), 'state-changing');
});

test('name mismatch only when both names are present and neither contains the other', () => {
  assert.equal(nameMismatch('Delete my account', 'Next'), true);
  assert.equal(nameMismatch('Next page', 'Next'), false);
  assert.equal(nameMismatch('', 'Next'), false);
  assert.equal(nameMismatch('Next', ''), false);
});

test('stricterTier orders tiers and refuses unknown ones', () => {
  assert.equal(stricterTier('navigational', 'destructive'), 'destructive');
  assert.equal(stricterTier('state-changing', 'reversible'), 'state-changing');
  assert.throws(() => stricterTier('navigational', 'harmless'));
});

const scene = [
  { selector: 'a.next', tier: 'navigational', handle: 'h1' },
  { selector: 'button.del', tier: 'destructive', handle: 'h2' },
  { selector: 'dup', tier: 'navigational', handle: 'h3' },
  { selector: 'dup', tier: 'destructive', handle: 'h4' },
];

test('tierForPlan reads the local scan tier and refuses a missing, ambiguous or untiered target', () => {
  assert.equal(tierForPlan({ action: 'click', target_selector: 'a.next' }, scene), 'navigational');
  assert.equal(tierForPlan({ action: 'click', target_selector: 'button.del' }, scene), 'destructive');
  assert.equal(tierForPlan({ action: 'type', target_selector: 'a.next' }, scene), 'state-changing');
  assert.equal(tierForPlan({ action: 'type', target_selector: 'button.del' }, scene), 'destructive');
  assert.equal(tierForPlan({ action: 'scroll' }, scene), 'reversible');
  assert.throws(() => tierForPlan({ action: 'click', target_selector: 'missing' }, scene), /not in this extension's own scan/);
  assert.throws(() => tierForPlan({ action: 'click', target_selector: 'dup' }, scene), /ambiguous/);
  assert.throws(() => tierForPlan({ action: 'click', target_selector: 'x' }, [{ selector: 'x' }]), /no known tier/);
  assert.throws(() => tierForPlan({ action: 'submit' }, scene), /unrecognized action/);
  assert.throws(() => findSceneElement('dup', scene));
});

test('decideGate: only an exact accept with an agreeing unattended-safe tier runs unattended', () => {
  assert.equal(decideGate({ verdict: 'accept', wardenTier: 'navigational', localTier: 'navigational' }).path, 'unattended');
  assert.equal(decideGate({ verdict: 'accept', wardenTier: 'reversible', localTier: 'reversible' }).path, 'unattended');

  const disagree = decideGate({ verdict: 'accept', wardenTier: 'destructive', localTier: 'navigational' });
  assert.deepEqual([disagree.path, disagree.finalTier], ['confirm', 'destructive']);
  const weaker = decideGate({ verdict: 'accept', wardenTier: 'reversible', localTier: 'navigational' });
  assert.deepEqual([weaker.path, weaker.finalTier], ['confirm', 'navigational']);

  for (const verdict of [undefined, null, '', 'ok', 'Accept', 'accept ', ['accept'], { accept: true }]) {
    assert.equal(decideGate({ verdict, wardenTier: 'navigational', localTier: 'navigational' }).path, 'confirm', String(verdict));
  }
  for (const wardenTier of [undefined, null, 'harmless', 7]) {
    assert.equal(decideGate({ verdict: 'accept', wardenTier, localTier: 'navigational' }).path, 'confirm', String(wardenTier));
  }
  assert.equal(decideGate({ verdict: 'accept', wardenTier: 'state-changing', localTier: 'state-changing' }).path, 'confirm');
  assert.equal(decideGate({ verdict: 'ask', wardenTier: 'navigational', localTier: 'navigational' }).path, 'ask');
  assert.equal(decideGate({ verdict: 'reject', wardenTier: 'navigational', localTier: 'navigational' }).path, 'reject');
  assert.equal(decideGate({ verdict: 'accept', wardenTier: 'navigational', localTier: null }).path, 'reject');
});

// ---- classifyClickTargetBasis --------------------------------------------------------------------
import { classifyClickTarget as tierOf, classifyClickTargetBasis } from '../utils/op-tier.js';

test('classifyClickTargetBasis names the rule that decided, and agrees with classifyClickTarget', () => {
  const cases = [
    [{ visibleText: 'Delete account' }, 'destructive', 'destructive-keyword'],
    [{ visibleText: 'Pay now' }, 'state-changing', 'submit-keyword'],
    [{ visibleText: 'Continue', submitsForm: true }, 'state-changing', 'submits-form'],
    [{ visibleText: 'Delete my account', ariaLabel: 'Next' }, 'destructive', 'destructive-keyword'],
    [{ visibleText: 'Orders', ariaLabel: 'Archive' }, 'state-changing', 'name-mismatch'],
    [{ visibleText: 'View statement' }, 'navigational', 'navigation-label'],
    [{ visibleText: 'Statements' }, 'state-changing', 'unproven'],
    [{ visibleText: 'खाता हटाएं' }, 'destructive', 'destructive-keyword'],
    [{ visibleText: 'सहायता केंद्र' }, 'state-changing', 'unproven'],
  ];
  for (const [desc, tier, basis] of cases) {
    assert.deepEqual(classifyClickTargetBasis(desc), { tier, basis }, JSON.stringify(desc));
    assert.equal(tierOf(desc), tier);
  }
});

// ---- Hindi destructive keywords (30 September 2026) ------------------------------------------------
import { expressesDestructiveIntent as intentOf } from '../utils/op-tier.js';

test('Hindi destructive labels tier destructive in every descriptor, including behind a zero-width joiner', () => {
  for (const text of ['खाता हटाएं', 'सभी डेटा मिटाएं', 'खाता बंद करें', 'सदस्यता रद्द करें', 'प्रोफ़ाइल निष्क्रिय करें', 'कार्ड डिलीट करें', 'सत्र समाप्त करें', 'ह\u200dटाएं', 'मि\u200bटाएं']) {
    assert.deepEqual(classifyClickTargetBasis({ visibleText: text }), { tier: 'destructive', basis: 'destructive-keyword' }, text);
    assert.equal(tierOf({ visibleText: 'Settings', ariaLabel: 'Settings', title: text }), 'destructive', `title ${text}`);
  }
});

test('Hindi Cancel, Finish and ordinary labels are not destructive', () => {
  for (const text of ['रद्द करें', 'समाप्त', 'सहायता केंद्र', 'मेरे ऑर्डर']) {
    assert.notEqual(tierOf({ visibleText: text }), 'destructive', text);
  }
});

test('Hindi tasks express destructive intent', () => {
  assert.equal(intentOf('मेरा खाता हटाएं'), true);
  assert.equal(intentOf('मेरी संगीत सदस्यता रद्द करें'), true);
  assert.equal(intentOf('मेरा बिजली का बिल भरें'), false);
});

// ---- Navigation labels (security review, 3 October 2026) -------------------------------------------
// "\blink\b" anywhere made "Link Aadhaar to PAN" navigational (unattended); "open" made opening a new
// account or deposit navigational. Both are state changes the label does not prove safe.
test('link-as-a-verb and opening a new account or deposit are not navigational', () => {
  for (const text of ['Link this device', 'Link account', 'Link Aadhaar to PAN', 'Open new fixed deposit', 'Open a new account', 'Open an account', 'Open account', 'Terms link']) {
    assert.deepEqual(classifyClickTargetBasis({ visibleText: text }), { tier: 'state-changing', basis: 'unproven' }, text);
  }
  for (const text of ['Open settings', 'View statement', 'Go to home', 'Next page', 'Back', 'Menu']) {
    assert.notEqual(classifyClickTargetBasis({ visibleText: text }).basis, 'unproven', text);
  }
});

// ---- Invisible and compatibility characters (security review, 3 October 2026) ----------------------
// A soft hyphen, a bidi control or a fullwidth letter renders the same word but hid it from the rules.
test('soft hyphens, bidi controls and fullwidth letters cannot hide a destructive or submit keyword', () => {
  for (const text of ['Del\u00adete account', 'Re\u200emove card', 'De\u202elete', 'Era\u2066se all', '\uff24\uff45\uff4c\uff45\uff54\uff45 account', 'ह\u00adटाएं', 'खाता\u200f हटाएं']) {
    assert.equal(classifyClickTargetBasis({ visibleText: text }).basis, 'destructive-keyword', JSON.stringify(text));
  }
  for (const text of ['Pa\u00ady now', '\uff30\uff41\uff59', 'भु\u00adगतान करें', 'Se\u2069nd']) {
    assert.equal(classifyClickTargetBasis({ visibleText: text }).basis, 'submit-keyword', JSON.stringify(text));
  }
  assert.equal(intentOf('del\u00adete my account'), true);
});

// ---- Hindi submit keywords (PLAN item 8, 3 October 2026) --------------------------------------------
// Hindi pay/send/submit/confirm/order/buy labels must tier by the submit rule, never 'unproven' (only
// an unproven click can be released by the Laya reviewer). Imperative verb forms count; a bare noun
// counts only where English counts its equivalent ("pay", "confirm", "checkout", "submit").
const HI_SUBMIT_LABELS = [
  'भुगतान करें', 'अभी भुगतान करें', 'भुगतान', '₹500 का भुगतान करें', 'पेमेंट करें', 'पे करें', 'बिल अदा करें',
  'भेजें', 'पैसे भेजें', 'संदेश भेजो', 'भेज दें', 'सेंड करें', 'पैसे ट्रांसफ़र करें', 'ट्रांसफर करें',
  'जमा करें', 'फ़ॉर्म जमा करें', 'आवेदन जमा कीजिए', 'सबमिट करें', 'सबमिट', 'प्रस्तुत करें', 'रिटर्न दाखिल करें',
  'पुष्टि करें', 'भुगतान की पुष्टि करें', 'कन्फर्म करें', 'कन्फ़र्म', 'ऑर्डर करें', 'ऑर्डर दें', 'आर्डर प्लेस करें',
  'खरीदें', 'अभी खरीदें', 'ख़रीदें', 'चेकआउट', 'सहेजें', 'बदलाव सहेजें', 'सेव करें', 'रिचार्ज करें',
  'भे‍जें', 'जमा​ करें', 'पु‌ष्टि करें',
];

test('Hindi pay, send, submit, confirm, order and buy labels tier by the submit rule, never unproven', () => {
  for (const text of HI_SUBMIT_LABELS) {
    assert.deepEqual(classifyClickTargetBasis({ visibleText: text }), { tier: 'state-changing', basis: 'submit-keyword' }, text);
    // Any descriptor the submit rule reads (aria-label, title, value) counts, as in English.
    assert.equal(classifyClickTargetBasis({ visibleText: '', ariaLabel: text }).basis, 'submit-keyword', `aria ${text}`);
  }
});

test('Hindi submit keywords do not over-match nouns, past participles and look-alike words', () => {
  // View deposit amount; sent messages; customer service (सेवा contains सेव); my orders; continue
  // shopping; page 2 (पेज starts with पे); fixed deposit; saved items; help centre; "scope".
  for (const text of ['जमा राशि देखें', 'भेजे गए संदेश', 'ग्राहक सेवा', 'मेरे ऑर्डर', 'खरीदारी जारी रखें', 'पेज 2', 'सावधि जमा', 'सहेजे गए आइटम', 'सहायता केंद्र', 'स्कोप करें']) {
    assert.deepEqual(classifyClickTargetBasis({ visibleText: text }), { tier: 'state-changing', basis: 'unproven' }, text);
  }
});

test('a Hindi destructive keyword still wins over a Hindi submit keyword', () => {
  for (const text of ['भुगतान विधि हटाएं', 'खाता हटाने की पुष्टि करें', 'सदस्यता रद्द करें और भेजें', 'कार्ड डिलीट करें और सहेजें']) {
    assert.deepEqual(classifyClickTargetBasis({ visibleText: text }), { tier: 'destructive', basis: 'destructive-keyword' }, text);
  }
});

test('accepted over-match: a payment noun reads submit, as English "Payment history" does', () => {
  assert.equal(classifyClickTargetBasis({ visibleText: 'Payment history' }).basis, 'submit-keyword');
  assert.equal(classifyClickTargetBasis({ visibleText: 'भुगतान इतिहास' }).basis, 'submit-keyword');
});

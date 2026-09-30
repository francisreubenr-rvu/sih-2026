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
    [{ visibleText: 'खाता हटाएं' }, 'state-changing', 'unproven'],
  ];
  for (const [desc, tier, basis] of cases) {
    assert.deepEqual(classifyClickTargetBasis(desc), { tier, basis }, JSON.stringify(desc));
    assert.equal(tierOf(desc), tier);
  }
});

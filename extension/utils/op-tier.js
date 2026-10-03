// op-tier.js: the extension's own operation-tier rules (ROAST.md F17).
//
// Ported independently from warden/tiers.py, on purpose, not shared: a spoofed or compromised
// loopback listener must not be able to authorise a destructive action by controlling both sides
// of one implementation. background.js imports this module to gate EXECUTE; content.js imports it
// (as a web-accessible resource) to re-derive the tier from the live element at click time.
//
// Every tier this file produces is computed from the extension's OWN page scan. Nothing here reads
// an element list, a tier, or a verdict that the Warden returned, except decideGate(), which
// takes the Warden's tier and verdict only to become stricter than the local answer, never looser.

export const TIERS = Object.freeze(['reversible', 'navigational', 'state-changing', 'destructive']);

// Hindi (Devanagari and common transliterations) mirrors the English list: delete/remove (हटा,
// डिलीट, रिमूव), erase (मिटा), deactivate (निष्क्रिय, डीएक्टिवेट), destroy (नष्ट), unsubscribe,
// terminate / close / cancel an account, subscription or session. Substring match, like the English
// label list, because JavaScript's \b is ASCII-only. Bare "रद्द करें" (Cancel) and bare "समाप्त"
// (also the usual "Finish" button) are left out, as bare "Cancel" is in English. Without this list
// every Hindi destructive label tiered state-changing by the unproven default (ROAST round 28).
//
// 2 October 2026 (Francis): the verbs neither language had. English forget, discard, withdraw,
// purge, revoke, unlink, disconnect, wipe, kick, stop sharing, leave a group/team/workspace, end a
// membership/subscription, empty trash, clear history/data, factory reset, void a transaction;
// Hindi भूल जाएं (forget), leaving a group (समूह छोड़ें; bare "छोड़ें" is also the usual Skip button
// and is left out), stop sharing, revoke access, वापस लें (withdraw), unlink, disconnect, factory
// reset, empty trash, removing a member. Kept narrow on purpose: "Leave a review", "Swipe", "Clear
// filters" and "avoid" must not read destructive. The pattern is NFKC-normalised because "छोड़"
// carries a nukta that NFC/NFKC decompose, and matched text is canonicalised the same way.
const HI_DESTRUCTIVE = ('हटा|मिटा|डिलीट|रिमूव|निष्क्रिय|डीएक्टिवेट|डिएक्टिवेट|नष्ट|अनसब्सक्राइब|(?:खाता|अकाउंट|सदस्यता|सब्सक्रिप्शन|सत्र) (?:बंद|रद्द|समाप्त)|'
  + 'भूल जा|(?:समूह|ग्रुप|टीम|संगठन|चैनल|चैट|परिवार) (?:को )?छोड़|(?:साझा|शेयर) करना बंद|(?:पहुँच|पहुंच|एक्सेस|अनुमति) (?:रद्द|हटा|वापस)|वापस ले|अनलिंक|डिस्कनेक्ट|(?:फ़ैक्टरी|फैक्टरी) रीसेट|(?:ट्रैश|कचरा|रीसायकल बिन|बिन) खाली|बाहर निकाल|सदस्य(?:ों)? (?:को )?निकाल').normalize('NFKC');
const EN_DESTRUCTIVE_LABEL_EXTRA = 'forget|discard|withdraw|purge|revoke|unlink|disconnect|\\bwipe|\\bkick\\b|stop sharing|leave (?:the |this |my )?(?:group|team|organi[sz]ation|workspace|channel|chat|community|conversation|household|family)|end (?:membership|subscription|session|plan)|empty (?:trash|bin)|clear (?:all )?(?:history|data|messages|activity|chats?)|factory reset|reset to factory|void (?:transaction|payment|order)';
const EN_DESTRUCTIVE_INTENT_EXTRA = '\\b(?:forget|discard(?:ed|ing)?|withdraw(?:n|ing)?|purg(?:e|ed|ing)|revok(?:e|ed|ing)|unlink(?:ed|ing)?|disconnect(?:ed|ing)?|wip(?:e|ed|ing)|kick(?:ed|ing)?)\\b|\\bstop sharing\\b|\\bleave (?:the |this |my )?(?:group|team|organi[sz]ation|workspace|channel|chat|community|conversation|household|family)\\b|\\bend (?:my |the )?(?:membership|subscription|plan)\\b|\\bempty (?:the |my )?(?:trash|bin)\\b|\\bfactory reset\\b';
const DESTRUCTIVE_INTENT_RE = new RegExp(`\\b(delete|remove|deactivat(?:e|ing|ed)|terminat(?:e|ing|ed)|eras(?:e|ing|ed)|destroy(?:ing|ed)?)\\b|\\bclose (?:my|the) account\\b|\\bcancel (?:my|the) (?:account|subscription)\\b|${EN_DESTRUCTIVE_INTENT_EXTRA}|${HI_DESTRUCTIVE}`, 'i');
const DESTRUCTIVE_LABEL_RE = new RegExp(`delete|remove|deactivat|terminat|eras|destroy|unsubscribe|close account|cancel (account|subscription)|${EN_DESTRUCTIVE_LABEL_EXTRA}|${HI_DESTRUCTIVE}`, 'i');
// Hindi submit keywords (PLAN item 8, 3 October 2026). Without them every Hindi pay or send label
// tiered state-changing by the 'unproven' default, the one basis a Laya review can release. Two
// kinds of entry:
//   - imperative verb forms: pay (भुगतान करें, पे करें, अदा करें), send (भेजें/भेजो/भेज दें, सेंड,
//     ट्रांसफ़र करें), submit (जमा करें, सबमिट, प्रस्तुत करें, दाखिल करें), confirm (पुष्टि करें,
//     कन्फ़र्म), order (ऑर्डर करें/दें), buy (खरीदें), save (सहेजें, सेव करें), recharge.
//   - a bare noun only where English already counts its equivalent bare: भुगतान/पेमेंट ("pay"),
//     पुष्टि and कन्फ़र्म ("confirm"), सबमिट ("submit"), चेकआउट ("checkout").
// Kept narrow on purpose: "जमा राशि देखें" (view deposit amount), "सावधि जमा" (fixed deposit),
// "भेजे गए संदेश" (sent messages), "सहेजे गए आइटम" (saved items), "मेरे ऑर्डर" (my orders), "खरीदारी
// जारी रखें" (continue shopping), "ग्राहक सेवा" (सेवा contains सेव) and "पेज 2" (पेज starts with पे)
// stay unproven. Accepted over-match: "भुगतान इतिहास" (payment history) reads submit, as "Payment
// history" already does in English; it costs a prompt, never an unattended click. Destructive is
// checked first, so "भुगतान विधि हटाएं" stays destructive. NFKC-normalised like HI_DESTRUCTIVE (फ़ and ख़
// decompose under NFC). Mirrored in warden/tiers.py; test_warden.py runs both.
const HI_SUBMIT = ('भुगतान|पेमेंट|(?:^|\\s)पे कर|अदा कर|भेज(?:ें|ो|िए|िये| दें| दो| दीजिए)|(?:सेंड|ट्रांसफ़र|ट्रांसफर|ट्रान्सफ़र|ट्रान्सफर) कर|'
  + 'जमा (?:कर|कीजिए)|सबमिट|प्रस्तुत (?:कर|कीजिए)|(?:दाखिल|दाख़िल) (?:कर|कीजिए)|पुष्टि|कन्फ़र्म|कन्फर्म|(?:ऑर्डर|आर्डर) (?:कर|दें|दो|दीजिए|प्लेस)|'
  + '(?:खरीद|ख़रीद)(?:ें|ो|िए|िये|ना)|चेकआउट|सहेज(?:ें|ो|िए| लें)|सेव कर|रिचार्ज कर').normalize('NFKC');
const SUBMIT_LABEL_RE = new RegExp(`submit|save|confirm|pay|checkout|place order|purchase|send|${HI_SUBMIT}`, 'i');
// Navigational needs the label to START with a navigation verb. "\blink\b" anywhere is gone: it made
// "Link Aadhaar to PAN" and "Link this device" navigational, so they clicked unattended. "Open" does
// not count when it opens a new account or deposit ("Open a new account", "Open new fixed deposit",
// "Open account"); those stay unproven (security review, 3 October 2026). Mirrored in tiers.py.
const NAV_LABEL_RE = /^(go to|view|open(?! (?:new|an?|account)\b)|back|next|home|menu)\b/i;

export function isKnownTier(tier) {
  return TIERS.includes(tier);
}

export function tierRank(tier) {
  return TIERS.indexOf(tier);
}

// The stricter of two KNOWN tiers. Callers handle an unknown tier explicitly; this never guesses.
export function stricterTier(a, b) {
  if (!isKnownTier(a) || !isKnownTier(b)) throw new Error(`stricterTier: unknown tier ${!isKnownTier(a) ? a : b}`);
  return tierRank(a) >= tierRank(b) ? a : b;
}

export function tierPermitsUnattended(tier) {
  return tier === 'reversible' || tier === 'navigational';
}

export function expressesDestructiveIntent(task) {
  return DESTRUCTIVE_INTENT_RE.test(canonical(task));
}

// URL paths and slugs ("/account/close-account", "cancel_subscription") are matched as words.
// Invisible characters removed, then NFKC: a page must not hide "हटाएं" or "Delete" from the rules
// with a joiner, a soft hyphen (U+00AD), a bidi control (U+200E/F, U+202A-E, U+2066-9), or
// fullwidth letters, all of which render as the same word (security review, 3 October 2026). The
// patterns above are NFKC-normalised the same way. Mirrored in tiers.py _canonical().
const INVISIBLE_RE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
function canonical(text) {
  return String(text || '').replace(INVISIBLE_RE, '').normalize('NFKC');
}

function normalise(text) {
  return canonical(text).replace(/[\s\-_/.?=&+#:%]+/g, ' ').trim();
}

function collapse(text) {
  return canonical(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

// True when a control shows one thing and announces another: both non-empty and neither contains
// the other. `<button aria-label="Next">Delete my account</button>` is the case this exists for.
export function nameMismatch(visibleText, accessibleName) {
  const shown = collapse(visibleText);
  const named = collapse(accessibleName);
  if (!shown || !named) return false;
  return !shown.includes(named) && !named.includes(shown);
}

// Tier for clicking one live control, from every string that can describe what the click does:
// visible text, accessible name, title, value, placeholder, the owning form's action, the
// control's own formaction, an anchor's href, and the control type. Destructive if ANY of them
// reads destructive. A visible-text vs accessible-name mismatch, or a control that submits a
// form, is at least state-changing. Navigational needs a navigation label and nothing stricter.
//
// `d` fields (all optional strings unless noted): visibleText, ariaLabel, title, value,
// placeholder, formAction, formaction, href, type, submitsForm (boolean).
export function classifyClickTarget(d) {
  return classifyClickTargetBasis(d).tier;
}

// The same rules, also naming which one decided. `basis` is one of 'destructive-keyword',
// 'submit-keyword', 'submits-form', 'name-mismatch', 'navigation-label' or 'unproven' (the
// conservative state-changing default: nothing identified the control either way). Only an
// 'unproven' click may ever be released by a plan reviewer (plan-check.js layaRelease).
export function classifyClickTargetBasis(d) {
  const desc = d || {};
  const all = [desc.visibleText, desc.ariaLabel, desc.title, desc.value, desc.placeholder,
    desc.formAction, desc.formaction, desc.href, desc.type];
  if (all.some((text) => DESTRUCTIVE_LABEL_RE.test(normalise(text)))) return { tier: 'destructive', basis: 'destructive-keyword' };

  const labels = [desc.visibleText, desc.ariaLabel, desc.title, desc.value, desc.type];
  if (labels.some((text) => SUBMIT_LABEL_RE.test(normalise(text)))) return { tier: 'state-changing', basis: 'submit-keyword' };
  if (desc.submitsForm === true) return { tier: 'state-changing', basis: 'submits-form' };
  const accessibleName = desc.ariaLabel || desc.title || '';
  if (nameMismatch(desc.visibleText, accessibleName)) return { tier: 'state-changing', basis: 'name-mismatch' };

  const name = collapse(desc.ariaLabel || desc.visibleText || desc.title || desc.value);
  if (NAV_LABEL_RE.test(name)) return { tier: 'navigational', basis: 'navigation-label' };
  return { tier: 'state-changing', basis: 'unproven' }; // conservative default: stop for confirmation, not proven safe
}

// Exactly one element of the extension's own scan carries `selector`, or this throws. Selectors
// are display keys that the planner names; the scan makes them unique, and an ambiguous or
// missing key is refused rather than resolved to "the first match".
export function findSceneElement(selector, localScene) {
  const matches = (localScene || []).filter((el) => el && el.selector === selector);
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `local tier: target is not in this extension's own scan: ${selector}`
      : `local tier: target key is ambiguous in this extension's own scan (${matches.length} matches): ${selector}`);
  }
  return matches[0];
}

// Tier for a whole plan, resolved against the extension's own scan (`localScene`, whose elements
// carry the `tier` content.js computed from the live DOM). Throws when the plan cannot be tiered.
export function tierForPlan(plan, localScene) {
  const action = plan && plan.action;
  if (action === 'scroll' || action === 'wait' || action === 'finish') return 'reversible';
  if (action === 'click' || action === 'type') {
    const el = findSceneElement(plan.target_selector, localScene);
    if (!isKnownTier(el.tier)) throw new Error(`local tier: scanned element has no known tier: ${plan.target_selector}`);
    return action === 'type' ? stricterTier('state-changing', el.tier) : el.tier;
  }
  throw new Error(`local tier: unrecognized action ${action}`);
}

export function hasDestructiveControl(localScene) {
  return (localScene || []).some((el) => el && el.tier === 'destructive');
}

// The F17 gate decision. Fail closed:
//   - no local tier                         -> reject
//   - verdict exactly "reject"              -> reject (the caller re-plans)
//   - verdict exactly "ask"                 -> ask the Warden's question
//   - verdict anything but exactly "accept" -> confirm locally (missing / malformed / unknown)
//   - Warden tier unknown or different      -> confirm locally
//   - final tier not reversible/navigational -> confirm locally
//   - otherwise                             -> unattended
// The final tier is the stricter of the Warden's and the local tier when both are known; the
// local tier alone when the Warden's is unusable (the prompt still fires in that case).
export function decideGate({ verdict, wardenTier, localTier }) {
  if (!isKnownTier(localTier)) {
    return { path: 'reject', finalTier: null, reasons: ['the extension could not compute a tier for this plan'] };
  }
  if (verdict === 'reject') return { path: 'reject', finalTier: localTier, reasons: [] };

  const wardenKnown = isKnownTier(wardenTier);
  const finalTier = wardenKnown ? stricterTier(wardenTier, localTier) : localTier;
  if (verdict === 'ask') return { path: 'ask', finalTier, reasons: [] };

  const reasons = [];
  if (verdict !== 'accept') reasons.push(`the Warden verdict ${JSON.stringify(verdict ?? null)} is not a recognised accept`);
  if (!wardenKnown) reasons.push(`the Warden tier ${JSON.stringify(wardenTier ?? null)} is not a known tier`);
  else if (wardenTier !== localTier) reasons.push(`the Warden reported tier '${wardenTier}'; this extension computed '${localTier}' from its own scan`);
  if (!tierPermitsUnattended(finalTier)) reasons.push(`tier '${finalTier}' requires local confirmation`);
  return { path: reasons.length ? 'confirm' : 'unattended', finalTier, reasons };
}

// Revision identity for the page agent.
//
// crypto.randomUUID() is gated to secure contexts (HTTPS, localhost, file:,
// extension origins). A content script injected into an ordinary http:// page —
// the extension's whole purpose — would therefore throw inside createPageAgent()
// before it could observe anything. crypto.getRandomValues() is available in
// every context, so it carries the real fallback.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function uuidFromBytes(bytes) {
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * A change-detection nonce. It only has to be unique within one page session,
 * so unpredictability is a convenience, not a guarantee this module claims.
 *
 * @param source crypto-like object. Omit it to use the ambient Web Crypto;
 *   pass null to assert that no source exists.
 * @param options.allowWeakFallback use a Math.random nonce when the source
 *   exposes neither method. Off by default so a broken injection fails loudly.
 */
export function newRevisionId(source, { allowWeakFallback = false } = {}) {
  const cryptoSource = source === undefined ? globalThis.crypto : source;
  if (!cryptoSource) throw new Error('No crypto source available for a revision id.');
  if (typeof cryptoSource.randomUUID === 'function') return cryptoSource.randomUUID();
  if (typeof cryptoSource.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    return uuidFromBytes(bytes);
  }
  if (allowWeakFallback) return weakRevisionId();
  throw new Error('Crypto source provides neither randomUUID nor getRandomValues.');
}

/**
 * Last resort for an environment with no Web Crypto at all. Documented as weak:
 * Math.random() is not a cryptographic source and this must never be used for a
 * secret, a token or an authorization decision.
 */
export function weakRevisionId() {
  const stamp = Date.now().toString(16).slice(-8).padStart(8, '0');
  const noise = Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12);
  const candidate = `${stamp}-0000-4000-8000-${noise}`;
  return UUID_V4.test(candidate) ? candidate : `${stamp}-0000-4000-8000-000000000000`;
}

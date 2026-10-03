// Loopback allowlist for stored Warden and OmniParser URLs.
// A value is accepted only when it is http or https, the host is 127.0.0.1,
// localhost, or ::1, and it carries no userinfo, query, fragment, or path.
// Non-loopback values are refused by callers. They are never fetched.

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function loopbackHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  if (url.pathname !== '/' && url.pathname !== '') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

// The Warden's origin is stricter (security review, 3 October 2026): http on 127.0.0.1 only.
// "localhost" can resolve to [::1], where a different process can hold the same port number, and
// the Warden binds 127.0.0.1 (warden/README.md). The OmniParser URL keeps loopbackHttpUrl().
export function wardenOriginUrl(value) {
  if (!loopbackHttpUrl(value)) return false;
  const url = new URL(value.trim());
  return url.protocol === 'http:' && url.hostname === '127.0.0.1';
}

// An origin saved before 3 October 2026 may be http://localhost:<port>, which the Warden origin no
// longer accepts. It names the same Warden, so it is rewritten to http://127.0.0.1:<port> rather
// than leaving every call refused (code review, 3 October 2026). Anything else is returned as is.
export function migrateWardenOrigin(value) {
  if (typeof value !== 'string' || !loopbackHttpUrl(value)) return value;
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' || url.hostname !== 'localhost') return value;
  return `http://127.0.0.1${url.port ? `:${url.port}` : ''}`;
}

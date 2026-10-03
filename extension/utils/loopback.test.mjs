import assert from 'node:assert/strict';
import test from 'node:test';

import { loopbackHttpUrl } from './loopback.js';

test('accepts loopback http(s) origins', () => {
  assert.equal(loopbackHttpUrl('http://127.0.0.1:8756'), true);
  assert.equal(loopbackHttpUrl('http://localhost:8756'), true);
  assert.equal(loopbackHttpUrl('http://localhost:7860'), true);
  assert.equal(loopbackHttpUrl('http://[::1]:8756'), true);
  assert.equal(loopbackHttpUrl('https://127.0.0.1:8756/'), true);
});

test('refuses non-loopback and decorated URLs', () => {
  assert.equal(loopbackHttpUrl('http://10.0.0.8:8756'), false);
  assert.equal(loopbackHttpUrl('https://example.com'), false);
  assert.equal(loopbackHttpUrl('http://127.0.0.1.evil.com:8756'), false);
  assert.equal(loopbackHttpUrl('http://user:pass@127.0.0.1:8756'), false);
  assert.equal(loopbackHttpUrl('http://127.0.0.1:8756/warden'), false);
  assert.equal(loopbackHttpUrl('http://127.0.0.1:8756?x=1'), false);
  assert.equal(loopbackHttpUrl('file:///tmp/warden'), false);
  assert.equal(loopbackHttpUrl(''), false);
  assert.equal(loopbackHttpUrl(null), false);
});

// Security review, 3 October 2026: the Warden origin is http://127.0.0.1 only. "localhost" can
// resolve to [::1], where a different process (a relay) can hold the same port number.
test('the Warden origin is http on 127.0.0.1 only', async () => {
  const { wardenOriginUrl } = await import('./loopback.js');
  assert.equal(wardenOriginUrl('http://127.0.0.1:8756'), true);
  assert.equal(wardenOriginUrl('http://127.0.0.1:9000/'), true);
  for (const value of ['http://localhost:8756', 'http://[::1]:8756', 'https://127.0.0.1:8756', 'http://127.0.0.2:8756', 'http://10.0.0.8:8756', 'http://127.0.0.1:8756/x', '', null]) {
    assert.equal(wardenOriginUrl(value), false, String(value));
  }
});

// Code review, 3 October 2026: an origin saved as http://localhost:<port> before the 127.0.0.1-only
// rule is the same Warden, so it is rewritten rather than left refused on every call.
test('a saved localhost Warden origin migrates to 127.0.0.1 on the same port; nothing else changes', async () => {
  const { migrateWardenOrigin, wardenOriginUrl } = await import('./loopback.js');
  assert.equal(migrateWardenOrigin('http://localhost:8756'), 'http://127.0.0.1:8756');
  assert.equal(migrateWardenOrigin('http://localhost:9000/'), 'http://127.0.0.1:9000');
  assert.equal(wardenOriginUrl(migrateWardenOrigin('http://localhost:8756')), true);
  for (const value of ['http://127.0.0.1:8756', 'http://[::1]:8756', 'https://localhost:8756', 'http://evil.example:8756', '', null]) {
    assert.equal(migrateWardenOrigin(value), value, String(value));
  }
});

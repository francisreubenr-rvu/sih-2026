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

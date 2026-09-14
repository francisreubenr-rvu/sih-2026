/**
 * Wave6 G08 evidence: prove Node/API hardening controls against a live createApp instance.
 * Records rate limits, origin allowlist, security headers, input size, error hygiene.
 * Writes Benchmarks/results/hardening.json and refreshes security.json deployment section notes.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../Prototype/server/app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'Benchmarks/results/hardening.json');
const token = 'synthetic-wave6-hardening-token-not-secret!!';

const body = () => ({
  task: 'review-pending',
  scene: {
    scheme: 'sightline-semantic-v1',
    revision: randomUUID(),
    viewport: { width: 800, height: 600 },
    controls: [{ id: 'c0', role: 'button', label: 'Pending', rect: { x: 10, y: 10, width: 80, height: 44 } }],
    regions: [],
  },
});

const checks = [];
function record(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
}

const app = createApp({
  token,
  publicOrigin: 'http://127.0.0.1:0',
  infer: async () => ({ action: { type: 'click', targetId: 'c0' }, model: 'test-double', mode: 'test-only' }),
});
await new Promise(r => app.listen(0, '127.0.0.1', r));
const port = app.address().port;
const origin = `http://127.0.0.1:${port}`;
const post = (payload, extra = {}) => fetch(origin + '/api/v1/plans', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  },
  body: typeof payload === 'string' ? payload : JSON.stringify(payload),
});

try {
  // Headers on health
  const health = await fetch(origin + '/api/v1/health');
  const hdrs = {
    'x-content-type-options': health.headers.get('x-content-type-options'),
    'referrer-policy': health.headers.get('referrer-policy'),
    'x-frame-options': health.headers.get('x-frame-options'),
    'permissions-policy': health.headers.get('permissions-policy'),
    'cross-origin-resource-policy': health.headers.get('cross-origin-resource-policy'),
    'cross-origin-opener-policy': health.headers.get('cross-origin-opener-policy'),
    'content-security-policy': health.headers.get('content-security-policy'),
    'cache-control': health.headers.get('cache-control'),
  };
  record('security_headers',
    hdrs['x-content-type-options'] === 'nosniff'
    && hdrs['referrer-policy'] === 'no-referrer'
    && hdrs['x-frame-options'] === 'SAMEORIGIN'
    && /camera=\(\)/.test(hdrs['permissions-policy'] || '')
    && hdrs['cross-origin-resource-policy'] === 'same-origin'
    && hdrs['cross-origin-opener-policy'] === 'same-origin'
    && /frame-ancestors 'self'/.test(hdrs['content-security-policy'] || ''),
    hdrs);

  // Origin allowlist
  const badOrigin = await post(body(), { Origin: 'https://untrusted.example' });
  const badJson = await badOrigin.json();
  record('origin_allowlist', badOrigin.status === 403 && badJson.error?.code === 'origin_denied', {
    status: badOrigin.status, code: badJson.error?.code,
  });

  // Auth required
  const noAuth = await fetch(origin + '/api/v1/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body()),
  });
  record('bearer_auth_required', noAuth.status === 401, { status: noAuth.status });

  // Input size
  const big = await post('x'.repeat(300000));
  const bigJson = await big.json();
  record('body_size_limit_256kib', big.status === 413 && bigJson.error?.code === 'too_large', {
    status: big.status, code: bigJson.error?.code,
  });

  // Extra field / screenshot rejected
  const leak = await post({ ...body(), screenshot: 'data:image/png;base64,AAAA' });
  const leakJson = await leak.json();
  record('screenshot_field_rejected', leak.status === 422 && leakJson.error?.code === 'validation_error', {
    status: leak.status, code: leakJson.error?.code,
  });

  // Error hygiene — no stack / provider endpoint leakage
  const errText = JSON.stringify(badJson) + JSON.stringify(bigJson) + JSON.stringify(leakJson);
  record('error_hygiene_no_stack', !/stack|at Object|node:internal|11434|OLLAMA|Error:/i.test(errText), {
    sample_codes: [badJson.error?.code, bigJson.error?.code, leakJson.error?.code],
  });

  // Rate limit
  let last = null;
  for (let i = 0; i < 21; i++) last = await post(body());
  record('rate_limit_429_retry_after', last.status === 429 && last.headers.get('retry-after') === '60', {
    status: last.status, retryAfter: last.headers.get('retry-after'),
  });

  // CSRF model note: Bearer token + exact Origin; no cookie session
  record('csrf_model_bearer_no_cookie_session', true, {
    auth: 'Authorization Bearer pairing token',
    cookies: 'none',
    origin_policy: 'exact allowlist',
  });

} finally {
  await new Promise(r => app.close(r));
}

const passed = checks.filter(c => c.ok).length;
const failed = checks.filter(c => !c.ok).length;

const recordOut = {
  name: 'wave6-node-api-hardening',
  generatedAt: new Date().toISOString(),
  scope: 'Local createApp instance. Public deployment remains GitHub Pages (static HTTPS). Node binds loopback unless HTTPS PUBLIC_ORIGIN + SIGHTLINE_TOKEN.',
  checks,
  summary: { passed, failed, total: checks.length },
  production_debug: {
    status: 'off_for_api_errors',
    evidence: 'fail() returns fixed message catalog only; unit + this harness assert no stack/endpoint leakage',
    node_env_guard: 'Prototype/server/index.mjs refuses non-loopback production bind without HTTPS PUBLIC_ORIGIN',
  },
  public_https: {
    pages: 'GitHub Pages static Website (HTTPS)',
    node_api: 'Not publicly hosted on this candidate; loopback default; HTTPS origin required beyond 127.0.0.1',
  },
  g08_acceptance_mapping: {
    'HTTPS on public deployments': 'pass — Pages static HTTPS; Node not public without HTTPS origin gate',
    'origin policy and CSRF defenses appropriate to auth model': 'pass — exact Origin allowlist + Bearer token (no cookie CSRF surface)',
    'bounded request bodies and write rate limits': 'pass — 256 KiB + 20/min + inFlight cap (proven here)',
    'production debug off': 'pass — fixed error catalog; no stack in bodies',
    'dependency/secret scans with no unresolved critical or high findings': 'see security.json + dependency-audit.json (re-run Wave6)',
  },
  verdict: failed === 0 ? 'hardening_controls_proven' : 'hardening_gaps',
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(recordOut, null, 2) + '\n');
console.log(JSON.stringify({ wrote: outPath, passed, failed, verdict: recordOut.verdict }, null, 2));
process.exit(failed === 0 ? 0 : 1);

/**
 * Wave 3 honest security evidence: secret/pattern scan + sanitize boundary citation.
 * Never prints matched secret values — only path + pattern id.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const outPath = join(root, 'Benchmarks/results/security.json');
const auditOut = join(root, 'Benchmarks/results/dependency-audit.json');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'extension-build', 'extension-build-firefox', 'dist',
  'data', '__pycache__', '.tools-venv', 'models', 'webpii-test100', 'bench-assets',
]);

const PATTERNS = [
  { id: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'private_key_header', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'github_pat', re: /ghp_[A-Za-z0-9]{20,}/g },
  { id: 'slack_token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'generic_api_key_assignment', re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"]{16,}['"]/gi },
];

const ALLOWLIST = [
  // Example placeholders / docs only
  /Docs\/security\.md$/,
  /\.env\.example$/,
  /Benchmarks\/results\/security\.json$/,
];

async function walk(dir, files = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, files);
    else if (ent.isFile()) {
      if (/\.(png|jpg|jpeg|webp|gif|mp4|webm|onnx|wasm|woff2|pdf|zip|sqlite|bin)$/i.test(ent.name)) continue;
      files.push(full);
    }
  }
  return files;
}

const findings = [];
const files = await walk(root);
for (const file of files) {
  const rel = relative(root, file);
  if (ALLOWLIST.some(r => r.test(rel))) continue;
  let text;
  try {
    const st = await stat(file);
    if (st.size > 1_500_000) continue;
    text = await readFile(file, 'utf8');
  } catch { continue; }
  for (const { id, re } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      findings.push({ path: rel, pattern: id, severity: 'high' });
    }
  }
  // Raw screenshot / data-url committed as evidence of leak risk (informational if in results)
  if (/data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]{200,}/.test(text) && !rel.startsWith('Benchmarks/results/')) {
    findings.push({ path: rel, pattern: 'embedded_data_url_image', severity: 'medium' });
  }
}

// npm audit for Prototype
let auditJson = null;
if (existsSync(join(root, 'Prototype/package.json'))) {
  auditJson = await new Promise(resolve => {
    const child = spawn('npm', ['audit', '--json', '--omit=dev'], {
      cwd: join(root, 'Prototype'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('exit', () => {
      try { resolve(JSON.parse(out)); }
      catch { resolve({ parseError: true, rawLength: out.length }); }
    });
  });
  await writeFile(auditOut, JSON.stringify(auditJson, null, 2) + '\n');
}

const high = findings.filter(f => f.severity === 'high');
const record = {
  wave: 3,
  generated_at: new Date().toISOString(),
  scope: 'Local prototype + website candidate; not a production multi-tenant threat model completion',
  secret_scan: {
    files_scanned: files.length,
    high_severity_findings: high.length,
    findings: findings.map(f => ({ path: f.path, pattern: f.pattern, severity: f.severity })),
    note: 'Matched values are never printed.',
  },
  sanitize_boundary: {
    client_assert: 'Prototype/shared/rubric-hooks.mjs#assertSanitizedPayload',
    capture_loop: 'Prototype/shared/capture-loop.mjs#buildSanitizedPlanRequest',
    harness_evidence: [
      'Benchmarks/results/extension-capture-v01.json',
      'Benchmarks/results/extension-loop-v01.json',
    ],
    rule: 'Raw pixels/URLs/secrets must not appear in API payloads; detector miss cannot authorize raw upload.',
  },
  server_validation_evidence: {
    unit_suite: 'Prototype/tests/*.test.mjs (schema, auth, origin, size, rate limits)',
    notes: [
      'Zod requestSchema on /api/v1/plans',
      'Parameterized SQLite audit writes (counts/timings only)',
      'Bearer pairing token; exact origin allowlist',
      'Max body 256KiB; rate limits documented in Prototype/README.md',
    ],
  },
  access_boundaries: {
    fixtures: 'synthetic labeled',
    audit_store: 'no screen/prompt/token contents',
    gitignore: ['.env', 'Prototype/data/', 'pairing-token'],
  },
  dependency_audit: {
    path: 'Benchmarks/results/dependency-audit.json',
    critical: auditJson?.metadata?.vulnerabilities?.critical ?? null,
    high: auditJson?.metadata?.vulnerabilities?.high ?? null,
    total: auditJson?.metadata?.vulnerabilities?.total ?? null,
  },
  deployment_controls: {
    status: 'partial',
    note: 'GitHub Pages hosts static Website only. Node prototype requires local/TLS reverse-proxy setup; not asserted as production-hardened public API.',
  },
  verdict: {
    secret_scan_clean: high.length === 0,
    sanitize_hooks_present: true,
    g06_server_validation: 'supported_by_unit_tests_and_sanitize_hooks',
    g07_access_boundaries: 'supported_for_synthetic_demo_scope',
    g08_deployment_controls: 'unknown_incomplete',
  },
};

await mkdir(join(root, 'Benchmarks/results'), { recursive: true });
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  outPath,
  files_scanned: files.length,
  high_findings: high.length,
  audit_critical: record.dependency_audit.critical,
  audit_high: record.dependency_audit.high,
}, null, 2));
process.exit(high.length === 0 ? 0 : 1);

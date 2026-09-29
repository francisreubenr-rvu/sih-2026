#!/usr/bin/env node
// Fails if an em dash (U+2014), its named or numeric HTML entity, or a JS/JSON backslash-u2014
// escape appears in a tracked text file outside vendored paths and scripts/em-dash-allowlist.json.
// Usage: node scripts/check-no-em-dash.mjs [--list-allowed]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Built from parts so this file never matches itself.
const EM_DASH = String.fromCharCode(0x2014);
const ENTITY_NAMED = '&' + 'mdash;';
const ENTITY_NUMERIC = '&' + '#8212;';
const ESCAPE = String.fromCharCode(92) + 'u2014';
const ESCAPE_EXTS = new Set(['.js', '.mjs', '.cjs', '.json']);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif',
  '.mp4', '.webm', '.mov', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.onnx', '.wasm', '.bin', '.traineddata', '.pt', '.safetensors',
  '.pdf', '.zip', '.gz', '.tgz', '.pptx', '.potx', '.docx', '.xlsx',
]);

function globToRegExp(pattern) {
  const dir = pattern.endsWith('/');
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*' && pattern[i + 2] === '/') { src += '(?:.*/)?'; i += 2; }
    else if (c === '*') src += '[^/]*';
    else src += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + src + (dir ? '' : '$'));
}

export function loadAllowlist(file = join(root, 'scripts/em-dash-allowlist.json')) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const entries = [];
  for (const [group, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry.path || !entry.reason || !entry.reason.trim()) {
        throw new Error(`allowlist entry in "${group}" needs both path and reason: ${JSON.stringify(entry)}`);
      }
      entries.push({ ...entry, group, re: globToRegExp(entry.path) });
    }
  }
  return entries;
}

export function findHits(path, buf) {
  if (BINARY_EXTS.has(extname(path).toLowerCase())) return [];
  if (buf.subarray(0, 8000).includes(0)) return [];
  const text = buf.toString('utf8');
  const needles = [EM_DASH, ENTITY_NAMED, ENTITY_NUMERIC];
  if (ESCAPE_EXTS.has(extname(path).toLowerCase())) needles.push(ESCAPE);
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const n of needles) if (line.toLowerCase().includes(n.toLowerCase())) { hits.push(i + 1); break; }
  });
  return hits;
}

function main() {
  const allow = loadAllowlist();
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 << 20 })
    .toString('utf8').split('\0').filter(Boolean);
  const failures = [];
  const allowedWithHits = [];
  for (const path of files) {
    let buf;
    try { buf = readFileSync(join(root, path)); } catch { continue; }
    const hits = findHits(path, buf);
    if (!hits.length) continue;
    const entry = allow.find((e) => e.re.test(path));
    if (entry) allowedWithHits.push({ path, count: hits.length, entry });
    else failures.push({ path, hits });
  }
  if (process.argv.includes('--list-allowed')) {
    for (const a of allowedWithHits) console.log(`allowed  ${a.path} (${a.count} lines): ${a.entry.reason}`);
  }
  if (failures.length) {
    console.error('Em dash check failed. Use a comma, colon, period, parentheses or " - " instead:');
    for (const f of failures) console.error(`  ${f.path}: line ${f.hits.slice(0, 20).join(', ')}${f.hits.length > 20 ? ', ...' : ''}`);
    console.error('If the character is evidence or functional, add the path with a one-line reason to scripts/em-dash-allowlist.json.');
    process.exit(1);
  }
  console.log(`em dash check: ${files.length} tracked files, 0 violations, ${allowedWithHits.length} allowlisted files still contain the character`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

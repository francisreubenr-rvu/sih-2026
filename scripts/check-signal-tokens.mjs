#!/usr/bin/env node
// Signal design tokens: every surface must carry the canonical block from
// design/signal-tokens.css verbatim, and every text/ground pair must meet WCAG AA.
// Exit 1 on drift or a contrast failure.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = 'design/signal-tokens.css';
export const SURFACES = [
  'extension/signal.css',
  'Prototype/app/signal.css',
  'Prototype/extension/signal.css',
];

const START = '/* signal:tokens:start */';
const END = '/* signal:tokens:end */';

export function tokenBlock(css, name) {
  const a = css.indexOf(START);
  const b = css.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${name}: missing signal token markers`);
  return css.slice(a, b + END.length);
}

export function parseTokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum]: body text 4.5, the on-glow button label 4.5.
export const PAIRS = [
  ...['sg-text', 'sg-text-2', 'sg-text-3', 'sg-glow-text', 'sg-scan', 'sg-ask', 'sg-stop']
    .flatMap((fg) => ['sg-void', 'sg-panel', 'sg-panel-2'].map((bg) => [fg, bg, 4.5])),
  ['sg-on-glow', 'sg-glow', 4.5],
  // Each semantic hue on its own tint (chips, cards), and control outlines at the 3:1 that
  // WCAG 1.4.11 asks of a UI component boundary.
  ['sg-glow-text', 'sg-glow-tint', 4.5],
  ['sg-scan', 'sg-scan-tint', 4.5],
  ['sg-ask', 'sg-ask-tint', 4.5],
  ['sg-stop', 'sg-stop-tint', 4.5],
  ['sg-text', 'sg-glow-tint', 4.5],
  ['sg-line-strong', 'sg-panel', 3],
  ['sg-line-strong', 'sg-void', 3],
];

// Light only (Francis, 29 September 2026): every ground token must be light. Relative
// luminance above 0.8 keeps a "ground" from drifting into a mid or dark surface.
export const GROUNDS = ['sg-void', 'sg-panel', 'sg-panel-2', 'sg-glow-tint', 'sg-scan-tint', 'sg-ask-tint', 'sg-stop-tint'];

export async function check() {
  const problems = [];
  const canonical = tokenBlock(await readFile(join(root, CANONICAL), 'utf8'), CANONICAL);
  for (const surface of SURFACES) {
    let css;
    try { css = await readFile(join(root, surface), 'utf8'); } catch { problems.push(`${surface}: missing`); continue; }
    try {
      if (tokenBlock(css, surface) !== canonical) problems.push(`${surface}: token block differs from ${CANONICAL}`);
    } catch (error) { problems.push(error.message); }
  }
  const tokens = parseTokens(canonical);
  const ratios = PAIRS.map(([fg, bg, min]) => {
    const ratio = contrast(tokens[fg], tokens[bg]);
    if (ratio < min) problems.push(`contrast ${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
    return { fg, bg, ratio: Math.round(ratio * 100) / 100 };
  });
  for (const g of GROUNDS) {
    if (!tokens[g]) { problems.push(`missing ground token ${g}`); continue; }
    if (luminance(tokens[g]) < 0.8) problems.push(`ground ${g} ${tokens[g]} is not light (luminance ${luminance(tokens[g]).toFixed(2)} < 0.8)`);
  }
  if (!/color-scheme:\s*light/.test(canonical)) problems.push('token block must declare color-scheme:light');
  return { problems, ratios };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, ratios } = await check();
  const worst = ratios.reduce((w, r) => (r.ratio < w.ratio ? r : w));
  console.log(`signal tokens: ${SURFACES.length} surfaces, ${ratios.length} contrast pairs, lowest ${worst.fg} on ${worst.bg} = ${worst.ratio}`);
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(problems.length ? 1 : 0);
}

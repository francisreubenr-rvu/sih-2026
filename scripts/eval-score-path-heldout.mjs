#!/usr/bin/env node
/**
 * Score path → held-out fixture bridge.
 * Writes local risk bands only. Never invents WebPII or officialScore.
 *
 * Usage: node scripts/eval-score-path-heldout.mjs [--json outfile]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreHeldOutFixtureDocument } from '../Prototype/shared/score-path.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRel = 'Benchmarks/datasets/wave6-heldout-pii-fixtures.json';
const fixturePath = join(root, fixtureRel);
const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const jsonOut = jsonFlag >= 0
  ? argv[jsonFlag + 1]
  : join(root, 'Benchmarks/results/score-path-heldout-v01.json');

const doc = JSON.parse(await readFile(fixturePath, 'utf8'));
const bridged = scoreHeldOutFixtureDocument(doc, { sourcePath: fixtureRel });
const record = {
  ...bridged,
  generatedAt: new Date().toISOString(),
  purpose: 'Wire Score-path local risk to held-out synthetic fixtures without inventing WebPII/officialScore',
};

await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, JSON.stringify(record, null, 2));
console.log(`Wrote ${jsonOut}`);
console.log(`cases=${record.caseCount} bands=${JSON.stringify(record.bandCounts)} officialScore=${record.officialScore} webPiiScore=${record.webPiiScore}`);
const corr = record.gtKindBandCorrelation;
if (corr) {
  console.log(`gtKindCorrelation kinds=${Object.keys(corr.byGroundTruthKind || {}).join(',')} monotonicShare=${corr.gtCountVsPointsMonotonicShare}`);
}

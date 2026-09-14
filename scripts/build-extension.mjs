import { build } from '../Prototype/node_modules/esbuild/lib/main.js';
import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('../Prototype/', import.meta.url);
const repo = new URL('../', import.meta.url);
const out = new URL('extension-build/', root);

await rm(out, { recursive: true, force: true }).catch(() => {});
await mkdir(out, { recursive: true });
for (const name of ['manifest.json', 'popup.html', 'popup.css']) {
  await copyFile(new URL(`extension/${name}`, root), new URL(name, out));
}
await cp(new URL('extension/icons/', root), new URL('icons/', out), { recursive: true });
for (const [source, dest, format] of [
  ['popup.mjs', 'popup.js', 'esm'],
  ['content.mjs', 'content.js', 'iife'],
]) {
  await build({
    entryPoints: [fileURLToPath(new URL(`extension/${source}`, root))],
    bundle: true,
    format,
    platform: 'browser',
    outfile: fileURLToPath(new URL(dest, out)),
    minify: true,
    legalComments: 'eof',
  });
}
// Extension needs UltraFace + ORT WASM only — never ship local OCR/PII lab weights in the MV3 zip.
await mkdir(new URL('models/', out), { recursive: true });
await mkdir(new URL('models/ort/', out), { recursive: true });
for (const name of [
  'ultraface-rfb320.onnx',
  'manifest.json',
  'ORT-LICENSE.txt',
  'ORT-README.md',
  'ULTRAFACE-LICENSE.txt',
]) {
  await copyFile(new URL(`models/${name}`, root), new URL(`models/${name}`, out));
}
for (const name of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  const src = new URL(`models/ort/${name}`, root);
  try { await copyFile(src, new URL(`models/ort/${name}`, out)); }
  catch { /* optional sibling */ }
}
// Copy any additional ORT runtime files referenced by the detector without OCR/PII trees.
{
  const { readdir } = await import('node:fs/promises');
  const ortDir = fileURLToPath(new URL('models/ort/', root));
  for (const ent of await readdir(ortDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    await copyFile(new URL(`models/ort/${ent.name}`, root), new URL(`models/ort/${ent.name}`, out));
  }
}

const manifest = JSON.parse(await readFile(new URL('manifest.json', out), 'utf8'));
manifest.browser_specific_settings = {
  gecko: { id: 'sightline-sih26171@rvu.example', strict_min_version: '128.0' },
};
await writeFile(new URL('manifest.firefox.json', out), JSON.stringify(manifest, null, 2));

const firefoxOut = new URL('extension-build-firefox/', root);
await rm(firefoxOut, { recursive: true, force: true }).catch(() => {});
await cp(out, firefoxOut, { recursive: true });
await copyFile(new URL('manifest.firefox.json', out), new URL('manifest.json', firefoxOut));
await writeFile(
  new URL('FIREFOX-README.txt', firefoxOut),
  [
    'Sightline Firefox unpacked package (SIH26171)',
    '',
    '1. about:debugging → This Firefox → Load Temporary Add-on',
    '2. Select manifest.json in this directory',
    '3. Live validation on this build host may still be unverified if Firefox is absent.',
    '4. Chrome uses ../extension-build/ with the Chromium manifest.',
    '',
  ].join('\n')
);

async function zipDirPy(sourceDir, zipPath) {
  await mkdir(dirname(zipPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c',
      'import sys\nfrom pathlib import Path\nfrom zipfile import ZipFile, ZIP_DEFLATED\nsrc=Path(sys.argv[1]); dst=Path(sys.argv[2]); dst.parent.mkdir(parents=True, exist_ok=True)\nwith ZipFile(dst,\"w\",ZIP_DEFLATED) as z:\n  for p in src.rglob(\"*\"):\n    if p.is_file(): z.write(p, p.relative_to(src).as_posix())\nprint(dst, dst.stat().st_size)\n',
      sourceDir, zipPath], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`zip python exit ${code}`))));
  });
}

const docsZip = fileURLToPath(new URL('Docs/sightline-extension-v01.zip', repo));
const webZip = fileURLToPath(new URL('Website/downloads/sightline-extension-v01.zip', repo));
const wave3Zip = fileURLToPath(new URL('Docs/sightline-extension-wave3.zip', repo));
const firefoxZip = fileURLToPath(new URL('Docs/sightline-extension-firefox-wave3.zip', repo));
const outAbs = fileURLToPath(out);

await zipDirPy(outAbs, docsZip);
await zipDirPy(outAbs, webZip);
await zipDirPy(outAbs, wave3Zip);
await zipDirPy(fileURLToPath(firefoxOut), firefoxZip);

console.log('Built Prototype/extension-build (Chrome) and extension-build-firefox.');
console.log('Zips:', docsZip, webZip, wave3Zip, firefoxZip);
console.log('Version', manifest.version);

import { build } from '../Prototype/node_modules/esbuild/lib/main.js';
import { mkdir, copyFile, cp, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('../Prototype/', import.meta.url);
const repo = new URL('../', import.meta.url);
const out = new URL('extension-build/', root);
const staging = new URL('extension-build.staging/', root);
const firefoxOut = new URL('extension-build-firefox/', root);
const firefoxStaging = new URL('extension-build-firefox.staging/', root);

/**
 * Build into a staging directory, then rename into place.
 * Avoids `rm -rf` of the live `extension-build/` tree while Chrome still has the
 * unpacked extension open (DBG-001 H2). Prefer: Remove extension → rebuild →
 * Load unpacked before Capture (see RELOAD-AFTER-REBUILD.txt and demo protocol).
 */
async function atomicReplace(fromUrl, toUrl) {
  const from = fileURLToPath(fromUrl);
  const to = fileURLToPath(toUrl);
  const prev = `${to.replace(/\/$/, '')}.prev`;
  await rm(prev, { recursive: true, force: true }).catch(() => {});
  try {
    await rename(to, prev);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  await rename(from, to);
  // Best-effort: old tree may still be held open by Chrome; ignore EBUSY/ENOTEMPTY.
  await rm(prev, { recursive: true, force: true }).catch(() => {});
}

async function populateExtensionTree(dest) {
  for (const name of ['manifest.json', 'popup.html', 'popup.css']) {
    await copyFile(new URL(`extension/${name}`, root), new URL(name, dest));
  }
  await cp(new URL('extension/icons/', root), new URL('icons/', dest), { recursive: true });
  for (const [source, destName, format] of [
    ['popup.mjs', 'popup.js', 'esm'],
    ['content.mjs', 'content.js', 'iife'],
  ]) {
    await build({
      entryPoints: [fileURLToPath(new URL(`extension/${source}`, root))],
      bundle: true,
      format,
      platform: 'browser',
      outfile: fileURLToPath(new URL(destName, dest)),
      minify: true,
      legalComments: 'eof',
    });
  }
  // Module Worker hosts ORT/WASM away from the MV3 popup process (DBG-001 H1).
  await build({
    entryPoints: [fileURLToPath(new URL('shared/vision-worker.mjs', root))],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: fileURLToPath(new URL('vision-worker.js', dest)),
    minify: true,
    legalComments: 'eof',
  });
  // Extension needs UltraFace + ORT WASM only — never ship local OCR/PII lab weights in the MV3 zip.
  await mkdir(new URL('models/', dest), { recursive: true });
  await mkdir(new URL('models/ort/', dest), { recursive: true });
  for (const name of [
    'ultraface-rfb320.onnx',
    'manifest.json',
    'ORT-LICENSE.txt',
    'ORT-README.md',
    'ULTRAFACE-LICENSE.txt',
  ]) {
    await copyFile(new URL(`models/${name}`, root), new URL(`models/${name}`, dest));
  }
  for (const name of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
    const src = new URL(`models/ort/${name}`, root);
    try { await copyFile(src, new URL(`models/ort/${name}`, dest)); }
    catch { /* optional sibling */ }
  }
  // Copy any additional ORT runtime files referenced by the detector without OCR/PII trees.
  {
    const { readdir } = await import('node:fs/promises');
    const ortDir = fileURLToPath(new URL('models/ort/', root));
    for (const ent of await readdir(ortDir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      await copyFile(new URL(`models/ort/${ent.name}`, root), new URL(`models/ort/${ent.name}`, dest));
    }
  }

  await writeFile(
    new URL('RELOAD-AFTER-REBUILD.txt', dest),
    [
      'Dhristi extension rebuild note (DBG-001)',
      '',
      'After any branding or extension rebuild:',
      '  1. chrome://extensions → Remove Dhristi',
      '  2. Rebuild: cd Prototype && npm run build:extension',
      '  3. Load unpacked → Prototype/extension-build/',
      '  4. Pin toolbar → then Capture & protect',
      '',
      'Do not Capture against a half-replaced or mid-session rebuilt tree.',
      'This package includes vision-worker.js (ORT in a module Worker) and',
      "manifest CSP 'wasm-unsafe-eval' for WASM inference.",
      '',
    ].join('\n')
  );
}

await rm(staging, { recursive: true, force: true }).catch(() => {});
await mkdir(staging, { recursive: true });
await populateExtensionTree(staging);
await atomicReplace(staging, out);

const manifest = JSON.parse(await readFile(new URL('manifest.json', out), 'utf8'));
manifest.browser_specific_settings = {
  gecko: { id: 'dhristi-sih26171@rvu.example', strict_min_version: '128.0' },
};
await writeFile(new URL('manifest.firefox.json', out), JSON.stringify(manifest, null, 2));

await rm(firefoxStaging, { recursive: true, force: true }).catch(() => {});
await cp(out, firefoxStaging, { recursive: true });
await copyFile(new URL('manifest.firefox.json', out), new URL('manifest.json', firefoxStaging));
await writeFile(
  new URL('FIREFOX-README.txt', firefoxStaging),
  [
    'Dhristi Firefox unpacked package (SIH26171)',
    '',
    '1. about:debugging → This Firefox → Load Temporary Add-on',
    '2. Select manifest.json in this directory',
    '3. Live validation on this build host may still be unverified if Firefox is absent.',
    '4. Chrome uses ../extension-build/ with the Chromium manifest.',
    '5. After rebuild: remove the temporary add-on, rebuild, then Load Temporary Add-on again before Capture.',
    '',
  ].join('\n')
);
await atomicReplace(firefoxStaging, firefoxOut);

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

const docsZip = fileURLToPath(new URL('Docs/dhristi-extension-v01.zip', repo));
const webZip = fileURLToPath(new URL('Website/downloads/dhristi-extension-v01.zip', repo));
const wave3Zip = fileURLToPath(new URL('Docs/dhristi-extension-wave3.zip', repo));
const firefoxZip = fileURLToPath(new URL('Docs/dhristi-extension-firefox-wave3.zip', repo));
const outAbs = fileURLToPath(out);

await zipDirPy(outAbs, docsZip);
await zipDirPy(outAbs, webZip);
await zipDirPy(outAbs, wave3Zip);
await zipDirPy(fileURLToPath(firefoxOut), firefoxZip);

console.log('Built Prototype/extension-build (Chrome) and extension-build-firefox.');
console.log('Zips:', docsZip, webZip, wave3Zip, firefoxZip);
console.log('Version', manifest.version);
console.log('After branding rebuild: Remove extension → rebuild → Load unpacked before Capture.');

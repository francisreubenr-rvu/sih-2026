import { fileURLToPath } from 'node:url';
import { build } from '../Prototype/node_modules/esbuild/lib/main.js';
import { mkdir,copyFile,readdir } from 'node:fs/promises';
const root=new URL('../Prototype/',import.meta.url);
await mkdir(new URL('dist/',root),{recursive:true});
await mkdir(new URL('models/ort/',root),{recursive:true});
for(const file of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']) await copyFile(new URL(`node_modules/onnxruntime-web/dist/${file}`,root),new URL(`models/ort/${file}`,root));
await copyFile(new URL('node_modules/onnxruntime-web/README.md',root),new URL('models/ORT-README.md',root));
await build({entryPoints:[fileURLToPath(new URL('app/main.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/app.js',root)),minify:true,legalComments:'eof'});
await build({entryPoints:[fileURLToPath(new URL('app/validation.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/validation.js',root)),minify:true,legalComments:'eof'});
await build({entryPoints:[fileURLToPath(new URL('app/benchmark.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/benchmark.js',root)),minify:true,legalComments:'eof'});
await build({entryPoints:[fileURLToPath(new URL('shared/vision-worker.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/vision-worker.js',root)),minify:true,legalComments:'eof'});

await mkdir(new URL('models/ocr/core/',root),{recursive:true});
for(const file of await readdir(new URL('node_modules/tesseract.js-core/',root))) {
 if(/^tesseract-core.*\.(js|wasm)$/.test(file)) await copyFile(new URL(`node_modules/tesseract.js-core/${file}`,root),new URL(`models/ocr/core/${file}`,root));
}
await copyFile(new URL('node_modules/tesseract.js/dist/worker.min.js',root),new URL('models/ocr/worker.min.js',root));
await copyFile(new URL('node_modules/tesseract.js/LICENSE.md',root),new URL('models/ocr/TESSERACT-LICENSE',root));
await copyFile(new URL('node_modules/tesseract.js-core/LICENSE',root),new URL('models/ocr/core/LICENSE',root));
await build({entryPoints:[fileURLToPath(new URL('app/text-preview.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/text-preview.js',root)),minify:true,legalComments:'eof',external:['/models/*']});
await copyFile(new URL('node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt',root),new URL('models/ocr/worker.min.js.LICENSE.txt',root));
await build({entryPoints:[fileURLToPath(new URL('app/task-loop.mjs',root))],bundle:true,format:'esm',platform:'browser',outfile:fileURLToPath(new URL('dist/task-loop.js',root)),minify:true,legalComments:'eof'});

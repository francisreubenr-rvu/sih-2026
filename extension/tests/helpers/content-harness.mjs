// Real-Chromium harness for extension/content.js.
//
// Serves the extension directory and per-test fixture pages from a loopback HTTP server, loads
// content.js into the page behind a minimal `chrome.runtime` shim, and drives it through the
// same onMessage listener the background worker uses (PAGE_SCAN, EXECUTE_ACTION).
//
// Scope: this runs content.js in the page's main world, not in an extension isolated world, so
// it exercises layout, visibility, hit-testing and click semantics in a real engine but does not
// exercise isolated-world separation. Iframes and shadow DOM are out of scope.

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = join(here, '..', '..');
const REPO_ROOT = join(EXTENSION_DIR, '..');

const CHROMIUM_CANDIDATES = [
  process.env.DHRISTI_CHROMIUM,
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChromium() {
  const found = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`No Chromium found. Set DHRISTI_CHROMIUM. Tried: ${CHROMIUM_CANDIDATES.join(', ')}`);
  }
  return found;
}

async function loadPlaywright() {
  const path = join(REPO_ROOT, 'Prototype', 'node_modules', 'playwright-core', 'index.mjs');
  if (!existsSync(path)) throw new Error('playwright-core missing: run `npm ci` in Prototype/ first.');
  return import(path);
}

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

export async function startHarness() {
  const pages = new Map();
  const posts = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST') {
      // Record form submissions so a test can prove whether a destructive form was sent.
      let body = '';
      for await (const chunk of req) body += chunk;
      posts.push({ path: url.pathname, body });
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>posted</title><p>posted</p>');
      return;
    }
    if (url.pathname.startsWith('/ext/')) {
      const rel = normalize(url.pathname.slice('/ext/'.length));
      if (rel.startsWith('..')) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(join(EXTENSION_DIR, rel));
        const ext = rel.slice(rel.lastIndexOf('.'));
        res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }
    const html = pages.get(url.pathname);
    if (html == null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
  const contentSource = await readFile(join(EXTENSION_DIR, 'content.js'), 'utf8');

  let pageSeq = 0;

  // Opens `html` at a fresh path with content.js loaded, and returns helpers bound to it.
  async function open(html, { width = 800, height = 600 } = {}) {
    pageSeq += 1;
    const path = `/fixture-${pageSeq}.html`;
    pages.set(path, html);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.addInitScript((extOrigin) => {
      window.chrome = {
        runtime: {
          id: 'dhristi-test',
          getURL: (p) => `${extOrigin}/ext/${p}`,
          onMessage: { addListener(fn) { window.__dhristiListener = fn; } },
        },
      };
    }, origin);
    await page.goto(`${origin}${path}`);
    await page.addScriptTag({ content: contentSource });

    async function send(message) {
      return page.evaluate((msg) => new Promise((resolve) => {
        const keepOpen = window.__dhristiListener(msg, { id: 'dhristi-test' }, resolve);
        if (keepOpen === false) setTimeout(() => resolve(undefined), 0);
      }), message);
    }

    return {
      page,
      send,
      scan: () => send({ type: 'PAGE_SCAN' }),
      // A click that navigates tears the page context down mid-reply; report that as navigated.
      execute: (action) => send({ type: 'EXECUTE_ACTION', action }).catch((error) => {
        if (/context was destroyed|navigat/i.test(error.message)) return { navigated: true };
        throw error;
      }),
      close: () => context.close(),
    };
  }

  async function close() {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { origin, open, posts, close };
}

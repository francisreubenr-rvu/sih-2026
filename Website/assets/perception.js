'use strict';
// Hero "lens": an original procedural image, drawn as 1-bit ordered-dither dots on a
// black field (Signal design system). No image asset and no network. One still frame
// under prefers-reduced-motion; otherwise ~20 fps, paused while offscreen or hidden.
(() => {
  const canvas = document.getElementById('perception-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELL = 5; // CSS px per dither cell
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  // Dot colours from the token set: text white at the core, glow-text and violet at the rim.
  const PALETTE = ['#ffffff', '#e4e7ff', '#b9c0ff', '#9d8bff'];

  // Deterministic scatter so the frame is identical on every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const motes = Array.from({ length: 140 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 0.5 + Math.pow(rand(), 0.7) * 0.55;
    return { a, r, s: 0.02 + rand() * 0.05, z: 0.4 + rand() * 0.6 };
  });

  let cols = 0; let rows = 0; let dpr = 1;
  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    cols = Math.floor(box.width / CELL);
    rows = Math.floor(box.height / CELL);
    return true;
  }

  function luminance(u, v, t) {
    const r = Math.hypot(u, v);
    const th = Math.atan2(v, u);
    let L = 0;
    // Outer halo ring and a soft sphere falloff.
    L += 1.15 * Math.exp(-(((r - 0.66) / 0.05) ** 2));
    L += 0.3 * Math.max(0, 1 - r / 0.95);
    // Iris: radial striations that turn slowly.
    if (r < 0.46) {
      const stria = 0.55 + 0.4 * Math.sin(14 * (th + t * 0.05) + 6 * r) * Math.sin(5 * th - t * 0.03);
      L = 0.2 + 0.95 * stria * (1 - r / 0.6);
    }
    // Pupil, with one specular highlight.
    if (r < 0.17) L = 0.02 + 0.5 * Math.exp(-(((r - 0.17) / 0.02) ** 2));
    L += 1.2 * Math.exp(-(((u + 0.07) ** 2 + (v + 0.1) ** 2) / 0.0016));
    // Two faint light streaks, like a lens flare.
    L += 0.18 * Math.exp(-(((v + u * 0.18) / 0.012) ** 2)) * Math.max(0, 1 - Math.abs(u) / 1.1);
    return L;
  }

  function frame(time) {
    const t = time / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cols * CELL + CELL, rows * CELL + CELL);
    const paths = PALETTE.map(() => new Path2D());
    const size = 3;
    for (let y = 0; y < rows; y += 1) {
      const v = (y / rows) * 2 - 1;
      for (let x = 0; x < cols; x += 1) {
        const u = (x / cols) * 2 - 1;
        const L = luminance(u, v, t);
        if (L <= BAYER[(y & 3) * 4 + (x & 3)]) continue;
        const r = Math.hypot(u, v);
        const bucket = r < 0.2 ? 0 : r < 0.5 ? 1 : r < 0.72 ? 2 : 3;
        paths[bucket].rect(x * CELL + 1, y * CELL + 1, size, size);
      }
    }
    // Drifting motes outside the lens, dithered as single cells.
    for (const m of motes) {
      const a = m.a + t * m.s;
      const x = Math.round(((Math.cos(a) * m.r + 1) / 2) * cols);
      const y = Math.round(((Math.sin(a) * m.r * 0.92 + 1) / 2) * rows);
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      paths[m.z > 0.8 ? 1 : 3].rect(x * CELL + 1, y * CELL + 1, size, size);
    }
    PALETTE.forEach((colour, i) => { ctx.fillStyle = colour; ctx.fill(paths[i]); });
  }

  let running = false; let last = 0; let visible = true;
  function loop(now) {
    if (!running) return;
    if (now - last > 50) { frame(now); last = now; }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    if (reduce) return;
    if (on && !running) { running = true; requestAnimationFrame(loop); } else if (!on) running = false;
  }

  // The CSS dot-field background stands in until the first frame, which is drawn when the
  // main thread is idle after load so the lens never competes with first paint or input.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  function start() {
    if (!resize()) return;
    canvas.style.background = 'none';
    frame(reduce ? 0 : performance.now());
    new ResizeObserver(() => { if (resize()) frame(reduce ? 0 : performance.now()); }).observe(canvas);
    if (!reduce) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; setRunning(visible && !document.hidden); }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
    }
  }
  const boot = () => idle(start, { timeout: 1500 });
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot, { once: true });
})();

import { SCHEME, SAFE_LABELS, sceneSchema } from './protocol.mjs';

export function clipRect(rect, viewport, padding = 0) {
  if (![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height, padding].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0 || padding < 0) return null;
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width + padding));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height + padding));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function classifySensitive(text) {
  // Detection is explanatory telemetry only. Unclassified text is ALSO excluded.
  // Indic / banking patterns widen local telemetry; they never authorize export.
  const found = [];
  if (!text || typeof text !== 'string') return found;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)) found.push('email');
  // Aadhaar: 12 digits, optional spaces/hyphens in 4-4-4 groups (synthetic fixtures only).
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(text)) found.push('aadhaar');
  // PAN: five letters, four digits, one letter (e.g. ABCDE1234F).
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/i.test(text)) found.push('pan');
  // IFSC: four letters + 0 + six alnum (e.g. SBIN0001234) — telemetry only.
  if (/\b[A-Z]{4}0[A-Z0-9]{6}\b/i.test(text)) found.push('ifsc');
  // EPIC / voter id style: three letters + seven digits (synthetic).
  if (/\b[A-Z]{3}\d{7}\b/i.test(text)) found.push('voter-id');
  // Card-like 13–19 digit runs (Luhn not required; telemetry / mosaic hint only).
  if (/\b(?:\d[ -]*?){13,19}\b/.test(text.replace(/\s+/g, ' '))) found.push('card-like');
  // GSTIN: 15-char Indian GST style — telemetry only.
  if (/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i.test(text)) found.push('gstin');
  // UPI VPA-like local@psp without a DNS TLD — telemetry only.
  if (/\b[\w.+-]{2,}@(?:upi|ybl|ibl|axl|paytm|okaxis|oksbi|okhdfcbank)\b/i.test(text)) found.push('upi-vpa');
  if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(text)) found.push('number');
  if (/\b(?:password|secret|token|account|address|passport|aadhaar|आधार|pan|पैन|ifsc|voter|otp|cvv|pin)\b/i.test(text)) found.push('sensitive-label');
  return found;
}

/**
 * Merge overlapping/nearby axis-aligned regions of the same kind.
 * Reduces mosaic over-paint when many small text boxes abut (utility ↑, coverage stable).
 */
export function mergeRegions(regions, { gap = 4, maxRegions = 200 } = {}) {
  if (!Array.isArray(regions)) throw new Error('Invalid regions');
  const byKind = new Map();
  for (const r of regions) {
    if (!r?.kind || !r.rect) continue;
    if (![r.rect.x, r.rect.y, r.rect.width, r.rect.height].every(Number.isFinite)) continue;
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind).push({ ...r.rect });
  }
  const out = [];
  for (const [kind, rects] of byKind) {
    const list = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const merged = [];
    for (const rect of list) {
      let hit = false;
      for (const m of merged) {
        const expands =
          rect.x <= m.x + m.width + gap &&
          rect.x + rect.width + gap >= m.x &&
          rect.y <= m.y + m.height + gap &&
          rect.y + rect.height + gap >= m.y;
        if (expands) {
          const x2 = Math.max(m.x + m.width, rect.x + rect.width);
          const y2 = Math.max(m.y + m.height, rect.y + rect.height);
          m.x = Math.min(m.x, rect.x);
          m.y = Math.min(m.y, rect.y);
          m.width = x2 - m.x;
          m.height = y2 - m.y;
          hit = true;
          break;
        }
      }
      if (!hit) merged.push({ ...rect });
    }
    for (const rect of merged) {
      if (out.length >= maxRegions) return out;
      out.push({ kind, rect });
    }
  }
  return out;
}

export function makeScene({ revision, viewport, controls, regions }) {
  // Reconstruct each field: no spread from page-derived objects, no arbitrary text.
  return sceneSchema.parse({scheme:SCHEME, revision,
    viewport:{width:viewport.width,height:viewport.height},
    controls:controls.map(c => ({id:c.id,role:c.role,label:c.label,rect:clipRect(c.rect,viewport)})).filter(c=>c.rect && SAFE_LABELS.includes(c.label)),
    regions:regions.map(r=>({kind:r.kind,rect:clipRect(r.rect,viewport,2)})).filter(r=>r.rect)
  });
}

export function paintScene(ctx, input) {
  const scene = sceneSchema.parse(input);
  ctx.canvas.width = scene.viewport.width; ctx.canvas.height = scene.viewport.height;
  ctx.fillStyle = '#f1f2ee'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  for (const {rect:r,kind} of scene.regions) {
    ctx.fillStyle = kind === 'face' ? '#414b44' : kind === 'password' ? '#5a4038' : '#c5cbc6';
    ctx.fillRect(r.x,r.y,r.width,r.height);
  }
  ctx.textBaseline = 'middle'; ctx.font = '14px sans-serif';
  for (const c of scene.controls) {
    const r = c.rect;
    ctx.fillStyle='#ffffff';ctx.fillRect(r.x,r.y,r.width,r.height);
    ctx.strokeStyle='#29473f';ctx.strokeRect(r.x+.5,r.y+.5,Math.max(0,r.width-1),Math.max(0,r.height-1));
    ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.width,r.height);ctx.clip();
    ctx.fillStyle='#15211f';ctx.fillText(`${c.id} ${c.label}`,r.x+6,r.y+r.height/2);ctx.restore();
  }
  return ctx.canvas;
}

export function sceneToSvg(input) {
  const scene = sceneSchema.parse(input);
  const block = scene.regions.map(({rect:r,kind})=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${kind==='face'?'#414b44':kind==='password'?'#5a4038':'#c5cbc6'}"/>`).join('');
  const controls = scene.controls.map(c=>`<g><rect x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.width}" height="${c.rect.height}" fill="white" stroke="#29473f"/><text x="${c.rect.x+6}" y="${c.rect.y+c.rect.height/2}" font-family="sans-serif" font-size="14" dominant-baseline="middle">${c.id} ${c.label}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.viewport.width}" height="${scene.viewport.height}"><rect width="100%" height="100%" fill="#f1f2ee"/>${block}${controls}</svg>`;
}

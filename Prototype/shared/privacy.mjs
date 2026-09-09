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
  const found = [];
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)) found.push('email');
  if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(text)) found.push('number');
  if (/\b(?:password|secret|token|account|address|passport|aadhaar|pan)\b/i.test(text)) found.push('sensitive-label');
  return found;
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
    ctx.fillStyle = kind === 'face' ? '#414b44' : '#c5cbc6';
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
  const block = scene.regions.map(({rect:r,kind})=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${kind==='face'?'#414b44':'#c5cbc6'}"/>`).join('');
  const controls = scene.controls.map(c=>`<g><rect x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.width}" height="${c.rect.height}" fill="white" stroke="#29473f"/><text x="${c.rect.x+6}" y="${c.rect.y+c.rect.height/2}" font-family="sans-serif" font-size="14" dominant-baseline="middle">${c.id} ${c.label}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.viewport.width}" height="${scene.viewport.height}"><rect width="100%" height="100%" fill="#f1f2ee"/>${block}${controls}</svg>`;
}

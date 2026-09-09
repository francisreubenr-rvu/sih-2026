import { z } from 'zod';

export const SCHEME = 'sightline-semantic-v1';
export const SAFE_LABELS = Object.freeze(['Pending', 'Completed', 'Review', 'Details', 'Next', 'Previous', 'Back', 'Close', 'Search', 'Help', 'Cancel']);
export const TASKS = Object.freeze(['review-pending', 'show-completed', 'next-page']);
const size = z.number().int().min(1).max(8192);
const rect = z.object({ x: z.number().min(0).max(8192), y: z.number().min(0).max(8192), width: z.number().positive().max(8192), height: z.number().positive().max(8192) }).strict();
export const sceneSchema = z.object({
  scheme: z.literal(SCHEME),
  revision: z.string().uuid(),
  viewport: z.object({ width: size, height: size }).strict(),
  controls: z.array(z.object({ id: z.string().regex(/^c\d{1,4}$/), role: z.enum(['button', 'link']), label: z.enum(SAFE_LABELS), rect }).strict()).max(200),
  regions: z.array(z.object({ kind: z.enum(['private', 'media', 'face', 'field']), rect }).strict()).max(2000),
}).strict().superRefine((v, ctx) => {
  const ids = new Set();
  for (const [i, c] of v.controls.entries()) {
    if (ids.has(c.id)) ctx.addIssue({code:'custom', path:['controls',i,'id'], message:'Duplicate target'});
    ids.add(c.id);
  }
  for (const r of [...v.controls, ...v.regions]) {
    if (r.rect.x + r.rect.width > v.viewport.width + 0.01 || r.rect.y + r.rect.height > v.viewport.height + 0.01)
      ctx.addIssue({code:'custom', path:['viewport'], message:'Region exceeds viewport'});
  }
});
// Pixels are intentionally absent from the external contract. The server renders the
// canonical wireframe itself, preventing a client PNG field from bypassing redaction.
export const requestSchema = z.object({ task: z.enum(TASKS), scene: sceneSchema }).strict();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('click'), targetId:z.string().regex(/^c\d{1,4}$/)}).strict(),
  z.object({type:z.literal('scroll'), direction:z.enum(['up','down'])}).strict(),
  z.object({type:z.literal('done')}).strict(),
]);
export function validateAction(action, scene) {
  const parsed = actionSchema.parse(action);
  if (parsed.type === 'click' && !scene.controls.some(c => c.id === parsed.targetId))
    throw new Error('Unknown action target');
  return parsed;
}

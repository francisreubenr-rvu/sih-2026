import {z} from 'zod';
import {sceneSchema} from './protocol.mjs';
import {VALUE_KINDS} from './local-values.mjs';
const rect=z.object({x:z.number().min(0),y:z.number().min(0),width:z.number().positive(),height:z.number().positive()}).strict();
export const localReferenceRequestSchema=z.object({
 scheme:z.literal('sightline-local-references-v1'),
 task:z.literal('prepare-report-contact'),
 scene:sceneSchema,
 fields:z.array(z.object({id:z.string().regex(/^f\d{1,2}$/),label:z.literal('Report contact'),kind:z.enum(VALUE_KINDS),referenceId:z.string().uuid(),empty:z.boolean(),rect}).strict()).min(1).max(10)
}).strict().superRefine((request,ctx)=>{
 const ids=new Set();
 for(const f of request.fields){if(ids.has(f.id))ctx.addIssue({code:'custom',message:'Duplicate field'});ids.add(f.id);if(f.kind!=='email')ctx.addIssue({code:'custom',message:'Unsupported contact type'});if(f.rect.x+f.rect.width>request.scene.viewport.width||f.rect.y+f.rect.height>request.scene.viewport.height)ctx.addIssue({code:'custom',message:'Field outside viewport'});}
});
export const localReferenceActionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('fill-local'),targetId:z.string().regex(/^f\d{1,2}$/),referenceId:z.string().uuid()}).strict(),
 z.object({type:z.literal('done')}).strict()
]);
export function validateLocalReferenceAction(action,input){
 const request=localReferenceRequestSchema.parse(input),parsed=localReferenceActionSchema.parse(action);
 if(parsed.type==='fill-local'&&!request.fields.some(f=>f.id===parsed.targetId&&f.referenceId===parsed.referenceId&&f.empty))throw new Error('Local value action denied');
 return parsed;
}
export const localReferenceChoices=input=>[...localReferenceRequestSchema.parse(input).fields.filter(f=>f.empty).map(f=>`fill:${f.id}:${f.referenceId}`),'done'];
export function decodeLocalReferenceChoice(value,input){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).join(',')!=='choice'||!localReferenceChoices(input).includes(value.choice))throw new Error('provider_invalid');
 if(value.choice==='done')return {type:'done'};
 const [,targetId,referenceId]=value.choice.split(':');return validateLocalReferenceAction({type:'fill-local',targetId,referenceId},input);
}

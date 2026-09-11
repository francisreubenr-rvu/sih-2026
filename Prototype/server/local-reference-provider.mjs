import {localReferenceRequestSchema,localReferenceChoices,decodeLocalReferenceChoice} from '../shared/local-reference-protocol.mjs';
export function localReferenceProvider({baseUrl='http://127.0.0.1:11434',model='qwen2.5:7b-instruct',timeoutMs=25000,fetchImpl=fetch}={}){
 const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('Invalid provider endpoint');
 return async input=>{
  const request=localReferenceRequestSchema.parse(input),choices=localReferenceChoices(request);
  const format={type:'object',properties:{choice:{type:'string',enum:choices}},required:['choice'],additionalProperties:false};let response;
  try{response=await fetchImpl(new URL('/api/chat',base),{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify({model,stream:false,format,options:{temperature:0,num_predict:160,num_ctx:4096},messages:[{role:'system',content:'Prepare a report contact draft using a local value reference. The email value stays in the browser. Choose the fill action for the empty Report contact field. If no field is empty, choose done. Return exactly one choice from the provided choices. Never invent, request or output the private value. No submission or sending is authorized.'},{role:'user',content:JSON.stringify({request,choices})}]})});}catch{throw new Error('provider_unavailable');}
  if(!response.ok)throw new Error('provider_unavailable');
  try{const body=await response.json();return {action:decodeLocalReferenceChoice(JSON.parse(body.message.content),request),model,mode:'open-weight-local-reference-plan'};}catch{throw new Error('provider_invalid');}
 };
}

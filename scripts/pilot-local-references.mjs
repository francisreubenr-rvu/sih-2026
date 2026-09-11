import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {resolve} from 'node:path';
import {createApp} from '../Prototype/server/app.mjs';import {localReferenceProvider} from '../Prototype/server/local-reference-provider.mjs';import {createLocalValueVault} from '../Prototype/shared/local-values.mjs';
const root=new URL('../',import.meta.url),out=process.argv[2];if(!out)throw new Error('Provide a fresh output directory');await mkdir(resolve(out),{recursive:false});
const model='qwen2.5:7b-instruct',baseUrl=process.env.SIGHTLINE_PILOT_OLLAMA_URL||'http://127.0.0.1:11434',token='synthetic-pilot-auth-not-user-credential';const audit=[];let rawValue='',modelRequests=[],providerResponses=[];
const provider=localReferenceProvider({baseUrl,model,fetchImpl:async(url,options)=>{modelRequests.push(options.body);const r=await fetch(url,options);providerResponses.push(await r.clone().text());return r;}});
const app=createApp({token,infer:async()=>{throw new Error('Wrong route');},localInfer:provider,saveAudit:r=>audit.push(r)});await new Promise(r=>app.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${app.address().port}/api/v2/local-plans`;
const record={version:1,scope:'authored server/shared-client pilot; no browser DOM execution',startedAt:new Date().toISOString(),model,baseUrl,cases:[]};
try{
 const tags=await(await fetch(baseUrl+'/api/tags')).json();record.modelMetadata=tags.models.find(x=>x.name===model)??null;
 for(const [id,count,emptyIndex]of [['empty-contact',1,0],['filled-contact',1,-1],['second-contact',2,1]]){
  const revision=randomUUID(),vault=createLocalValueVault(),targets=Array.from({length:count},()=>({}));rawValue=`${id}@synthetic.example.test`;modelRequests=[];providerResponses=[];const fields=targets.map((target,i)=>({id:'f'+i,label:'Report contact',...vault.issue({value:rawValue,kind:'email',target,revision}),empty:i===emptyIndex,rect:{x:20,y:30+i*60,width:300,height:40}}));
  const input={scheme:'sightline-local-references-v1',task:'prepare-report-contact',scene:{scheme:'sightline-semantic-v1',revision,viewport:{width:800,height:600},controls:[],regions:[]},fields};const body=JSON.stringify(input),started=performance.now();let result;
  try{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body});const wireResponse=await response.text();const data=JSON.parse(wireResponse);const expected=emptyIndex<0?'done':'fill-local';const action=data.data?.action;let localWrite=false,oneTime=false;
   const correct=response.ok&&action?.type===expected&&(emptyIndex<0||action.targetId==='f'+emptyIndex);
   if(correct&&emptyIndex>=0){const args={...action,kind:'email',target:targets[emptyIndex],revision,userConfirmed:true};vault.apply(args,value=>{localWrite=value===rawValue;});try{vault.apply(args,()=>{});}catch{oneTime=true;}}
   const noKnownValue=[body,wireResponse,...modelRequests,...providerResponses,JSON.stringify(audit)].every(text=>!text.includes(rawValue));
   result={id,status:response.status,correct,noKnownValue,localWrite:emptyIndex<0?null:localWrite,oneTime:emptyIndex<0?null:oneTime,elapsedMs:performance.now()-started,modelRequests:modelRequests.length,request:input,response:data};
  }catch(e){result={id,status:'failed',error:e.message==='Local values expired'?'local-reference-expired':'request-or-write-failed',elapsedMs:performance.now()-started};}finally{vault.revoke();rawValue='';}
  record.cases.push(result);console.log(id,result.correct??false,Math.round(result.elapsedMs)+'ms');await writeFile(resolve(out,'results.json'),JSON.stringify(record,null,2)+'\n');
 }
}finally{await new Promise(r=>app.close(r));record.finishedAt=new Date().toISOString();record.sourceHashes={};for(const file of ['Prototype/shared/local-values.mjs','Prototype/shared/local-reference-protocol.mjs','Prototype/server/local-reference-provider.mjs','Prototype/server/app.mjs','scripts/pilot-local-references.mjs'])record.sourceHashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');await writeFile(resolve(out,'results.json'),JSON.stringify(record,null,2)+'\n');}

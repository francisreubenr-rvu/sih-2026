// Real-provider pilot. Does not measure browser latency or held-out task accuracy.
import {ollamaProvider} from '../Prototype/server/provider.mjs';
import {validateAction,requestSchema} from '../Prototype/shared/protocol.mjs';
import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
const root=new URL('../',import.meta.url);
const runId=process.env.SIGHTLINE_PILOT_RUN||`model-pilot-${new Date().toISOString().replaceAll(':','-')}`;
if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(runId))throw new Error('Invalid pilot run identifier');
const out=new URL(`Benchmarks/results/${runId}/`,root);
// Refuse an existing run directory; failed and completed evidence is immutable.
await mkdir(out);
// Reuse the frozen first-run inputs by default for subsequent comparisons.
const caseSource=new URL(process.env.SIGHTLINE_PILOT_CASES||'Benchmarks/results/model-pilot-v1/cases.json',root);
const cases=JSON.parse(await readFile(caseSource,'utf8')).cases;
if(!Array.isArray(cases)||!cases.length)throw new Error('Pilot case set is empty');
for(const c of cases)requestSchema.parse({task:c.task,scene:c.scene});
await writeFile(new URL('cases.json',out),JSON.stringify({scope:'authored synthetic semantic-layout pilot; 12 states in 2 layouts; not held-out browser pages',cases},null,2)+'\n');
const providerHash=createHash('sha256').update(await readFile(new URL('Prototype/server/provider.mjs',root))).digest('hex');
const models=(process.env.SIGHTLINE_PILOT_MODELS||'qwen2.5:0.5b,qwen2.5:7b-instruct').split(',');
const tags=await (await fetch('http://127.0.0.1:11434/api/tags')).json();
const results=[];
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
for(const model of models){
 const infer=ollamaProvider({model});const path=new URL(model.replaceAll(':','-')+'.ndjson',out);await writeFile(path,'');
 const warmups=[];
 for(let i=0;i<2;i++){const start=performance.now();try{await infer(requestSchema.parse({task:cases[i].task,scene:cases[i].scene}));warmups.push({ms:performance.now()-start,ok:true});}catch(e){warmups.push({ms:performance.now()-start,ok:false,error:e.message});}}
 const rows=[];
 for(const c of cases){
  const start=performance.now();let row={case_id:c.id,model,expected:c.expected};
  try{
   const answer=await infer(requestSchema.parse({task:c.task,scene:c.scene}));const action=validateAction(answer.action,c.scene);
   const actual=action.type==='click'?c.scene.controls.find(x=>x.id===action.targetId).label:action.type==='scroll'?`scroll-${action.direction}`:'done';
   row={...row,ms:performance.now()-start,actual,correct:actual===c.expected,schema_valid:true};
  }catch(e){row={...row,ms:performance.now()-start,correct:false,schema_valid:false,error:e.message};}
  rows.push(row);await appendFile(path,JSON.stringify(row)+'\n');console.log(model,rows.length+'/'+cases.length,row.correct?'correct':'FAIL',row.ms.toFixed(0)+'ms');
 }
 const ps=await (await fetch('http://127.0.0.1:11434/api/ps')).json();
 results.push({model,installed:tags.models.find(x=>x.name===model),warmups,sample_count:rows.length,correct:rows.filter(r=>r.correct).length,schema_valid:rows.filter(r=>r.schema_valid).length,accuracy:rows.filter(r=>r.correct).length/rows.length,latency_ms:{p50:percentile(rows.map(r=>r.ms),.5),p95:percentile(rows.map(r=>r.ms),.95),max:Math.max(...rows.map(r=>r.ms))},server_residency:ps.models.filter(x=>x.name===model),rows});
 await writeFile(new URL('summary.json',out),JSON.stringify({timestamp:new Date().toISOString(),scope:'real Ollama provider-only pilot; excludes browser capture, network deployment, review and execution',provider_sha256:providerHash,cases_sha256:createHash('sha256').update(JSON.stringify(cases)).digest('hex'),case_source:fileURLToPath(caseSource),environment:{os:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,total_system_bytes:os.totalmem()},limitations:['Authored synthetic cases follow the declared 3-task policy; not unseen tasks or PII accuracy','Two layouts share each semantic state, so samples are not independent','Two warmup calls excluded; 24 measured calls per model, below the full-flow gate sample minimum','Server residency is not client memory; model-only latency is not full-task latency'],results},null,2)+'\n');
}
console.log('Pilot complete:',fileURLToPath(new URL('summary.json',out)));

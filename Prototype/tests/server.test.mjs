import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { ollamaProvider, outputSchema } from '../server/provider.mjs';
const token='synthetic-test-token-not-a-real-secret';
const body=()=>({task:'review-pending',scene:{scheme:'sightline-semantic-v1',revision:randomUUID(),viewport:{width:800,height:600},controls:[{id:'c0',role:'button',label:'Pending',rect:{x:10,y:10,width:80,height:44}}],regions:[]}});
async function fixture(fn,{infer=async()=>({action:{type:'click',targetId:'c0'},model:'test-double',mode:'test-only'}),saveAudit=()=>{}}={}) {
 const app=createApp({token,infer,saveAudit});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${app.address().port}`;
 try {await fn(url);} finally {await new Promise(r=>app.close(r));}
}
const post=(url,value,extra={})=>fetch(url+'/api/v1/plans',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...extra},body:typeof value==='string'?value:JSON.stringify(value)});
test('requires authorization and exact allowed origin',()=>fixture(async url=>{
 assert.equal((await post(url,body(),{Authorization:''})).status,401);
 assert.equal((await post(url,body(),{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await fetch(url+'/api/v1/session')).status,403);
}));
test('rejects malformed, oversized and extra-field requests before provider',()=>{
 let called=0;return fixture(async url=>{
 assert.equal((await post(url,'{')).status,400);
 assert.equal((await post(url,{...body(),screenshot:'raw'})).status,422);
 assert.equal((await post(url,' '.repeat(270000))).status,413);
 assert.equal(called,0);
 },{infer:async()=>{called++;}});
});
test('valid plan contains matching revision and audit stores no scene or PII',()=>{
 const rows=[];return fixture(async url=>{
 const input=body();const r=await post(url,input);assert.equal(r.status,200);
 const result=await r.json();assert.equal(result.data.revision,input.scene.revision);
 assert.equal(result.data.action.targetId,'c0');assert.equal(rows.length,1);
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','createdAt','model','mode','controls','regions','latencyMs','actionType'].sort());
 },{saveAudit:r=>rows.push(r)});
});
test('unsafe provider target is rejected without persistence',()=>fixture(async url=>{
 const r=await post(url,body());assert.equal(r.status,502);assert.equal((await r.json()).error.code,'provider_invalid');
 },{infer:async()=>({action:{type:'click',targetId:'c88'}}),saveAudit:()=>assert.fail('Must not persist unsafe plan')}));
test('provider outage gives actionable error without stack or endpoint leakage',()=>fixture(async url=>{
 const r=await post(url,body());assert.equal(r.status,503);const text=await r.text();assert.doesNotMatch(text,/stack|11434|Error:/);
 },{infer:async()=>{throw new Error('provider_unavailable');}}));
test('request rate cap returns 429 and retry-after',()=>fixture(async url=>{
 for(let i=0;i<20;i++) assert.equal((await post(url,body())).status,200);
 const r=await post(url,body());assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
}));
test('static server never exposes server source, pairing tokens or tests',()=>fixture(async url=>{
 for(const path of ['/server/index.mjs','/data/pairing-token','/tests/server.test.mjs','/app/%2e%2e/server/index.mjs']) assert.equal((await fetch(url+path)).status,404);
}));
test('real provider adapter submits only validated semantics and checks JSON',async()=>{
 let sent;
 const infer=ollamaProvider({fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:'{"choice":"done"}'}})};}});
 const r=await infer(body());assert.equal(r.action.type,'done');assert.equal(sent.stream,false);assert.doesNotMatch(JSON.stringify(sent),/screenshot|private@example/);
 const broken=ollamaProvider({fetchImpl:async()=>({ok:true,json:async()=>({message:{content:'not json'}})})});
 await assert.rejects(broken(body()),/provider_invalid/);
});

test("serves the real app entry and fixture",()=>fixture(async url=>{for(const path of ["/","/app/fixture.html"]) {const r=await fetch(url+path);assert.equal(r.status,200);assert.match(r.headers.get("content-type"),/text\/html/);}}));

test("no-control scenes omit an impossible empty click enum",()=>{const schema=outputSchema([]);assert.deepEqual(schema.properties.choice.enum,["done","scroll-down","scroll-up"]);});

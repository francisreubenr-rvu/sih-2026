import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerVisionDetector} from '../shared/vision-worker-client.mjs';
class FakeWorker{
 static latest;
 constructor(){FakeWorker.latest=this;this.terminated=false;}
 postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{id:data.id,ok:true,result:{ready:true}}}));else this.last=data;}
 terminate(){this.terminated=true;}
 reply(result){this.onmessage({data:{id:this.last.id,ok:true,result}});}
}
function fixture(){let closed=0;return {options:{WorkerImpl:FakeWorker,bitmapFactory:async()=>({width:8,height:8,close(){closed++;}})},closed:()=>closed};}
test('worker wrapper serializes detection and returns the actual worker response',async()=>{
 const f=fixture(),d=await createWorkerVisionDetector(f.options);const p=d.detect({});await assert.rejects(d.detect({}),/busy/);FakeWorker.latest.reply({detections:[{x:1,y:2,width:3,height:4}],inferenceMs:12});assert.equal((await p).detections.length,1);assert.equal(f.closed(),1);await d.dispose();assert.ok(FakeWorker.latest.terminated);
});
test('disposing active worker rejects pending work and prevents reuse',async()=>{
 const f=fixture(),d=await createWorkerVisionDetector(f.options),p=d.detect({});await Promise.resolve();const rejected=assert.rejects(p,/disposed/);await d.dispose();await rejected;await assert.rejects(d.detect({}),/disposed/);assert.equal(f.closed(),1);assert.ok(FakeWorker.latest.terminated);
});
test('worker failure releases pending request and bitmap',async()=>{
 const f=fixture(),d=await createWorkerVisionDetector(f.options),p=d.detect({});await Promise.resolve();const rejected=assert.rejects(p,/worker failed/);FakeWorker.latest.onerror();await rejected;assert.equal(f.closed(),1);assert.ok(FakeWorker.latest.terminated);await d.dispose();
});

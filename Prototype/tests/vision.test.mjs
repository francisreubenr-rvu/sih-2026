import test from 'node:test';
import assert from 'node:assert/strict';
import {rgbaToNchw,decodeFaces,iou} from '../shared/vision.mjs';
test('RGB preprocessing follows upstream channel order and normalization',()=>{
 assert.deepEqual([...rgbaToNchw(new Uint8ClampedArray([255,127,0,255]),1,1)],[1,0,-.9921875]);
 assert.throws(()=>rgbaToNchw(new Uint8Array(3),1,1));
});
test('face decoding thresholds, clips and suppresses duplicate boxes',()=>{
 const faces=decodeFaces([.1,.9,.2,.8,.6,.4],[.1,.1,.5,.5,.11,.11,.51,.51,.7,.7,1.1,1.1],100,100);
 assert.equal(faces.length,1);assert.equal(faces[0].x,10);assert.equal(faces[0].width,40);
 assert.equal(iou(faces[0],faces[0]),1);
 assert.throws(()=>decodeFaces([.1,.9],[1,2],100,100));
});

test('invalid shapes, scores and box coordinates fail instead of reporting safe output',()=>{
 for(const shape of [[0,240],[-1,240],[320.5,240],[Infinity,240],[8193,240]]){
  assert.throws(()=>rgbaToNchw(new Uint8Array(0),...shape),/shape/);
  assert.throws(()=>decodeFaces([.1,.9],[.1,.1,.5,.5],...shape),/shape/);
 }
 for(const score of [NaN,Infinity,-.1,1.1])assert.throws(()=>decodeFaces([.1,score],[.1,.1,.5,.5],100,100),/score/);
 for(const coordinate of [NaN,Infinity,-Infinity])assert.throws(()=>decodeFaces([.1,.9],[coordinate,.1,.5,.5],100,100),/box/);
 for(const threshold of [NaN,Infinity,-1,2])assert.throws(()=>decodeFaces([.1,.9],[.1,.1,.5,.5],100,100,threshold),/threshold/);
 assert.throws(()=>decodeFaces([],[],100,100),/outputs/);
 assert.throws(()=>rgbaToNchw([NaN,127,0,255],1,1),/sample/);
});

import {createVisionDetector} from '../shared/vision.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
async function runtimeFixture(runTest,{mode='success',nullContext=false}={}) {
 const dir=await mkdtemp(join(tmpdir(),'sightline-vision-test-'));
 const state={inputs:[],outputs:[],clears:0,closed:0,releases:0,mode};
 const keys=['__sightlineVisionTestRuntime','location','OffscreenCanvas','ImageData','createImageBitmap'];
 const originals=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 const output=(data,dims)=>{const tensor={data,dims,disposed:0,dispose(){this.disposed++;}};state.outputs.push(tensor);return tensor;};
 const session={inputNames:['input'],async run(){
  if(state.wait)await state.wait;
  if(state.mode==='run-error')throw new Error('test run failed');
  if(state.mode==='shape-error')return {unexpected:output([0],[1])};
  return {scores:output([.1,state.mode==='nan'?NaN:.9],[1,1,2]),boxes:output([.1,.1,.5,.5],[1,1,4])};
 },async release(){state.releases++;}};
 globalThis.__sightlineVisionTestRuntime={env:{wasm:{}},Tensor:class {
  constructor(type,data,dims){this.data=data;this.dims=dims;this.disposed=0;state.inputs.push(this);}
  dispose(){this.disposed++;}
 },InferenceSession:{async create(){return session;}}};
 globalThis.location={href:'https://synthetic.invalid/'};
 globalThis.ImageData=class {constructor(){this.width=100;this.height=100;}};
 globalThis.createImageBitmap=async()=>({close(){state.closed++;}});
 globalThis.OffscreenCanvas=class {getContext(){return nullContext?null:{drawImage(){},getImageData(){return {data:new Uint8ClampedArray(320*240*4)};},clearRect(){state.clears++;}};}};
 const file=join(dir,'runtime.mjs');
 await writeFile(file,'const runtime=globalThis.__sightlineVisionTestRuntime; export const env=runtime.env; export const Tensor=runtime.Tensor; export const InferenceSession=runtime.InferenceSession;');
 try{await runTest(state,()=>createVisionDetector({runtimeUrl:pathToFileURL(file).href,modelUrl:'synthetic-model'}));}
 finally{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}await rm(dir,{recursive:true,force:true});}
}

test('input/output tensors and owned bitmaps are released after every inference outcome',async()=>{
 for(const mode of ['success','run-error','shape-error','nan'])await runtimeFixture(async(state,create)=>{
  const detector=await create();const source=new ImageData();
  if(mode==='success')assert.equal((await detector.detect(source)).detections.length,1);
  else await assert.rejects(detector.detect(source));
  assert.equal(state.inputs.length,1);assert.ok(state.inputs.every(t=>t.disposed===1));
  assert.ok(state.outputs.every(t=>t.disposed===1));assert.equal(state.closed,1);assert.equal(state.clears,1);
  await detector.dispose();assert.equal(state.releases,1);
 },{mode});
});
test('caller-owned bitmaps stay open and disposal is idempotent',async()=>{
 await runtimeFixture(async(state,create)=>{
  const detector=await create();let closed=0;
  await detector.detect({width:100,height:100,close(){closed++;}});assert.equal(closed,0);
  await Promise.all([detector.dispose(),detector.dispose()]);assert.equal(state.releases,1);
  await assert.rejects(detector.detect({width:100,height:100}),/disposed/);
 });
});
test('overlapping inference rejects and session disposal waits for active inference',async()=>{
 await runtimeFixture(async(state,create)=>{
  let resolve;state.wait=new Promise(done=>{resolve=done;});
  const detector=await create(),pending=detector.detect({width:100,height:100});
  await assert.rejects(detector.detect({width:100,height:100}),/busy/);
  const disposed=detector.dispose();assert.equal(state.releases,0);
  resolve();await pending;await disposed;
  assert.equal(state.releases,1);assert.ok(state.inputs.every(t=>t.disposed===1));
 });
});
test('canvas initialization failure releases the already-created session',async()=>{
 await runtimeFixture(async(state,create)=>{await assert.rejects(create(),/canvas unavailable/);assert.equal(state.releases,1);},{nullContext:true});
});

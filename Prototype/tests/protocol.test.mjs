import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requestSchema, validateAction } from '../shared/protocol.mjs';
import { clipRect, makeScene, sceneToSvg, classifySensitive } from '../shared/privacy.mjs';
export const example=()=>({task:'review-pending',scene:makeScene({revision:randomUUID(),viewport:{width:800,height:600},controls:[{id:'c0',role:'button',label:'Pending',rect:{x:10,y:10,width:80,height:44}}],regions:[{kind:'private',rect:{x:200,y:30,width:100,height:20}}]})});
test('outbound schema refuses raw screenshots, DOM, URLs and arbitrary tasks',()=>{
 for(const key of ['screenshot','html','url','raw','email']) assert.equal(requestSchema.safeParse({...example(),[key]:'private@example.com'}).success,false);
 assert.equal(requestSchema.safeParse({...example(),task:'email me at private@example.com'}).success,false);
});
test('scene reconstruction drops untrusted object fields and rejects arbitrary labels',()=>{
 const source={...example().scene,secret:'private@example.com'};
 const clean=makeScene(source);assert.equal(JSON.stringify(clean).includes('private@example.com'),false);
 source.controls[0].label='private@example.com';assert.equal(makeScene(source).controls.length,0);
});
test('out of bounds, duplicate IDs and nonfinite coordinates are rejected',()=>{
 const a=example();a.scene.controls.push(a.scene.controls[0]);assert.equal(requestSchema.safeParse(a).success,false);
 const b=example();b.scene.controls[0].rect.x=799;assert.equal(requestSchema.safeParse(b).success,false);
 const c=example();c.scene.controls[0].rect.x=NaN;assert.equal(requestSchema.safeParse(c).success,false);
});
test('clipping handles negative edges, padding and offscreen pixels',()=>{
 assert.deepEqual(clipRect({x:-10,y:2,width:30,height:20},{width:100,height:100},2),{x:0,y:0,width:22,height:24});
 assert.equal(clipRect({x:120,y:1,width:5,height:5},{width:100,height:100}),null);
});
test('arbitrary JS, unknown targets, payload fields and typing are rejected',()=>{
 const s=example().scene;
 assert.throws(()=>validateAction({type:'click',targetId:'c999'},s));
 assert.throws(()=>validateAction({type:'click',targetId:'c0',script:'alert(1)'},s));
 assert.throws(()=>validateAction({type:'type',value:'secret'},s));
 assert.deepEqual(validateAction({type:'click',targetId:'c0'},s),{type:'click',targetId:'c0'});
});
test('rendered wireframe contains allowed semantics but no arbitrary source content',()=>{
 const e=example(); const svg=sceneToSvg(e.scene);
 assert.match(svg,/c0 Pending/);assert.doesNotMatch(svg,/private@example/);
 e.scene.controls[0].label='<script>';assert.throws(()=>sceneToSvg(e.scene));
});
test('PII detector identifies email and numeric IDs while export remains independent',()=>{
 assert.deepEqual(classifySensitive('Reach synthetic.person@example.test'),['email']);
 assert.ok(classifySensitive('Account 1234 5678 9012').includes('number'));
});

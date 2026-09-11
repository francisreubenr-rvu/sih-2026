import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenOcrWords,packWordTokens,decodeTokenLabels,localWordPolicy} from '../shared/text-privacy.mjs';
import {scoreTextFixture} from '../app/text-fixtures.mjs';
const word=(text,x=0)=>({text,confidence:95,rect:{x,y:0,width:20,height:20}});
test('reject invalid token windows instead of hanging or silently dropping input',()=>{
 for(const [max,overlap]of [[2,0],[192,190],[192,-1],[513,2],[10,1.5]])assert.throws(()=>packWordTokens([word('a')],{encode:()=>({ids:[12]})},max,overlap),/window/);
});
test('overlap preserves word alignment across subword and window boundaries',()=>{
 const chunks=packWordTokens([word('first'),word('second'),word('third')],{encode:()=>({ids:[20,21,22]})},6,2);
 assert.equal(chunks.length,4);assert.deepEqual(chunks[0].wordIndices,[null,0,0,0,1,null]);assert.deepEqual(chunks.at(-1).wordIndices,[null,2,2,2,null]);
 const seen=new Set(chunks.flatMap(c=>c.wordIndices).filter(i=>i!==null));assert.deepEqual([...seen],[0,1,2]);
});
test('invalid OCR geometry fails closed before any preview is built',()=>{
 const wrap=w=>({blocks:[{paragraphs:[{lines:[{words:[w]}]}]}]});
 assert.throws(()=>flattenOcrWords(wrap({text:'x',confidence:99,bbox:{x0:0,y0:0,x1:NaN,y1:20}}),100,100),/geometry/);
 assert.deepEqual(flattenOcrWords(wrap({text:'x',confidence:99,bbox:{x0:-5,y0:0,x1:10,y1:20}}),100,100)[0].rect,{x:0,y:0,width:10,height:20});
});
test('subword PII evidence marks its word and malformed inference is rejected',()=>{
 const labels=decodeTokenLabels(new Float32Array([9,0,0,9,1,8,9,0]),[1,4,2],[null,0,0,null],{0:'O',1:'B-PERSON'});
 assert.equal(labels.get(0).kind,'PERSON');
 assert.throws(()=>decodeTokenLabels(new Float32Array([NaN,0]),[1,1,2],[0],{0:'O',1:'B-PERSON'}),/scores/);
});
test('local policy combines model labels with deterministic numeric and email rules',()=>{
 const result=localWordPolicy([word('Alex'),word('alex@example.test'),word('123456789'),word('Review')],new Map([[0,{kind:'PERSON',confidence:.9}]]));
 assert.deepEqual(result.map(w=>w.sensitive),[true,true,true,false]);
});
test('explicit address label withholds the whole value without masking another line or following public field',()=>{
 const items=[['Address:',0,0],['42',0,40],['Example',0,80],['Street',0,120],['Status:',0,180],['Pending',0,220],['Review',1,0]].map(([text,lineIndex,x])=>({...word(text,x),lineIndex}));
 const result=localWordPolicy(items,new Map());
 assert.deepEqual(result.map(w=>w.sensitive),[false,true,true,true,false,false,false]);
 assert.equal(result[2].rule,'explicit-sensitive-field');
 assert.equal(result[2].piiConfidence,null); // A deterministic rule is not a calibrated probability.
});
test('line policy uses geometry, requires an exact colon label and never assumes missing line identity',()=>{
 const items=[{...word('Secret',100),lineIndex:2},{...word('Password:',0),lineIndex:2},{...word('Password',0),lineIndex:3},{...word('Help',100),lineIndex:3},word('Name:',0),word('Alex',100)];
 assert.deepEqual(localWordPolicy(items,new Map()).map(w=>w.sensitive),[true,false,false,false,false,false]);
});
test('flattening keeps distinct OCR line identities for policy boundaries',()=>{
 const w=text=>({text,confidence:95,bbox:{x0:0,y0:0,x1:20,y1:20}});
 const result=flattenOcrWords({blocks:[{paragraphs:[{lines:[{words:[w('Address:'),w('42')]},{words:[w('Review')]}]}]}]},100,100);
 assert.deepEqual(result.map(w=>w.lineIndex),[0,0,1]);
});
test('diagnostic counts omitted OCR as a miss, and retained PII as a leak',()=>{
 const expected=[{...word('Alex'),pii:true},{...word('Review',40),pii:false},{...word('Missing',80),pii:true}];
 const result=scoreTextFixture(expected,[{...word('Alex'),sensitive:false},{...word('Review',40),sensitive:false}]);
 assert.equal(result.piiTokens,2);assert.equal(result.piiDetected,0);assert.equal(result.piiRetained,1);assert.equal(result.usefulRetained,1);
});

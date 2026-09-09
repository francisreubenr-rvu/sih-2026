import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeProposal} from '../server/provider.mjs';
const scene={controls:[{id:'c17',label:'Pending'}]};
test('provider proposal retains only the permitted action fields',()=>{
 assert.deepEqual(decodeProposal({choice:'c17'},scene),{type:'click',targetId:'c17'});
 assert.deepEqual(decodeProposal({choice:'done'},scene),{type:'done'});
 assert.deepEqual(decodeProposal({choice:'scroll-down'},scene),{type:'scroll',direction:'down'});
});
test('contradictory, unknown, missing and extra provider fields cannot authorize an action',()=>{
 for(const p of [null,[],{choice:'c999'},{action:'click',targetId:'c999',direction:null},{action:'click',targetId:'c17',direction:'down'},{action:'done',targetId:'c17',direction:null},{action:'done',direction:null},{choice:'done',code:'alert(1)'},{action:'type',targetId:'c17',direction:null},{action:'scroll',targetId:null,direction:'sideways'}])assert.throws(()=>decodeProposal(p,scene),/provider_invalid/);
});

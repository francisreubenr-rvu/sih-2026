// Values stay in this module's closure. References authorize one exact local write.
import { newRevisionId } from './random-id.mjs';
export const VALUE_KINDS=Object.freeze(['email','person-name','phone','employee-id','location-code']);
export function createLocalValueVault({ttlMs=30000,now=()=>performance.now(),randomId=()=>newRevisionId()}={}){
 if(!Number.isFinite(ttlMs)||ttlMs<1||ttlMs>300000)throw new Error('Invalid local value lifetime');
 const created=now(),entries=new Map();let revoked=false;
 const revoke=()=>{revoked=true;entries.clear();clearTimeout(timer);};
 const timer=setTimeout(revoke,ttlMs);timer.unref?.();
 function check(){const age=now()-created;if(revoked||!Number.isFinite(age)||age<0||age>=ttlMs){revoke();throw new Error('Local values expired');}}
 return Object.freeze({
  issue({value,kind,target,revision}){
   check();if(typeof value!=='string'||!value||value.length>512||!VALUE_KINDS.includes(kind)||!target||typeof target!=='object'||typeof revision!=='string'||!revision)throw new Error('Invalid local value binding');
   for(const [referenceId,e]of entries)if(e.value===value&&e.kind===kind&&e.target===target&&e.revision===revision)return Object.freeze({referenceId,kind});
   if(entries.size>=100)throw new Error('Local value capacity exceeded');
   const referenceId=randomId();if(typeof referenceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceId)||entries.has(referenceId))throw new Error('Invalid local reference');
   entries.set(referenceId,{value,kind,target,revision});return Object.freeze({referenceId,kind});
  },
  apply({referenceId,kind,target,revision,userConfirmed=false},write){
   check();const entry=entries.get(referenceId);
   if(userConfirmed!==true||!entry||entry.kind!==kind||entry.target!==target||entry.revision!==revision||typeof write!=='function')throw new Error('Local value action denied');
   // Consume before writing: a partially completed write must never be replayed.
   entries.delete(referenceId);
   try{const result=write(entry.value);if(result?.then){result.catch(()=>{});throw new Error('Asynchronous writer unsupported');}}catch{throw new Error('Local write outcome requires review');}
   return {status:'applied'};
  },
  revoke,
  get size(){check();return entries.size;},
  toJSON(){return {contains:'local-only values',exportable:false};}
 });
}

// Bounded coordinator. Adapters own capture, privacy validation and action authority.
export async function runTask({observe,plan,execute,onEvent=()=>{},signal,maxSteps=8,deadlineMs=90000,maxNoProgress=2,now=()=>performance.now()}){
 for(const fn of [observe,plan,execute,onEvent,now])if(typeof fn!=='function')throw new TypeError('Task adapters must be functions');
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>20||!Number.isFinite(deadlineMs)||deadlineMs<1||deadlineMs>300000||!Number.isInteger(maxNoProgress)||maxNoProgress<1||maxNoProgress>5)throw new Error('Invalid task budget');
 const controller=new AbortController(),started=now(),trace=[];let actions=0,lastFingerprint=null,unchanged=0,stage='observe',timedOut=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(()=>{timedOut=true;abort();},deadlineMs);
 const emit=(state,extra={})=>{stage=state;const event={state,actions,elapsedMs:Math.max(0,now()-started),...extra};trace.push(event);onEvent(event);};
 const check=()=>{if(now()-started>=deadlineMs){timedOut=true;abort();}if(controller.signal.aborted)throw new Error('interrupted');};
 // Settling the race never authorizes later adapter work; execution checks again.
 const call=fn=>new Promise((resolve,reject)=>{
  check();const interrupted=()=>reject(new Error('interrupted'));controller.signal.addEventListener('abort',interrupted,{once:true});
  Promise.resolve().then(()=>{check();return fn(controller.signal);}).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',interrupted));
 });
 const finish=(status,reason)=>{emit(status,{reason});return {status,reason,actions,elapsedMs:Math.max(0,now()-started),trace};};
 try{
  while(true){
   check();emit('observe');const snapshot=await call(observe);check();
   if(!snapshot||typeof snapshot.complete!=='boolean'||typeof snapshot.fingerprint!=='string'||!snapshot.fingerprint||snapshot.fingerprint.length>65536)throw new Error('invalid_observation');
   if(snapshot.complete)return finish('completed','postcondition_verified');
   if(lastFingerprint!==null){unchanged=snapshot.fingerprint===lastFingerprint?unchanged+1:0;if(unchanged>=maxNoProgress)return finish('stopped','no_progress');}
   if(actions>=maxSteps)return finish('stopped','step_limit');
   lastFingerprint=snapshot.fingerprint;
   emit('plan');const proposal=await call(s=>plan(snapshot,s));check();
   if(!proposal||!['click','scroll','done'].includes(proposal.action?.type))throw new Error('invalid_plan');
   if(proposal.action.type==='done')return finish('stopped','completion_unverified');
   emit('execute');await call(s=>execute(proposal,s));actions++;check();
   emit('verify');
  }
 }catch{
  // Never log provider exceptions, page text, values or internal endpoints.
  return finish(timedOut?'stopped':controller.signal.aborted?'cancelled':'stopped',timedOut?'deadline':controller.signal.aborted?'user_cancelled':stage==='execute'?'execution_requires_review':stage==='plan'?'planning_failed':'observation_failed');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}

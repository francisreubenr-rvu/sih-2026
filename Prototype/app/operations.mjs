import html2canvas from 'html2canvas';
import {createPageAgent} from '../shared/page-agent.mjs';
import {createVisionDetector} from '../shared/vision.mjs';
import {makeScene,paintScene} from '../shared/privacy.mjs';
import {requestSchema,validateAction} from '../shared/protocol.mjs';
import {runTask} from '../shared/task-loop.mjs';
import {createLocalValueVault} from '../shared/local-values.mjs';
import {localReferenceRequestSchema,validateLocalReferenceAction} from '../shared/local-reference-protocol.mjs';

const $=id=>document.getElementById(id),frame=$('fixture');
const fixtureUrl=new URL('/app/operations-fixture.html',location.href).href;
let active=null;
function current(r){if(active!==r||r.closed||r.controller.signal.aborted)throw new Error('Run inactive');const doc=frame.contentDocument;if(doc!==r.doc||doc?.URL!==fixtureUrl||doc.readyState!=='complete')throw new Error('Fixture changed');return doc;}
function publish(r){$('record').textContent=JSON.stringify(r.record,null,2);$('payload').textContent=JSON.stringify(r.requests,null,2);}
function event(r,text){if(active!==r||r.closed)return;const li=document.createElement('li');li.textContent=text;$('trace').append(li);$('status').textContent=text;}
function reset(signal){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>done(new Error('Fixture unavailable')),10000);const load=()=>done(),abort=()=>done(new Error('Cancelled'));function done(error){clearTimeout(timeout);frame.removeEventListener('load',load);signal.removeEventListener('abort',abort);error?reject(error):resolve();}frame.addEventListener('load',load,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();frame.src=fixtureUrl;});}
async function finish(r,status,reason){
 if(r.finishing)return r.finishing;
 r.closed=true;r.controller.abort();clearTimeout(r.deadline);clearInterval(r.expiry);r.vault?.revoke();r.agent?.dispose();r.auth=null;r.target=null;r.prepared=null;r.proposal=null;$('confirm').disabled=true;$('stop').disabled=true;
 r.record.status=status;r.record.reason=reason;r.record.elapsedMs=performance.now()-r.started;r.record.finishedAt=new Date().toISOString();publish(r);
 $('status').textContent=status==='completed'?'The synthetic contact draft is ready. Nothing was submitted.':status==='cancelled'?'Stopped. No further action is authorized.':'Run stopped. Inspect the draft, then start a new simulation.';
 r.finishing=(async()=>{try{const vision=await r.visionPromise;await vision?.dispose();}catch{r.record.cleanup='vision_unavailable_or_cleanup_failed';publish(r);}if(active===r){active=null;$('start').disabled=false;}})();return r.finishing;
}
async function capture(r){
 const doc=current(r);r.visionPromise??=createVisionDetector();const vision=await r.visionPromise;current(r);let raw;
 try{
  raw=await html2canvas(doc.body,{logging:false,scale:1,width:frame.contentWindow.innerWidth,height:frame.contentWindow.innerHeight,windowWidth:frame.contentWindow.innerWidth,windowHeight:frame.contentWindow.innerHeight,useCORS:false,allowTaint:false});current(r);
  const scene=r.agent.collect(),faces=await vision.detect(raw);current(r);r.agent.assertFresh(scene.revision);for(const f of faces.detections)scene.regions.push({kind:'face',rect:{x:f.x,y:f.y,width:f.width,height:f.height}});
  const protectedScene=makeScene(scene);paintScene($('protected').getContext('2d'),protectedScene);$('context-status').textContent=`${protectedScene.controls.length} approved controls · ${protectedScene.regions.length} opaque regions · ${faces.detections.length} face detections. No original pixels or private values.`;
  r.record.captures.push({controls:protectedScene.controls.length,regions:protectedScene.regions.length,faces:faces.detections.length,inferenceMs:faces.inferenceMs});return protectedScene;
 }finally{if(raw){raw.width=0;raw.height=0;}}
}
async function plan(r,endpoint,request,signal){
 current(r);if(!r.auth){const session=await fetch('/api/v1/session',{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});if(!session.ok)throw new Error('Pairing unavailable');r.auth=(await session.json()).data.token;}
 current(r);r.agent.assertFresh(request.scene.revision);r.requests.push({endpoint,request});publish(r);
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${r.auth}`},body:JSON.stringify(request),signal:AbortSignal.any([signal,AbortSignal.timeout(28000)])});if(!response.ok)throw new Error('Planner unavailable');const {data}=await response.json();current(r);r.agent.assertFresh(data.revision);if(data.revision!==request.scene.revision)throw new Error('Revision mismatch');r.record.plans.push({model:data.model,mode:data.mode,latencyMs:data.latencyMs});return data;
}
function freshDraft(r,checkBinding=true){
 const doc=current(r);r.agent.assertFresh(r.prepared.scene.revision);const target=r.target;
 if(!target||target.ownerDocument!==doc||!target.isConnected||target.type!=='email'||target.value!==''||target.disabled||target.readOnly||target.matches(':disabled')||target.closest('[inert],[aria-hidden="true"]'))throw new Error('Target changed');
 const box=target.getBoundingClientRect();if(['x','y','width','height'].some(k=>Math.abs(box[k]-r.bounds[k])>2))throw new Error('Target moved');const style=doc.defaultView.getComputedStyle(target);
 if(style.visibility!=='visible'||style.display==='none'||style.pointerEvents==='none'||doc.elementFromPoint(box.x+box.width/2,box.y+box.height/2)!==target)throw new Error('Target obscured');if(checkBinding&&r.vault.size!==1)throw new Error('Reference unavailable');
}
async function prepareDraft(r){
 event(r,'Report opened. Preparing a local contact reference.');const scene=await capture(r),doc=current(r);r.target=doc.getElementById('report-contact');if(!r.target||r.target.value!=='')throw new Error('Draft unavailable');const box=r.target.getBoundingClientRect();r.bounds={x:box.x,y:box.y,width:box.width,height:box.height};r.vault=createLocalValueVault();
 const reference=r.vault.issue({value:doc.getElementById('local-email').textContent,kind:'email',target:r.target,revision:scene.revision});r.prepared=localReferenceRequestSchema.parse({scheme:'sightline-local-references-v1',task:'prepare-report-contact',scene,fields:[{id:'f0',label:'Report contact',...reference,empty:true,rect:r.bounds}]});freshDraft(r);
 const result=await plan(r,'/api/v2/local-plans',r.prepared,r.controller.signal);freshDraft(r);r.proposal=validateLocalReferenceAction(result.action,r.prepared);if(r.proposal.type!=='fill-local')throw new Error('Draft completion unverified');
 r.record.status='awaiting_confirmation';r.record.navigationVerified=true;publish(r);$('proposal').textContent='Fill the Report contact field using its one-use local reference. The email remains in the browser.';$('confirm').disabled=false;event(r,'Review the protected request, then confirm the local draft fill. Binding expires after 30 seconds.');
 r.expiry=setInterval(()=>{try{freshDraft(r);}catch{finish(r,'stopped','binding_expired_or_page_changed');}},1000);
}
$('start').addEventListener('click',async()=>{
 if(active)return;const r={controller:new AbortController(),started:performance.now(),requests:[],record:{version:'operations-simulation-v1',startedAt:new Date().toISOString(),scope:'Original synthetic Earth-observation report workflow; no real portal or submission',userAgent:navigator.userAgent,status:'running',captures:[],plans:[]}};active=r;
 $('start').disabled=true;$('stop').disabled=false;$('confirm').disabled=true;$('trace').replaceChildren();$('proposal').textContent='Opening the pending report.';publish(r);r.deadline=setTimeout(()=>finish(r,'stopped','deadline'),90000);
 try{
  await reset(r.controller.signal);r.doc=frame.contentDocument;current(r);r.agent=createPageAgent(r.doc);
  const navigation=await runTask({signal:r.controller.signal,
   onEvent(e){event(r,`${e.state} · ${e.actions} navigation actions · ${Math.round(e.elapsedMs)} ms`);},
   async observe(signal){signal.throwIfAborted();const doc=current(r);if(doc.querySelector('#content h2')?.textContent==='Observation report ready'&&doc.getElementById('report-contact'))return {complete:true,fingerprint:'synthetic-report-opened'};const scene=await capture(r);return {complete:false,fingerprint:JSON.stringify({controls:scene.controls.map(({label,rect})=>({label,rect})),regions:scene.regions}),request:requestSchema.parse({task:'review-pending',scene})};},
   async plan(snapshot,signal){const data=await plan(r,'/api/v1/plans',snapshot.request,signal);return {revision:data.revision,action:validateAction(data.action,snapshot.request.scene)};},
   async execute(proposal,signal){signal.throwIfAborted();current(r);r.agent.execute({...proposal,userConfirmed:true});}
  });current(r);r.record.navigation=navigation;if(navigation.status!=='completed')return await finish(r,'stopped',navigation.reason);await prepareDraft(r);
 }catch{if(active===r&&!r.closed)await finish(r,r.controller.signal.aborted?'cancelled':'stopped','workflow_unavailable_or_changed');}
});
$('confirm').addEventListener('click',async()=>{
 const r=active;if(!r||r.closed)return;
 try{freshDraft(r);const action=validateLocalReferenceAction(r.proposal,r.prepared);r.vault.apply({referenceId:action.referenceId,kind:'email',target:r.target,revision:r.prepared.scene.revision,userConfirmed:true},value=>{freshDraft(r,false);r.target.value=value;r.target.dispatchEvent(new r.doc.defaultView.Event('input',{bubbles:true}));if(r.target.value!==value||r.doc.getElementById('draft-status')?.dataset.complete!=='true')throw new Error('Write changed');});r.record.confirmedLocalWrite=true;r.record.localPostcondition='fixture_exact_contact_match';await finish(r,'completed','draft_postcondition_verified');}
 catch{await finish(r,'stopped','local_write_blocked_or_uncertain');}
});
$('stop').addEventListener('click',()=>{if(active)finish(active,'cancelled','user_cancelled');});
window.addEventListener('pagehide',()=>{if(active)finish(active,'cancelled','page_hidden_or_unloaded');});

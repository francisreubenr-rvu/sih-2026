import html2canvas from 'html2canvas';
import {createPageAgent} from '../shared/page-agent.mjs';
import {createVisionDetector} from '../shared/vision.mjs';
import {makeScene,paintScene} from '../shared/privacy.mjs';
import {requestSchema,validateAction} from '../shared/protocol.mjs';
import {runTask} from '../shared/task-loop.mjs';
const $=id=>document.getElementById(id),frame=$('fixture');let controller=null;
const goals={'review-pending':'Request ready for review','show-completed':'Completed requests','next-page':'Page 2'};
function fixtureDocument(){const doc=frame.contentDocument;if(!doc||doc.URL!==new URL('/app/fixture.html',location.href).href||doc.readyState!=='complete')throw new Error('Synthetic fixture unavailable');return doc;}
function resetFixture(signal){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('Fixture unavailable')),10000);const loaded=()=>finish(),cancel=()=>finish(new Error('Cancelled'));function finish(error){clearTimeout(timer);frame.removeEventListener('load',loaded);signal.removeEventListener('abort',cancel);error?reject(error):resolve();}frame.addEventListener('load',loaded,{once:true});signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)return cancel();frame.src='/app/fixture.html';});}
$('stop').addEventListener('click',()=>{controller?.abort();$('status').textContent='Stopping. No further action will be authorized.';});
$('start').addEventListener('click',async()=>{
 if(controller)return;controller=new AbortController();const signal=controller.signal,task=$('task').value;let agent,visionPromise,vision,auth,originalDocument;
 $('start').disabled=true;$('task').disabled=true;$('stop').disabled=false;$('trace').replaceChildren();$('record').textContent='Run in progress.';
 const record={version:'bounded-synthetic-loop-v1',startedAt:new Date().toISOString(),task,scope:'synthetic fixture only; real local vision and server planning when executed',completionOracle:'exact declared fixture heading',userAgent:navigator.userAgent};
 try{
  await resetFixture(signal);originalDocument=fixtureDocument();agent=createPageAgent(originalDocument);
  const result=await runTask({signal,
   onEvent(event){const item=document.createElement('li');item.textContent=`${event.state} · ${event.actions} confirmed actions · ${Math.round(event.elapsedMs)} ms${event.reason?' · '+event.reason:''}`;$('trace').append(item);$('status').textContent=item.textContent;},
   async observe(runSignal){
    const doc=fixtureDocument();if(doc!==originalDocument)throw new Error('Fixture changed');
    // Completion oracle is local and synthetic; heading text never enters the request.
    if(doc.querySelector('#content h2')?.textContent===goals[task])return {complete:true,fingerprint:'synthetic-goal-reached'};
    visionPromise??=createVisionDetector().then(value=>(vision=value));const detector=await visionPromise;runSignal.throwIfAborted();let raw;
    try{
     raw=await html2canvas(doc.body,{logging:false,scale:1,width:frame.contentWindow.innerWidth,height:frame.contentWindow.innerHeight,windowWidth:frame.contentWindow.innerWidth,windowHeight:frame.contentWindow.innerHeight,useCORS:false,allowTaint:false});runSignal.throwIfAborted();const scene=agent.collect();const faces=await detector.detect(raw);runSignal.throwIfAborted();agent.assertFresh(scene.revision);
     for(const f of faces.detections)scene.regions.push({kind:'face',rect:{x:f.x,y:f.y,width:f.width,height:f.height}});
     const request=requestSchema.parse({task,scene:makeScene(scene)});paintScene($('protected').getContext('2d'),request.scene);$('context-status').textContent=`${request.scene.controls.length} controls; ${request.scene.regions.length} opaque regions. No original pixels or field values.`;
     const fingerprint=JSON.stringify({viewport:request.scene.viewport,controls:request.scene.controls.map(({role,label,rect})=>({role,label,rect})),regions:request.scene.regions});
     return {complete:false,fingerprint,request};
    }finally{if(raw){raw.width=0;raw.height=0;}}
   },
   async plan(snapshot,runSignal){
    if(!auth){const response=await fetch('/api/v1/session',{signal:runSignal});if(!response.ok)throw new Error('Pairing unavailable');auth=(await response.json()).data.token;}
    runSignal.throwIfAborted();agent.assertFresh(snapshot.request.scene.revision);const request=requestSchema.parse(snapshot.request);
    const response=await fetch('/api/v1/plans',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:JSON.stringify(request),signal:AbortSignal.any([runSignal,AbortSignal.timeout(28000)])});if(!response.ok)throw new Error('Planner unavailable');const {data}=await response.json();runSignal.throwIfAborted();agent.assertFresh(data.revision);
    return {revision:data.revision,action:validateAction(data.action,request.scene)};
   },
   async execute(proposal,runSignal){runSignal.throwIfAborted();if(fixtureDocument()!==originalDocument)throw new Error('Fixture changed');agent.execute({...proposal,userConfirmed:true});}
  });record.result=result;
 }catch{record.result={status:signal.aborted?'cancelled':'stopped',reason:signal.aborted?'user_cancelled':'fixture_unavailable'};$('status').textContent='Run stopped before completion. Reset by starting a new synthetic run.';}
 finally{agent?.dispose();if(visionPromise)try{await visionPromise;await vision?.dispose();}catch{}auth=null;record.finishedAt=new Date().toISOString();$('record').textContent=JSON.stringify(record,null,2);controller=null;$('start').disabled=false;$('task').disabled=false;$('stop').disabled=true;}
});

import html2canvas from 'html2canvas';
import { createPageAgent } from '../shared/page-agent.mjs';
import { createVisionDetector } from '../shared/vision.mjs';
import { makeScene, paintScene } from '../shared/privacy.mjs';
import { requestSchema, validateAction } from '../shared/protocol.mjs';
const $=s=>document.querySelector(s);
const frame=$('#fixture');$('#capture').disabled=true;let pageAgent,detector,detectorPromise,prepared,plan,token,busy=false;
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error);};
const clear=()=>{prepared=null;plan=null;$('#plan').disabled=true;$('#execute').disabled=true;$('#proposal').textContent='Capture the current page before requesting an action.';};
const setBusy=value=>{busy=value;$('#capture').disabled=value;$('#reset').disabled=value;$('#task').disabled=value;};
const getToken=async()=>{if(!token){const response=await fetch('/api/v1/session');if(!response.ok)throw new Error('Local pairing failed. Reload this page from the server URL.');token=(await response.json()).data.token;}return token;};
function connect(){const doc=frame.contentDocument;if(!doc?.documentElement||!doc.body||doc.URL==='about:blank')return;pageAgent?.dispose();pageAgent=createPageAgent(doc);clear();$('#capture').disabled=false;}
frame.addEventListener('load',connect);if(frame.contentDocument?.readyState==='complete')connect();
const getDetector=()=>detectorPromise??=(createVisionDetector().then(value=>(detector=value)).catch(error=>{detectorPromise=null;throw error;}));
$('#capture').addEventListener('click',async()=>{
 if(busy)return;let raw;clear();setBusy(true);status('Loading the local vision model. Original pixels stay in this browser.');
 try {
  const vision=await getDetector();
  const start=performance.now();
  // html2canvas is only a local demonstration capture adapter. The extension uses
  // the browser's native captureVisibleTab on the real active tab.
  raw=await html2canvas(frame.contentDocument.body,{logging:false,scale:1,width:frame.contentWindow.innerWidth,height:frame.contentWindow.innerHeight,windowWidth:frame.contentWindow.innerWidth,windowHeight:frame.contentWindow.innerHeight,useCORS:false,allowTaint:false});
  const scene=pageAgent.collect();
  const faces=await vision.detect(raw);
  pageAgent.assertFresh(scene.revision);
  for(const face of faces.detections)scene.regions.push({kind:'face',rect:{x:face.x,y:face.y,width:face.width,height:face.height}});
  const safe=makeScene(scene);
  prepared=requestSchema.parse({task:$('#task').value,scene:safe});
  paintScene($('#protected').getContext('2d'),safe);
  // Release the local screenshot backing store. No image serialization or upload.
  raw.width=0;raw.height=0;
  $('#protected').hidden=false;$('#empty').hidden=true;
  $('#payload').textContent=JSON.stringify(prepared,null,2);
  const values=$('#metrics').querySelectorAll('dd');
  values[0].textContent=`${faces.inferenceMs.toFixed(1)} ms / WASM`;
  values[1].textContent=String(faces.detections.length);
  values[2].textContent=`${(new TextEncoder().encode(JSON.stringify(prepared)).length/1024).toFixed(1)} KiB`;
  $('#plan').disabled=false;
  status(`Protected in ${(performance.now()-start).toFixed(0)} ms. ${safe.controls.length} approved controls; ${safe.regions.length} opaque regions. Review the agent’s view before sending.`);
 }catch(e){clear();status(`Capture blocked: ${e.message}. Retry after the page settles.`,true);}finally{if(raw){raw.width=0;raw.height=0;}setBusy(false);}
});
$('#plan').addEventListener('click',async()=>{
 if(busy||!prepared)return;setBusy(true);$('#plan').disabled=true;plan=null;$('#execute').disabled=true;status('The local open-weight model is interpreting the protected layout.');
 try {
  const auth=await getToken();pageAgent.assertFresh(prepared.scene.revision);
  const body=requestSchema.parse(prepared);
  const response=await fetch('/api/v1/plans',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:JSON.stringify(body),signal:AbortSignal.timeout(28000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Reasoning request failed.');
  pageAgent.assertFresh(result.data.revision);
  const action=validateAction(result.data.action,prepared.scene);
  plan={revision:result.data.revision,action};
  const target=prepared.scene.controls.find(c=>c.id===action.targetId);
  $('#proposal').textContent=action.type==='click'?`Proposed: click “${target.label}” (${target.id}). Confirm only if this is the action you want.`:action.type==='scroll'?`Proposed: scroll ${action.direction}.`:'The model considers this task complete.';
  $('#execute').disabled=action.type==='done';
  status(`Model response received in ${result.data.latencyMs.toFixed(0)} ms. ${result.data.provider.model}; semantic layout mode.`);
 }catch(e){clear();status(`${e.message} Capture again to retry.`,true);}finally{setBusy(false);}
});
$('#execute').addEventListener('click',()=>{
 try{if(!plan)throw new Error('No reviewed action');pageAgent.execute({...plan,userConfirmed:true});clear();status('Action executed in the browser. Capture the new page to continue.');}
 catch(e){clear();status(e.message,true);}
});
$('#task').addEventListener('change',clear);
$('#reset').addEventListener('click',()=>{clear();frame.src='/app/fixture.html';$('#protected').hidden=true;$('#empty').hidden=false;$('#payload').textContent='No request prepared.';status('Demo reset. Capture the page to begin.');});
$('#pair').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(await getToken());status('Pairing token copied. Paste it only into your locally installed Sightline extension.');}catch{status('Clipboard access failed. Retry from this local server page.',true);}});
// Revoke the ready state while the user is reviewing, before an obsolete action
// can be offered. The executor also revalidates synchronously at click time.
setInterval(()=>{
 if(!prepared||busy)return;
 try{pageAgent.assertFresh(prepared.scene.revision);}catch{clear();status('The page changed or the review expired. Capture again before sending or executing an action.');}
},1000);

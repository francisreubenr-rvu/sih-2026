import { createVisionDetector } from '../shared/vision.mjs';
import {makeScene,paintScene} from '../shared/privacy.mjs';
import {requestSchema,validateAction} from '../shared/protocol.mjs';
const $=s=>document.querySelector(s), endpoint='http://127.0.0.1:9041/api/v1/plans';
let prepared,plan,tabId,detector,busy=false;
const status=message=>{$('#status').textContent=message;};
const clear=()=>{prepared=null;plan=null;$('#plan').disabled=true;$('#execute').disabled=true;};
const setBusy=v=>{busy=v;$('#capture').disabled=v;$('#task').disabled=v;$('#token').disabled=v;};
$('#origin').textContent=new URL(chrome.runtime.getURL('/')).origin;
chrome.storage.session?.get('pairingToken').then(v=>{if(v.pairingToken)$('#token').value=v.pairingToken;});
async function call(message){const response=await chrome.tabs.sendMessage(tabId,message);if(response?.error)throw new Error(response.error);if(!response)throw new Error('Page connection lost. Reopen the extension.');return response.data;}
$('#capture').addEventListener('click',async()=>{
 if(busy)return;clear();setBusy(true);status('Running local vision. No screen data is sent.');
 let bitmap;
 try {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab.id;
  await chrome.scripting.executeScript({target:{tabId},files:['content.js']});
  detector??=await createVisionDetector({runtimeUrl:chrome.runtime.getURL('models/ort/ort.wasm.min.mjs'),modelUrl:chrome.runtime.getURL('models/ultraface-rfb320.onnx')});
  const scene=await call({kind:'collect'});
  const dataUrl=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
  const image=new Image();image.src=dataUrl;await image.decode();bitmap=await createImageBitmap(image);
  const result=await detector.detect(bitmap);
  await call({kind:'fresh',revision:scene.revision});
  const ratioX=scene.viewport.width/bitmap.width,ratioY=scene.viewport.height/bitmap.height;
  for(const face of result.detections)scene.regions.push({kind:'face',rect:{x:face.x*ratioX,y:face.y*ratioY,width:face.width*ratioX,height:face.height*ratioY}});
  prepared=requestSchema.parse({task:$('#task').value,scene:makeScene(scene)});
  paintScene($('#preview').getContext('2d'),prepared.scene);$('#preview').hidden=false;
  $('#payload').textContent=JSON.stringify(prepared,null,2);
  $('#metrics').textContent=`${result.detections.length} face(s) detected · ${result.inferenceMs.toFixed(1)} ms WASM · ${prepared.scene.controls.length} approved controls`;
  $('#plan').disabled=false;status('Review the protected layout. Original pixels are excluded from the request.');
 }catch(e){clear();status(`Capture blocked: ${e.message}`);}finally{bitmap?.close();setBusy(false);}
});
$('#plan').addEventListener('click',async()=>{
 if(busy||!prepared)return;setBusy(true);$('#plan').disabled=true;
 try {
  const pairingToken=$('#token').value.trim();if(pairingToken.length<24)throw new Error('Paste your local pairing token first.');
  await chrome.storage.session?.set({pairingToken});
  await call({kind:'fresh',revision:prepared.scene.revision});
  status('Sending approved semantics to the local reasoning server.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${pairingToken}`},body:JSON.stringify(requestSchema.parse(prepared)),signal:AbortSignal.timeout(28000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Reasoning failed.');
  await call({kind:'fresh',revision:result.data.revision});
  const action=validateAction(result.data.action,prepared.scene);plan={action,revision:result.data.revision};
  const target=prepared.scene.controls.find(c=>c.id===action.targetId);
  $('#proposal').textContent=action.type==='click'?`Proposed: click “${target.label}”. Review the real page before confirming.`:action.type==='scroll'?`Proposed: scroll ${action.direction}.`:'Task complete.';
  $('#execute').disabled=action.type==='done';status(`Received a validated action from ${result.data.provider.model}.`);
 }catch(e){clear();status(`${e.message} Capture again to retry.`);}finally{setBusy(false);}
});
$('#execute').addEventListener('click',async()=>{try{if(!plan)return;await call({kind:'execute',plan:{...plan,userConfirmed:true}});clear();status('Action executed. Capture the new page to continue.');}catch(e){clear();status(e.message);}});
$('#task').addEventListener('change',clear);

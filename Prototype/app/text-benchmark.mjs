import {createLocalTextEngine} from '../shared/local-text-engine.mjs';
import {paintLocalTextPreview} from '../shared/text-privacy.mjs';
import {drawTextFixture,textFixtures} from './text-fixtures.mjs';
const $=id=>document.getElementById(id);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const heap=()=>performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null;
let stop=false;
$('stop').addEventListener('click',()=>{stop=true;$('stop').disabled=true;$('status').textContent='Stopping after the current local inference; no later screen will start.';});
$('run').addEventListener('click',async()=>{
 stop=false;$('run').disabled=true;$('stop').disabled=false;$('progress').value=0;
 let engine,observer;const longTasks=[];
 const record={version:'webpii-text-v1',startedAt:new Date().toISOString(),scope:'External synthetic raster diagnostic; local-only OCR/PII; no reasoning server or native extension',userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGB:navigator.deviceMemory??null,heapStart:heap(),warmups:[],rows:[],limitations:['Prior face-only raster diagnostic used the same slice; not a new independently held-out dataset','100 ordered rows include related variants from 46 source IDs','English OCR only; no general multilingual accuracy claim','JS heap excludes OCR worker and total process memory','Long tasks are not process CPU or energy measurements']};
 const publish=()=>{$('record').textContent=JSON.stringify(record,null,2);};
 try{
  const response=await fetch('/app/bench-assets/webpii-test100/text-inputs.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Input manifest unavailable');
  const bytes=await response.arrayBuffer();record.inputManifestSha256=await hash(bytes);const manifest=JSON.parse(new TextDecoder().decode(bytes));if(manifest.rows.length!==100)throw new Error('Input count differs from frozen protocol');record.dataset={name:manifest.dataset,revision:manifest.revision};
  if(PerformanceObserver.supportedEntryTypes.includes('longtask')){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({startTime:e.startTime,duration:e.duration});});observer.observe({type:'longtask',buffered:false});}
  $('status').textContent='Loading packaged local OCR/PII models…';let start=performance.now();engine=await createLocalTextEngine();record.initializationMs=performance.now()-start;record.heapAfterInitialization=heap();
  const canvas=$('source');for(let i=0;i<3&&!stop;i++){drawTextFixture(canvas,textFixtures[i]);const result=await engine.recognize(canvas);record.warmups.push({fixture:textFixtures[i].id,totalMs:result.totalMs,ocrMs:result.ocrMs,nerMs:result.nerMs});}
  for(const sample of manifest.rows){
   if(stop)break;
   const row={rowIndex:sample.row_index,sourceId:sample.source_id,variant:sample.variant,width:sample.image_width,height:sample.image_height,visibility:document.visibilityState};
   $('status').textContent=`Evaluating ${record.rows.length+1}/100 · source ${sample.source_id}`;
   let image;
   try{
    const fetched=await fetch(sample.file,{signal:AbortSignal.timeout(10000)});if(!fetched.ok)throw new Error('Image unavailable');const bytes=await fetched.arrayBuffer();row.imageSha256=await hash(bytes);if(row.imageSha256!==sample.image_sha256)throw new Error('Frozen image hash mismatch');
    start=performance.now();image=await createImageBitmap(new Blob([bytes]));row.decodeMs=performance.now()-start;if(image.width!==row.width||image.height!==row.height)throw new Error('Image dimensions mismatch');canvas.width=row.width;canvas.height=row.height;canvas.getContext('2d').drawImage(image,0,0);image.close();image=null;
    const result=await engine.recognize(canvas);Object.assign(row,result);paintLocalTextPreview($('preview').getContext('2d'),result.words,result.width,result.height);row.heap=heap();row.ok=true;
   }catch(error){row.ok=false;row.error=String(error.message||error);}finally{image?.close();}
   record.rows.push(row);$('progress').value=record.rows.length;if(record.rows.length%5===0)publish();await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  record.status=stop?'cancelled':'completed';
 }catch(error){record.status='failed';record.error=String(error.message||error);}
 finally{
  try{await engine?.dispose();}catch(error){record.cleanupError=String(error.message||error);record.status='failed';}
  observer?.disconnect();record.longTasks=longTasks;record.heapAfterDispose=heap();record.resources=performance.getEntriesByType('resource').filter(e=>e.name.includes('/models/')).map(e=>({path:new URL(e.name).pathname,duration:e.duration,encodedBodySize:e.encodedBodySize,transferSize:e.transferSize}));record.finishedAt=new Date().toISOString();publish();$('run').disabled=false;$('stop').disabled=true;$('status').textContent=`${record.status}: ${record.rows.filter(r=>r.ok).length}/${record.rows.length} attempted screens executed. Independent scoring required.`;
 }
});

import {createLocalTextEngine} from '../shared/local-text-engine.mjs';
import {paintLocalTextPreview} from '../shared/text-privacy.mjs';
import {textFixtures,drawTextFixture,scoreTextFixture} from './text-fixtures.mjs';
const $=id=>document.getElementById(id),button=$('run');
drawTextFixture($('source'),textFixtures[0]);
button.addEventListener('click',async()=>{
 button.disabled=true;$('rows').replaceChildren();$('progress').value=0;let engine;
 const record={version:'local-text-pilot-v1',startedAt:new Date().toISOString(),scope:'three authored English synthetic development screens; no server reasoning or native extension',userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,results:[]};
 const publish=()=>{$('record').textContent=JSON.stringify(record,null,2);};
 try{
  $('status').textContent='Loading local OCR and PII models…';const start=performance.now();engine=await createLocalTextEngine();record.initializationMs=performance.now()-start;
  for(const fixture of textFixtures){
   $('status').textContent=`Inspecting ${fixture.id} locally…`;const expected=drawTextFixture($('source'),fixture);const result=await engine.recognize($('source'));paintLocalTextPreview($('preview').getContext('2d'),result.words,result.width,result.height);const score=scoreTextFixture(expected,result.words);
   record.results.push({id:fixture.id,...result,score});const row=document.createElement('tr');for(const value of [fixture.id,`${score.piiDetected}/${score.piiTokens}`,`${score.usefulRetained}/${score.usefulTokens}`,`${Math.round(result.totalMs)} ms`]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}$('rows').append(row);$('progress').value++;publish();
  }
  record.status='completed';$('status').textContent='Evaluation complete. Inspect misses before considering any integration.';
 }catch(error){record.status='failed';record.error=String(error.message||error);$('status').textContent='Evaluation failed. No text was sent to a reasoning server.';}
 finally{if(engine)try{await engine.dispose();}catch(error){record.cleanupError=String(error.message||error);record.status='failed';$('status').textContent='Evaluation failed during cleanup.';}record.finishedAt=new Date().toISOString();publish();button.disabled=false;}
});

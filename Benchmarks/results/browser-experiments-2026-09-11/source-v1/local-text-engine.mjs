import {createWorker,PSM} from 'tesseract.js';
import {Tokenizer} from '@huggingface/tokenizers';
import {flattenOcrWords,packWordTokens,decodeTokenLabels,localWordPolicy} from './text-privacy.mjs';
export async function createLocalTextEngine(){
 const json=async name=>{const r=await fetch('/models/pii/'+name,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Local PII model configuration unavailable');return r.json();};
 const [vocab,tokenConfig,config]=await Promise.all([json('tokenizer.json'),json('tokenizer_config.json'),json('config.json')]);const tokenizer=new Tokenizer(vocab,tokenConfig);
 const ort=await import(/* @vite-ignore */ '/models/ort/ort.wasm.min.mjs');ort.env.wasm.wasmPaths=new URL('/models/ort/',location.href).href;ort.env.wasm.numThreads=1;
 let session,worker,disposed=false,active=null,disposal=null;
 try{
  session=await ort.InferenceSession.create('/models/pii/model_int8.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  worker=await createWorker('eng',1,{workerPath:'/models/ocr/worker.min.js',corePath:'/models/ocr/core',langPath:'/models/ocr/lang',workerBlobURL:false,gzip:false,cacheMethod:'none',logger:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
 }catch(error){await Promise.allSettled([session?.release(),worker?.terminate()]);throw error;}
 async function recognize(source){
  const width=source.width,height=source.height;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw new Error('Invalid OCR image');
  const start=performance.now();const {data}=await worker.recognize(source,{}, {text:false,blocks:true});const ocrMs=performance.now()-start;const words=flattenOcrWords(data,width,height),labels=new Map();const nerStart=performance.now();
  for(const chunk of packWordTokens(words,tokenizer)){
   const inputs={},owned=new Set();let output;
   try{
    for(const name of session.inputNames){const values=name==='input_ids'?chunk.ids:name==='attention_mask'?chunk.ids.map(()=>1):name==='token_type_ids'?chunk.ids.map(()=>0):null;if(!values)throw new Error('Unknown PII model input');const tensor=new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,values.length]);owned.add(tensor);inputs[name]=tensor;}
    output=await session.run(inputs);for(const t of Object.values(output))owned.add(t);const logits=output.logits||Object.values(output)[0];for(const [i,label]of decodeTokenLabels(logits.data,logits.dims,chunk.wordIndices,config.id2label))if(!labels.has(i)||labels.get(i).confidence<label.confidence)labels.set(i,label);
   }finally{for(const t of owned)t.dispose();}
  }
  return {width,height,words:localWordPolicy(words,labels),ocrMs,nerMs:performance.now()-nerStart,totalMs:performance.now()-start,mode:'local-only-preview',model:'bert-small-pii-detection-int8',language:'eng'};
 }
 return {async recognize(source){if(disposed)throw new Error('Text engine disposed');if(active)throw new Error('Text engine busy');active=recognize(source);try{return await active;}finally{active=null;}},dispose(){if(disposal)return disposal;disposed=true;disposal=(async()=>{if(active)try{await active;}catch{}const results=await Promise.allSettled([worker.terminate(),session.release()]);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;})();return disposal;}};
}

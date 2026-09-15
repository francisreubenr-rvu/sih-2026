import {createVisionDetector} from './vision.mjs';
let detector,initializing;
self.onmessage=async({data})=>{
 const {id,type,bitmap,runtimeUrl,modelUrl}=data;let result;
 try{
  if(type==='init'){
   const opts={};
   if(runtimeUrl)opts.runtimeUrl=runtimeUrl;
   if(modelUrl)opts.modelUrl=modelUrl;
   initializing??=createVisionDetector(opts);
   detector=await initializing;result={ready:true};
  }
  else if(type==='detect'){if(!detector)throw new Error('Vision worker not initialized');result=await detector.detect(bitmap);}
  else throw new Error('Unknown worker operation');
  self.postMessage({id,ok:true,result});
 }catch(error){self.postMessage({id,ok:false,error:error.message});}
 finally{bitmap?.close();}
};

import {createVisionDetector} from './vision.mjs';
let detector,initializing;
self.onmessage=async({data})=>{
 const {id,type,bitmap}=data;let result;
 try{
  if(type==='init'){initializing??=createVisionDetector();detector=await initializing;result={ready:true};}
  else if(type==='detect'){if(!detector)throw new Error('Vision worker not initialized');result=await detector.detect(bitmap);}
  else throw new Error('Unknown worker operation');
  self.postMessage({id,ok:true,result});
 }catch(error){self.postMessage({id,ok:false,error:error.message});}
 finally{bitmap?.close();}
};

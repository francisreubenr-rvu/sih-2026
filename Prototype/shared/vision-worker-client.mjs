// Raw pixels cross only an in-browser worker boundary; never a network boundary.
export async function createWorkerVisionDetector({workerUrl='/dist/vision-worker.js',WorkerImpl=Worker,bitmapFactory=createImageBitmap,timeoutMs=30000}={}){
 const worker=new WorkerImpl(workerUrl,{type:'module'});let nextId=0,disposed=false,active=false,releasePromise;const pending=new Map();
 const failAll=error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();};
 worker.onerror=()=>{disposed=true;failAll(new Error('Local vision worker failed'));worker.terminate();};
 worker.onmessage=({data})=>{const entry=pending.get(data?.id);if(!entry)return;pending.delete(data.id);clearTimeout(entry.timer);data.ok?entry.resolve(data.result):entry.reject(new Error(data.error||'Local vision failed'));};
 const request=(type,extra={},transfer=[])=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);disposed=true;worker.terminate();const error=new Error('Local vision worker timed out');reject(error);failAll(error);},timeoutMs);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,type,...extra},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
 try{await request('init');}catch(error){worker.terminate();throw error;}
 return {
  async detect(source){
   if(disposed)throw new Error('Detector disposed');if(active)throw new Error('Detector busy');active=true;let bitmap;
   try{bitmap=await bitmapFactory(source);if(disposed)throw new Error('Detector disposed');return await request('detect',{bitmap},[bitmap]);}
   finally{bitmap?.close();active=false;}
  },
  dispose(){
   if(releasePromise)return releasePromise;disposed=true;
   // Termination discards worker pixels/tensors even if inference or bitmap creation is active.
   releasePromise=Promise.resolve().then(()=>{failAll(new Error('Detector disposed'));worker.terminate();});return releasePromise;
  }
 };
}

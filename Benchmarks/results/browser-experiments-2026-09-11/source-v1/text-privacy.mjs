// OCR and PII labels are local evidence, never permission to export arbitrary text.
export function flattenOcrWords(data,width,height){
 const words=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[]){
  const {x0,y0,x1,y1}=word.bbox||{};
  if(![x0,y0,x1,y1,word.confidence].every(Number.isFinite)||x1<=x0||y1<=y0)throw new Error('Invalid OCR geometry');
  if(typeof word.text!=='string'||word.text.length>512)throw new Error('Invalid OCR word');
  const x=Math.max(0,x0),y=Math.max(0,y0),right=Math.min(width,x1),bottom=Math.min(height,y1);
  if(right>x&&bottom>y)words.push({text:word.text,confidence:word.confidence,rect:{x,y,width:right-x,height:bottom-y}});
 }
 if(words.length>3000)throw new Error('OCR word limit exceeded');return words;
}
export function packWordTokens(words,tokenizer,maxTokens=192,overlap=32){
 if(!Number.isInteger(maxTokens)||maxTokens<4||maxTokens>512||!Number.isInteger(overlap)||overlap<0||overlap>=maxTokens-2)throw new Error('Invalid token window');
 const tokens=[];
 for(const [wordIndex,word]of words.entries()){
  const {ids}=tokenizer.encode(word.text,{add_special_tokens:false});
  if(!ids.length||ids.length>128||!ids.every(id=>Number.isInteger(id)&&id>=0))throw new Error('Unrepresentable OCR word');
  for(const id of ids)tokens.push({id,wordIndex});
 }
 const chunks=[];const size=maxTokens-2;
 for(let start=0;start<tokens.length;start+=size-overlap){const part=tokens.slice(start,start+size);chunks.push({ids:[101,...part.map(t=>t.id),102],wordIndices:[null,...part.map(t=>t.wordIndex),null]});if(start+size>=tokens.length)break;}
 return chunks;
}
export function decodeTokenLabels(logits,shape,wordIndices,id2label,threshold=.5){
 if(shape.length!==3||shape[0]!==1||shape[1]!==wordIndices.length||shape[2]!==Object.keys(id2label).length||logits.length!==shape[1]*shape[2])throw new Error('Invalid PII model output');
 const labels=new Map(),classes=shape[2];
 for(let i=0;i<shape[1];i++){
  const scores=Array.from(logits.subarray(i*classes,(i+1)*classes));if(!scores.every(Number.isFinite))throw new Error('Invalid PII model scores');
  const max=Math.max(...scores);const probs=scores.map(x=>Math.exp(x-max));const sum=probs.reduce((a,b)=>a+b,0);const index=scores.indexOf(max),confidence=probs[index]/sum,label=id2label[index],wordIndex=wordIndices[i];
  if(wordIndex===null||label==='O'||confidence<threshold)continue;
  if(!labels.has(wordIndex)||labels.get(wordIndex).confidence<confidence)labels.set(wordIndex,{kind:label.replace(/^[BI]-/,''),confidence});
 }
 return labels;
}
export function localWordPolicy(words,modelLabels){
 return words.map((word,index)=>{
  const label=modelLabels.get(index);const t=word.text;
  const rule=/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(t)?'EMAIL_ADDRESS':/(?:\d[\d\s().-]{5,}\d)/.test(t)?'NUMBER':null;
  return {...word,sensitive:Boolean(label||rule),kind:label?.kind||rule||null,piiConfidence:label?.confidence??(rule?1:null)};
 });
}
export function paintLocalTextPreview(ctx,words,width,height){
 ctx.canvas.width=width;ctx.canvas.height=height;ctx.fillStyle='#f1f2ee';ctx.fillRect(0,0,width,height);
 for(const w of words){const r=w.rect;if(w.sensitive||w.confidence<70){ctx.fillStyle='#414b44';ctx.fillRect(Math.max(0,r.x-2),Math.max(0,r.y-2),r.width+4,r.height+4);continue;}
  ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.width,r.height);ctx.clip();ctx.font=`${Math.max(8,r.height)}px sans-serif`;ctx.textBaseline='top';ctx.fillStyle='#15211f';ctx.fillText(w.text,r.x,r.y,r.width);ctx.restore();
 }
}

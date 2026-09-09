import {createPageAgent} from '../shared/page-agent.mjs';
const $=s=>document.querySelector(s);
const assert=(condition,message='Assertion failed')=>{if(!condition)throw new Error(message);};
const rejects=(fn,pattern)=>{try{fn();}catch(e){assert(pattern.test(e.message),`Unexpected failure: ${e.message}`);return;}throw new Error('Expected rejection; action was accepted');};
async function fixture(run){
 const iframe=document.createElement('iframe');iframe.title='Isolated synthetic boundary fixture';
 const ready=new Promise((resolve,reject)=>{iframe.onload=resolve;iframe.onerror=()=>reject(new Error('Fixture failed to load'));});
 iframe.src='/app/validation-fixture.html';$('#fixture-mount').replaceChildren(iframe);$('#fixture-mount').classList.add('active');await ready;
 const doc=iframe.contentDocument,root=doc.querySelector('#fixture');let clicks=0;
 const button=(label='Pending',parent=root)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>clicks++);parent.append(b);return b;};
 const agent=createPageAgent(doc);
 const execute=(scene,id=scene.controls[0]?.id,confirmed=true)=>agent.execute({revision:scene.revision,action:{type:'click',targetId:id},userConfirmed:confirmed});
 try{await run({iframe,doc,root,agent,button,execute,clicks:()=>clicks});}
 finally{agent.dispose();iframe.remove();$('#fixture-mount').classList.remove('active');}
}
const checks=[
 ['confirmed target executes once',async f=>{f.button();const s=f.agent.collect();f.execute(s);assert(f.clicks()===1);rejects(()=>f.execute(s),/changed|expired/);} ],
 ['confirmation is required',async f=>{f.button();const s=f.agent.collect();rejects(()=>f.execute(s,s.controls[0].id,false),/confirm/);assert(f.clicks()===0);} ],
 ['new capture revokes previous revision',async f=>{f.button();const a=f.agent.collect(),b=f.agent.collect();assert(a.revision!==b.revision);rejects(()=>f.execute(a),/changed|expired/);} ],
 ['queued document mutation revokes action',async f=>{const b=f.button();const s=f.agent.collect();b.textContent='Completed';rejects(()=>f.execute(s),/changed|expired/);assert(f.clicks()===0);} ],
 ['open shadow target executes',async f=>{const host=f.doc.createElement('div');host.id='shadow-host';f.root.append(host);const shadow=host.attachShadow({mode:'open'});f.button('Pending',shadow);const s=f.agent.collect();assert(s.controls.length===1);f.execute(s);assert(f.clicks()===1);} ],
 ['queued open-shadow mutation revokes action',async f=>{const host=f.doc.createElement('div');f.root.append(host);const shadow=host.attachShadow({mode:'open'}),b=f.button('Pending',shadow);const s=f.agent.collect();b.setAttribute('aria-label','Completed');rejects(()=>f.execute(s),/changed|expired/);} ],
 ['newly attached shadow root revokes action',async f=>{f.button();const host=f.doc.createElement('div');f.root.append(host);const s=f.agent.collect();host.attachShadow({mode:'open'});rejects(()=>f.execute(s),/changed|expired/);} ],
 ['document overlay prevents click',async f=>{f.button();const overlay=f.doc.createElement('div');overlay.id='overlay';f.root.append(overlay);const s=f.agent.collect();rejects(()=>f.execute(s),/obscured/);assert(f.clicks()===0);} ],
 ['shadow overlay prevents click',async f=>{const host=f.doc.createElement('div');f.root.append(host);const shadow=host.attachShadow({mode:'open'});f.button('Pending',shadow);const overlay=f.doc.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:white;z-index:100';shadow.append(overlay);const s=f.agent.collect();rejects(()=>f.execute(s),/obscured/);assert(f.clicks()===0);} ],
 ['CSSOM geometry change revokes action',async f=>{f.button();const s=f.agent.collect();f.doc.styleSheets[0].insertRule('button { width: 240px !important; }',0);rejects(()=>f.execute(s),/Target changed/);assert(f.clicks()===0);} ],
 ['clipped target uses original bounds',async f=>{const b=f.button();b.className='clipped';const s=f.agent.collect();assert(s.controls[0].rect.x===0);f.execute(s);assert(f.clicks()===1);} ],
 ['disabled fieldset excludes child button',async f=>{const field=f.doc.createElement('fieldset');field.disabled=true;f.root.append(field);f.button('Pending',field);assert(f.agent.collect().controls.length===0);} ],
 ['inert ancestor excludes child button',async f=>{const parent=f.doc.createElement('div');parent.inert=true;f.root.append(parent);f.button('Pending',parent);assert(f.agent.collect().controls.length===0);} ],
 ['navigation target requires manual handling',async f=>{const a=f.doc.createElement('a');a.href='#synthetic';a.textContent='Pending';f.root.append(a);const s=f.agent.collect();rejects(()=>f.execute(s),/manual click/);} ],
 ['form submission requires manual handling',async f=>{const form=f.doc.createElement('form');f.root.append(form);const b=f.button('Pending',form);b.type='submit';form.addEventListener('submit',e=>e.preventDefault());const s=f.agent.collect();rejects(()=>f.execute(s),/manual click/);assert(f.clicks()===0);} ],
 ['source PII and closed shadow text excluded',async f=>{f.button();const p=f.doc.createElement('p');p.textContent='synthetic.private@example.test Account 123456789012';f.root.append(p);const input=f.doc.createElement('input');input.type='password';input.value='synthetic-secret';f.root.append(input);const host=f.doc.createElement('div');f.root.append(host);host.attachShadow({mode:'closed'}).textContent='closed-secret';const s=f.agent.collect(),raw=JSON.stringify(s);for(const secret of ['synthetic.private','123456789012','synthetic-secret','closed-secret'])assert(!raw.includes(secret));assert(f.agent.detectionCounts.email===1);assert(f.agent.detectionCounts.password===1);} ],
 ['failed collection revokes earlier authority',async f=>{f.button();const s=f.agent.collect();const fragment=f.doc.createDocumentFragment();for(let i=0;i<12001;i++)fragment.append(f.doc.createElement('span'));f.root.append(fragment);rejects(()=>f.agent.collect(),/complex/);rejects(()=>f.execute(s),/complex|changed|expired/);assert(f.clicks()===0);} ],
];
let record={scope:'actual browser DOM on authored synthetic fixtures; no native extension, provider or population privacy claim',userAgent:navigator.userAgent,checks:[]};
const add=(name,ok,detail,ms)=>{const row={name,pass:ok,detail,ms};record.checks.push(row);const tr=document.createElement('tr');for(const value of [name,ok?'PASS':'FAIL',detail]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tr.className=ok?'pass':'fail';$('#results').append(tr);$('#record').textContent=JSON.stringify(record,null,2);};
async function run(items){$('#run').disabled=$('#expiry').disabled=true;
 for(const [name,fn]of items){$('#status').textContent=`Running: ${name}`;const start=performance.now();try{await fixture(fn);add(name,true,'Expected browser behavior observed',performance.now()-start);}catch(e){add(name,false,e.message,performance.now()-start);}}
 record.finishedAt=new Date().toISOString();$('#record').textContent=JSON.stringify(record,null,2);$('#status').textContent=`${record.checks.filter(x=>x.pass).length}/${record.checks.length} browser checks passed.`;$('#run').disabled=$('#expiry').disabled=false;
}
$('#run').addEventListener('click',()=>{record={...record,checks:[]};$('#results').replaceChildren();run(checks);});
$('#expiry').addEventListener('click',()=>run([['31-second capture expiry',async f=>{f.button();const s=f.agent.collect();await new Promise(resolve=>setTimeout(resolve,31000));rejects(()=>f.execute(s),/expired/);assert(f.clicks()===0);}]]));

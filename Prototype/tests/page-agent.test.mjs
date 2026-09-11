import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAgent} from '../shared/page-agent.mjs';
import {clipRect} from '../shared/privacy.mjs';

// Deliberately small DOM double: this verifies authorization decisions, not
// native browser rendering, event retargeting or extension behavior.
function fixture() {
  const listeners=new Map();let observer;
  function element(tag='BUTTON',text='Pending',rect={x:10,y:10,width:80,height:44}) {
    const el={nodeType:1,tagName:tag,textContent:text,rect:{...rect},children:[],attrs:{},style:{display:'block',visibility:'visible',pointerEvents:'auto',backgroundImage:'none'},isConnected:true,type:'button',clicks:0,
      getAttribute(key){return this.attrs[key]??null;},getBoundingClientRect(){return this.rect;},matches(){return Boolean(this.disabledByAncestor);},getRootNode(){return this.root??doc;},click(){this.clicks++;},querySelectorAll(){return descendants(this);}};
    return el;
  }
  function descendants(root){return root.children.flatMap(el=>[el,...descendants(el)]);}
  function add(parent,el){parent.children.push(el);el.parentElement=parent.nodeType===1?parent:null;el.root=parent.nodeType===11?parent:(parent.root??doc);return el;}
  const doc={nodeType:9,children:[],addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);},querySelectorAll(){return descendants(this);},elementFromPoint(){return this.hit;},createTreeWalker(root){const nodes=[root,...descendants(root)];let i=0;return {currentNode:root,nextNode(){return nodes[++i]??null;}}},createRange(){return {selectNodeContents(){},getClientRects(){return [{x:30,y:50,width:150,height:20}];}}}};
  const win={innerWidth:800,innerHeight:600,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);},getComputedStyle(el){return el.style;},scrollBy(options){this.scroll=options;},MutationObserver:class {
    constructor(fn){this.fn=fn;this.roots=new Set();this.records=[];observer=this;}
    observe(root){this.roots.add(root);}
    disconnect(){this.roots.clear();this.records=[];}
    takeRecords(){return this.records.splice(0);}
    mutate(root){if(this.roots.has(root))this.records.push({type:'characterData'});}
  }};
  doc.defaultView=win;doc.body=add(doc,element('BODY','',{x:0,y:0,width:800,height:600}));doc.documentElement=doc.body;
  const button=add(doc.body,element());doc.hit=button;
  function shadow(host){const root={nodeType:11,children:[],host,querySelectorAll(){return descendants(this);},elementFromPoint(){return this.hit;}};host.shadowRoot=root;return root;}
  return {doc,win,button,add,element,shadow,agent:()=>createPageAgent(doc),get observer(){return observer;}};
}
const click=(agent,scene)=>agent.execute({revision:scene.revision,action:{type:'click',targetId:'c0'},userConfirmed:true});

test('fresh confirmed target executes once, with a unique revision per capture',()=>{
 const f=fixture(),agent=f.agent(),first=agent.collect(),second=agent.collect();
 assert.notEqual(first.revision,second.revision);assert.throws(()=>click(agent,first),/changed/);
 assert.equal(click(agent,second).status,'executed');assert.equal(f.button.clicks,1);
 assert.throws(()=>click(agent,second),/changed/);agent.dispose();
});
test('unconfirmed and unknown actions never click',()=>{
 const f=fixture(),agent=f.agent(),scene=agent.collect();
 assert.throws(()=>agent.execute({revision:scene.revision,action:{type:'click',targetId:'c0'}}),/confirm/);
 assert.throws(()=>agent.execute({revision:scene.revision,userConfirmed:true,action:{type:'click',targetId:'c9'}}),/Unknown/);
 assert.equal(f.button.clicks,0);agent.dispose();
});
test('open shadow roots are observed and queued mutations revoke prior snapshots',()=>{
 const f=fixture();f.doc.body.children=[];
 const host=f.add(f.doc.body,f.element('DIV','')),root=f.shadow(host),button=f.add(root,f.element());
 root.hit=button;f.doc.hit=host;
 const agent=f.agent(),scene=agent.collect();assert.ok(f.observer.roots.has(root));
 f.observer.mutate(root);assert.throws(()=>click(agent,scene),/changed/);assert.equal(button.clicks,0);agent.dispose();
});
test('attaching a shadow root without a mutation record revokes a snapshot',()=>{
 const f=fixture(),host=f.add(f.doc.body,f.element('DIV','')),agent=f.agent(),scene=agent.collect();
 f.shadow(host);assert.throws(()=>agent.assertFresh(scene.revision),/changed/);agent.dispose();
});
test('shadow-root targets resolve the actual inner hit, and reject inner overlays',()=>{
 for(const overlay of [false,true]){
  const f=fixture();f.doc.body.children=[];
  const host=f.add(f.doc.body,f.element('DIV','')),root=f.shadow(host),button=f.add(root,f.element());
  f.doc.hit=host;root.hit=overlay?f.add(root,f.element('DIV','Overlay')):button;
  const agent=f.agent(),scene=agent.collect();
  if(overlay){assert.throws(()=>click(agent,scene),/obscured/);assert.equal(button.clicks,0);}
  else {click(agent,scene);assert.equal(button.clicks,1);}
  agent.dispose();
 }
});
test('nested shadow content within an approved control is a valid composed hit',()=>{
 const f=fixture(),root=f.shadow(f.button),inner=f.add(root,f.element('SPAN',''));root.hit=inner;
 const agent=f.agent(),scene=agent.collect();click(agent,scene);assert.equal(f.button.clicks,1);agent.dispose();
});
test('label, role and size changes reject even without an observer record',()=>{
 for(const change of [f=>f.button.textContent='Completed',f=>f.button.tagName='A',f=>f.button.rect.width+=20,f=>f.button.rect.height+=20,f=>f.button.rect.x+=5]){
  const f=fixture(),agent=f.agent(),scene=agent.collect();change(f);
  assert.throws(()=>click(agent,scene),/Target changed/);assert.equal(f.button.clicks,0);agent.dispose();
 }
});
test('clipped controls compare original bounds rather than clipped coordinates',()=>{
 const f=fixture();f.button.rect.x=-10;
 const agent=f.agent(),scene=agent.collect();assert.equal(scene.controls[0].rect.x,0);
 click(agent,scene);assert.equal(f.button.clicks,1);agent.dispose();
});
test('disabled fieldsets, inert parents and hidden targets cannot authorize clicks',()=>{
 for(const change of [f=>f.button.disabledByAncestor=true,f=>f.doc.body.inert=true,f=>f.button.style.visibility='hidden',f=>f.button.style.pointerEvents='none',f=>f.button.isConnected=false]){
  const f=fixture(),agent=f.agent(),scene=agent.collect();change(f);
  assert.throws(()=>click(agent,scene),/Target changed/);assert.equal(f.button.clicks,0);agent.dispose();
 }
});
test('outer overlays, links and form submission require manual handling',()=>{
 for(const change of [f=>f.doc.hit=f.element('DIV','overlay'),f=>{f.button.tagName='A';},f=>{f.button.type='submit';f.button.form={};}]){
  const f=fixture();change(f);const agent=f.agent(),scene=agent.collect();
  assert.throws(()=>click(agent,scene),/obscured|manual click/);assert.equal(f.button.clicks,0);agent.dispose();
 }
});
test('a failed capture revokes earlier exported scene and disposal revokes all use',()=>{
 const f=fixture(),agent=f.agent(),scene=agent.collect();
 for(let i=0;i<201;i++)f.add(f.doc.body,f.element());
 assert.throws(()=>agent.collect());assert.throws(()=>click(agent,scene),/changed/);
 agent.dispose();assert.throws(()=>agent.collect(),/disposed/);assert.throws(()=>agent.assertFresh(scene.revision),/disposed/);
});
test('arbitrary text and closed-shadow secrets never enter the scene',()=>{
 const f=fixture();f.button.textContent='synthetic.private@example.test';
 const host=f.add(f.doc.body,f.element('DIV',''));
 host.closedRoot={secret:'synthetic.private@example.test'};
 const agent=f.agent(),scene=agent.collect();assert.equal(scene.controls.length,0);
 assert.doesNotMatch(JSON.stringify(scene),/synthetic|secret|closedRoot/);agent.dispose();
});
test('invalid rectangle padding or dimensions cannot become exportable geometry',()=>{
 const rect={x:1,y:1,width:20,height:20},viewport={width:800,height:600};
 for(const padding of [NaN,Infinity,-1])assert.equal(clipRect(rect,viewport,padding),null);
 assert.equal(clipRect({...rect,width:-1},viewport,20),null);
});

test('a document that is not yet an observable target is rejected before observe',()=>{
 const f=fixture();
 // Mid-navigation frames can hand back a document with the right shape but no
 // observable node type. createPageAgent must throw a clear error, not call
 // MutationObserver.observe with an invalid target.
 const unobservable={defaultView:f.win,nodeType:0,children:[],addEventListener(){},removeEventListener(){}};
 assert.throws(()=>createPageAgent(unobservable),/document or shadow root/);
 // A missing window is also rejected explicitly rather than crashing later.
 assert.throws(()=>createPageAgent({nodeType:9,defaultView:null,children:[],addEventListener(){},removeEventListener(){}}),/attached document/);
});

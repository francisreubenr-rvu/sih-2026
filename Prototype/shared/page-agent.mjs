import { makeScene, clipRect, classifySensitive } from './privacy.mjs';
import { SAFE_LABELS, validateAction } from './protocol.mjs';

const OBSERVER_OPTIONS = {subtree:true,childList:true,characterData:true,attributes:true};
const MAX_NODES = 12000;
// Documents (9), elements (1) and shadow roots (11) are the only valid observe targets.
// A frame mid-navigation can hand back a document that is not yet observable.
const OBSERVABLE_NODE_TYPES = new Set([1, 9, 11]);
const observableRoot = value => Boolean(value) && OBSERVABLE_NODE_TYPES.has(value.nodeType);
function controlIdentity(el) {
  const role = el.tagName==='BUTTON' || el.getAttribute('role')==='button' ? 'button' : el.tagName==='A' ? 'link' : null;
  const candidate=(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ');
  return {role,label:SAFE_LABELS.find(x=>x.toLowerCase()===candidate.toLowerCase())};
}
function unavailable(el, win) {
  if(!el?.isConnected || el.disabled || el.matches(':disabled') || el.getAttribute('aria-disabled')==='true') return true;
  for(let node=el;node;node=node.assignedSlot||node.parentElement||node.getRootNode()?.host) {
    if(node.inert || node.getAttribute('aria-hidden')==='true') return true;
  }
  const style=win.getComputedStyle(el);
  return style.display==='none'||style.visibility!=='visible'||style.pointerEvents==='none';
}
function sameRect(a,b) {
  return ['x','y','width','height'].every(key=>Number.isFinite(a[key])&&Math.abs(a[key]-b[key])<=2);
}
function deepestHit(doc,x,y) {
  let hit=doc.elementFromPoint(x,y);
  const seen=new Set();
  while(hit?.shadowRoot) {
    if(seen.has(hit)||typeof hit.shadowRoot.elementFromPoint!=='function') return null;
    seen.add(hit);
    const inner=hit.shadowRoot.elementFromPoint(x,y);
    if(!inner || inner===hit) return null;
    hit=inner;
  }
  return hit;
}
function composedContains(el,hit) {
  for(let node=hit;node;node=node.assignedSlot||node.parentElement||node.getRootNode()?.host) if(node===el)return true;
  return false;
}

export function createPageAgent(doc = document) {
  const win = doc.defaultView;
  let revision = crypto.randomUUID();
  let controls = new Map();
  let scene = null;
  let capturedAt = 0;
  let mutationCount = 0;
  let detections = [];
  let disposed=false;
  let observedRoots=new Set();
  const invalidate = () => { revision = crypto.randomUUID(); mutationCount++; };
  if(!win) throw new Error('Page agent needs an attached document.');
  if(!observableRoot(doc)) throw new Error('Page agent needs a document or shadow root.');
  const observer = new win.MutationObserver(invalidate);
  observer.observe(doc, OBSERVER_OPTIONS);
  win.addEventListener('scroll', invalidate, true);
  win.addEventListener('resize', invalidate);
  doc.addEventListener('input', invalidate, true);
  doc.addEventListener('change', invalidate, true);
  const flush = () => { if (observer.takeRecords().length) invalidate(); };
  // MutationObserver does not cross shadow boundaries or report attachShadow().
  // Discover roots explicitly, including roots inside otherwise hidden elements.
  function shadowRoots() {
    const roots=new Set();let visited=0;
    function scan(root) {
      for(const el of root.querySelectorAll('*')) {
        if(++visited>MAX_NODES) throw new Error('Page too complex. No context exported.');
        if(el.shadowRoot){roots.add(el.shadowRoot);scan(el.shadowRoot);}
      }
    }
    scan(doc);return roots;
  }
  function collect() {
    if(disposed)throw new Error('Page agent disposed');
    flush();invalidate();scene=null;controls=new Map();detections=[];
    const roots=shadowRoots();
    observer.disconnect();
    if(observableRoot(doc)) observer.observe(doc,OBSERVER_OPTIONS);
    for(const root of roots) if(observableRoot(root)) observer.observe(root,OBSERVER_OPTIONS);
    observedRoots=roots;
    const viewport = {width:win.innerWidth,height:win.innerHeight};
    const regions = []; const entries = []; const nextControls = new Map();
    let visited = 0;
    const region = (kind, rect) => { const r=clipRect(rect,viewport); if(r) regions.push({kind,rect:r}); };
    function visit(root) {
      const walker=doc.createTreeWalker(root,win.NodeFilter.SHOW_ELEMENT|win.NodeFilter.SHOW_TEXT);
      let node=walker.currentNode;
      do {
        if (++visited > MAX_NODES) throw new Error('Page too complex. No context exported.');
        if (node.nodeType === 3) {
          if (!node.textContent.trim() || ['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(node.parentElement?.tagName)) continue;
          for(const kind of classifySensitive(node.textContent)) detections.push({kind});
          const range=doc.createRange();range.selectNodeContents(node);
          for (const r of range.getClientRects()) region('private',r);
        } else if(node.nodeType === 1) {
          const el=node;const style=win.getComputedStyle(el); const rect=el.getBoundingClientRect();
          if (style.display==='none'||style.visibility!=='visible'||!clipRect(rect,viewport)) continue;
          if (['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable) {region('field',rect);if(el.type==='password')detections.push({kind:'password'});}
          if (['IMG','SVG','CANVAS','VIDEO','IFRAME','OBJECT','EMBED'].includes(el.tagName)||style.backgroundImage!=='none') region('media',rect);
          // Original pixels, unknown text and closed shadow contents never enter
          // the exported scene, regardless of detector coverage.
          const {role,label}=controlIdentity(el);
          if(role && label && !unavailable(el,win)) {
            const id=`c${entries.length}`;const r=clipRect(rect,viewport);
            entries.push({id,role,label,rect:r});
            nextControls.set(id,{el,label,role,rect:r,bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
          }
          if(el.shadowRoot) visit(el.shadowRoot);
        }
      } while((node=walker.nextNode()));
    }
    visit(doc.body);
    scene=makeScene({revision,viewport,controls:entries,regions});
    controls=nextControls;capturedAt=performance.now();
    return scene;
  }
  function assertFresh(expected) {
    if(disposed)throw new Error('Page agent disposed');
    flush();
    const roots=shadowRoots();
    if(roots.size!==observedRoots.size||[...roots].some(root=>!observedRoots.has(root)))invalidate();
    if(!scene || revision!==expected || scene.revision!==expected || performance.now()-capturedAt>30000)
      throw new Error('Page changed or review expired. Capture again.');
    if(win.innerWidth!==scene.viewport.width || win.innerHeight!==scene.viewport.height)
      throw new Error('Viewport changed. Capture again.');
    for(const {el,label,role,bounds} of controls.values()) {
      const current=controlIdentity(el);
      if(unavailable(el,win)||current.label!==label||current.role!==role||!sameRect(el.getBoundingClientRect(),bounds))
        throw new Error('Target changed. Capture again.');
    }
  }
  function execute({revision:expected,action,userConfirmed=false}) {
    assertFresh(expected);
    if(!userConfirmed) throw new Error('Review and confirm the action first.');
    const parsed=validateAction(action,scene);
    if(parsed.type==='click') {
      const item=controls.get(parsed.targetId);const el=item?.el;
      const top=deepestHit(doc,item.rect.x+item.rect.width/2,item.rect.y+item.rect.height/2);
      if(!composedContains(el,top)) throw new Error('Target is obscured. Capture again.');
      // Links and submit buttons require a manual click. Other page click handlers
      // are page-controlled; use only the authorized synthetic fixture workflow.
      if(el.tagName==='A'||(el.tagName==='BUTTON' && el.type==='submit' && el.form)) throw new Error('Navigation or form submission requires a manual click.');
      el.click();
    } else if(parsed.type==='scroll') win.scrollBy({top:parsed.direction==='down'?Math.round(win.innerHeight*.7):-Math.round(win.innerHeight*.7),behavior:'instant'});
    invalidate();
    return {status:'executed',type:parsed.type};
  }
  return {collect,assertFresh,execute,get mutationCount(){return mutationCount;},get detectionCounts(){return detections.reduce((counts,d)=>{counts[d.kind]=(counts[d.kind]||0)+1;return counts;},{});},dispose(){disposed=true;scene=null;controls.clear();observedRoots.clear();observer.disconnect();win?.removeEventListener('scroll',invalidate,true);win?.removeEventListener('resize',invalidate);doc.removeEventListener('input',invalidate,true);doc.removeEventListener('change',invalidate,true);}};
}

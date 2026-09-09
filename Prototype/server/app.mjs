import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { requestSchema, validateAction } from '../shared/protocol.mjs';

const root = resolve(fileURLToPath(new URL('../',import.meta.url)));
const errors = {
  invalid_json:[400,'Request must contain valid JSON.'],
  validation_error:[422,'Context does not match the sanitized scene contract.'],
  unauthorized:[401,'Pair this client with the local server before sending context.'],
  origin_denied:[403,'This origin is not permitted.'],
  too_large:[413,'Context exceeds the 256 KiB limit.'],
  rate_limited:[429,'Too many requests. Wait one minute and retry.'],
  provider_unavailable:[503,'The reasoning model is unavailable. Start the configured provider, then retry.'],
  provider_invalid:[502,'The model returned an unsafe or invalid action. Capture again or choose a manual action.'],
  unsupported_media:[415,'Use application/json.'],
  not_found:[404,'Resource not found.'],
  internal_error:[500,'The request could not be completed. Retry from a fresh capture.'],
};
function equalToken(a,b) {
  const aa=Buffer.from(a||''); const bb=Buffer.from(b||'');
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
async function readBody(req, limit=262144) {
  let length=0;const chunks=[];
  for await(const chunk of req) {
    length+=chunk.length;if(length>limit) throw new Error('too_large');chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new Error('invalid_json');}
}
export function createApp({token, origins=[], publicOrigin='http://127.0.0.1:9041', infer, saveAudit=()=>{}, readAudits=()=>[], now=Date.now}={}) {
  if(typeof token!=='string'||token.length<24) throw new Error('Set a pairing token with at least 24 characters');
  if(typeof infer!=='function') throw new Error('Reasoning provider required');
  let requests=[];let inFlight=0;
  const allowed = new Set([publicOrigin,...origins]);
  return createServer(async(req,res)=>{
    const requestId=randomUUID();
    const send=(status,body,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...extra});res.end(JSON.stringify(body));};
    const fail=code=>{const [status,message]=errors[code]||errors.internal_error;send(status,{error:{code:errors[code]?code:'internal_error',message,requestId}},status===429?{'Retry-After':'60'}:{});};
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'; style-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    const origin=req.headers.origin;
    if(origin && !allowed.has(origin)) return fail('origin_denied');
    if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS') {
      if(!origin) return fail('origin_denied');
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});return res.end();
    }
    const path=new URL(req.url,'http://localhost').pathname;
    try {
      if(path==='/api/v1/health' && req.method==='GET') return send(200,{data:{status:'ready',scheme:'sightline-semantic-v1',modelConnection:'checked-on-request'}});
      if(path==='/api/v1/session' && req.method==='GET') {
        // Only our same-origin document may bootstrap the demo session. Extension
        // pairing uses the user's explicit copy/paste, not wildcard extension CORS.
        if(!publicOrigin.startsWith('http://127.0.0.1:') || req.headers['sec-fetch-site']!=='same-origin' || req.headers.host!==new URL(publicOrigin).host) return fail('origin_denied');
        return send(200,{data:{token}});
      }
      if(path.startsWith('/api/')) {
        if(!equalToken(req.headers.authorization,`Bearer ${token}`)) return fail('unauthorized');
        if(path==='/api/v1/audits' && req.method==='GET') return send(200,{data:readAudits()});
        if(path!=='/api/v1/plans'||req.method!=='POST') return fail('not_found');
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) return fail('unsupported_media');
        requests=requests.filter(t=>now()-t<60000);
        if(requests.length>=20||inFlight>=2) return fail('rate_limited');
        requests.push(now());
        const parsed=requestSchema.safeParse(await readBody(req));
        if(!parsed.success) return fail('validation_error');
        inFlight++;
        const started=performance.now();
        let result;
        try {result=await infer(parsed.data);} finally {inFlight--;}
        let action;
        try {action=validateAction(result.action,parsed.data.scene);} catch {return fail('provider_invalid');}
        const latencyMs=Math.round((performance.now()-started)*100)/100;
        const record={id:requestId,createdAt:new Date(now()).toISOString(),model:result.model,mode:result.mode,controls:parsed.data.scene.controls.length,regions:parsed.data.scene.regions.length,latencyMs,actionType:action.type};
        saveAudit(record);
        return send(200,{data:{id:requestId,revision:parsed.data.scene.revision,action,provider:{model:result.model,mode:result.mode},latencyMs,expiresInMs:30000}});
      }
      if(req.method!=='GET') return fail('not_found');
      const decoded=decodeURIComponent(path);
      // Explicit public trees: no server code, database, env, tests or node_modules.
      const publicPaths= ['/app/','/models/','/dist/'];
      const actual=decoded==='/'?'/app/index.html':decoded;
      if(!publicPaths.some(p=>actual.startsWith(p)) || actual.includes('..') || actual.includes('\\')) return fail('not_found');
      const file=resolve(root,`.${actual}`);
      if(!file.startsWith(root+sep) || !(await stat(file)).isFile()) return fail('not_found');
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.onnx':'application/octet-stream','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(await readFile(file));
    } catch(e) {fail(errors[e.message]?e.message:(e.code==='ENOENT'?'not_found':'internal_error'));}
  });
}

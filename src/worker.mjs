import {DurableObject} from 'cloudflare:workers';
import {newJournal,changeRule,applyObservation,publicState,NETWORK,validateRule} from './trend.mjs';
import {HTML} from './page.mjs';

const SCHEDULED='pharos-scheduled-hourly';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
function validStream(id){
 const text=String(id||'');
 if(!/^[a-zA-Z0-9_-]{8,64}$/.test(text))throw Error('Notebook ID must be 8-64 letters, numbers, dash or underscore');
 return text;
}
async function readBody(req){
 const data=await req.text();
 if(data.length>4096)throw Error('Request exceeds 4096 bytes');
 let result;
 try{result=JSON.parse(data)}catch{throw Error('Invalid JSON body')}
 if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Expected JSON object');
 return result;
}
function journalStub(env,stream){return env.TREND_JOURNAL.get(env.TREND_JOURNAL.idFromName(validStream(stream)))}
async function forward(env,stream,path,method='GET',data){
 const stub=journalStub(env,stream);
 const response=await stub.fetch('https://journal.internal'+path,{
  method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 return response;
}
async function readPharosGas(){
 // Three independently verified public read-only calls, no wallet or sign action.
 async function rpc(method){
  const res=await fetch(NETWORK.rpc,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]}),
   signal:AbortSignal.timeout(15000)});
  if(res.status===429){const err=Error('Pharos Atlantic RPC rate limit (HTTP 429). Please try again later.');
   err.kind='RPC_RATE_LIMIT';throw err}
  if(!res.ok)throw Error('Pharos Atlantic RPC HTTP '+res.status);
  const body=await res.json();
  if(body.error)throw Error('Pharos Atlantic RPC: '+String(body.error.message||'Unknown error').slice(0,160));
  if(body.result==null)throw Error(method+' result unavailable');
  return body.result;
 }
 const [chain,block,gas]=await Promise.all([rpc('eth_chainId'),rpc('eth_blockNumber'),rpc('eth_gasPrice')]);
 if(Number(BigInt(chain))!==NETWORK.chainId)throw Error('Unexpected RPC chain ID; observation discarded');
 const gwei=Number(BigInt(gas))/1e9;
 if(!Number.isFinite(gwei)||gwei<0||gwei>100000)throw Error('Gas price outside accepted range');
 return {gwei,blockNumber:BigInt(block).toString()};
}
export class TrendJournal extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx}
 async fetch(request){
  try{
   const url=new URL(request.url);
   if(url.pathname==='/state'&&request.method==='GET'){
    const j=(await this.ctx.storage.get('journal'))||newJournal();
    return json(publicState(j,url.searchParams.get('stream')||'private'));
   }
   if(url.pathname==='/rule'&&request.method==='POST'){
    const body=await readBody(request);
    const valid=validateRule(body.rule);
    const result=await this.ctx.storage.transaction(async txn=>{
     const prev=(await txn.get('journal'))||newJournal();
     const changed=changeRule(prev,valid);
     if(!changed.unchanged)await txn.put('journal',changed.journal);
     return changed;
    });
    return json({ok:true,unchanged:result.unchanged,journal:publicState(result.journal,body.stream)});
   }
   if(url.pathname==='/record'&&request.method==='POST'){
    const body=await readBody(request);
    const result=await this.ctx.storage.transaction(async txn=>{
     const existing=(await txn.get('journal'))||newJournal();
     const observed=applyObservation(existing,body.observation);
     if(!observed.duplicate)await txn.put('journal',observed.journal);
     return observed;
    });
    return json({ok:true,duplicate:result.duplicate,triggered:result.triggered,
     observation:result.observation,event:result.event||null,
     journal:publicState(result.journal,body.stream)});
   }
   return json({ok:false,error:'Journal endpoint not found'},404);
  }catch(e){return json({ok:false,error:String(e.message||e).slice(0,300)},400)}
 }
}

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  try{
   if(u.pathname==='/'&&request.method==='GET')
    return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
   if(u.pathname==='/api/health'&&request.method==='GET')return json({ok:true,
    service:'trend-watcher',network:NETWORK.name,chainId:NETWORK.chainId,
    durable:true,storage:'sqlite-backed Durable Objects',publicReadOnlyLiveSource:'eth_gasPrice',
    alertAction:'PERSISTED_ALERT_ONLY',transactionBroadcast:false});
   if(u.pathname==='/api/state'&&request.method==='GET'){
    const stream=validStream(u.searchParams.get('stream'));
    return forward(env,stream,'/state?stream='+encodeURIComponent(stream));
   }
   if(request.method!=='POST'||!['/api/rule','/api/observe-demo','/api/check-live'].includes(u.pathname))
    return json({ok:false,error:'Not found'},404);
   const body=await readBody(request);
   const stream=validStream(body.stream);
   if(stream===SCHEDULED)return json({ok:false,error:'Scheduled notebook is read-only from public endpoints'},403);
   if(u.pathname==='/api/rule')
    return forward(env,stream,'/rule','POST',{stream,rule:validateRule(body.rule)});
   const id=String(body.id||'');
   let observation;
   if(u.pathname==='/api/observe-demo'){
    observation={id,gwei:body.gwei,source:'SYNTHETIC_DEMO'};
   }else{
    const sample=await readPharosGas();
    observation={id,...sample,source:'PHAROS_ATLANTIC_LIVE'};
   }
   return forward(env,stream,'/record','POST',{stream,observation});
  }catch(e){
   return json({ok:false,error:String(e.message||e).slice(0,300),code:e.kind||'REQUEST_FAILED'},
    e.kind==='RPC_RATE_LIMIT'?429:400);
  }
 },
 async scheduled(event,env,ctx){
  // A single stable stream stores hourly on-chain gas observations and actions.
  ctx.waitUntil((async()=>{
   try{
    const sample=await readPharosGas();
    const id='hourly-'+Number(event.scheduledTime);
    const response=await forward(env,SCHEDULED,'/record','POST',{
     stream:SCHEDULED,observation:{...sample,id,source:'PHAROS_ATLANTIC_LIVE'}});
    if(!response.ok)throw Error('Scheduled durable journal rejected observation');
    console.log('Pharos hourly trend check',JSON.stringify({
     at:new Date(event.scheduledTime).toISOString(),result:await response.json()}));
   }catch(e){console.error('Hourly RPC trend check skipped safely:',String(e.message||e))}
  })());
 }
};

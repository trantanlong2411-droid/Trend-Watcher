import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.TREND_URL||'https://trend-watcher.trantanlong2411.workers.dev';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body){
 const res=await fetch(root+path,{method:body?'POST':'GET',
  headers:body?{'content-type':'application/json'}:{},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(24000)});
 const raw=await res.text();let data;
 try{data=JSON.parse(raw)}catch{throw Error(path+' returned HTTP '+res.status+' non-JSON: '+raw.slice(0,300))}
 if(!res.ok||!data.ok)throw Error(path+' returned HTTP '+res.status+': '+JSON.stringify(data).slice(0,550));
 return data;
}
let health;
for(let i=0;i<20;i++){
 try{health=await api('/api/health');if(health.service==='trend-watcher'&&health.durable)break}
 catch{}
 await wait(4500);
}
assert.equal(health?.storage,'sqlite-backed Durable Objects');
assert.equal(health?.transactionBroadcast,false);

// Cross-deployment persistence check: this stream was created by CI run
// 40748381939 before the current Worker build. Every new build must retain
// its original journal with the same alert timestamps and observation IDs.
const prior=await api('/api/state?stream=ci-1793213298789-w0ivrzl');
assert.ok(prior.observationCount>=12,'Prior deployment journal was lost');
assert.ok(prior.alertCount>=2,'Prior deployment alerts were lost');
assert.equal(prior.events[0].at,'2026-10-28T18:48:20.510Z');
assert.equal(prior.events[1].at,'2026-10-28T18:48:21.812Z');
console.log('PREVIOUS DEPLOYMENT JOURNAL PERSISTED',JSON.stringify({
 stream:'ci-1793213298789-w0ivrzl',history:prior.observationCount,alerts:prior.alertCount,
 firstAlert:prior.events[0].at,secondAlert:prior.events[1].at
}));
const stream='ci-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
const result={schema:'trend-watcher-ci-proof-v1',verifiedAt:new Date().toISOString(),
 source:'DEMO_MULTI_HTTP_REQUESTS_WITH_SQLITE_DURABLE_OBJECT',
 url:root+'/?stream='+stream,stream,chainId:688689,
 actions:[],replayedOnce:false,transactionBroadcast:false};
async function state(){return api('/api/state?stream='+encodeURIComponent(stream))}
const before=await state();
assert.equal(before.observationCount,0);assert.equal(before.alertCount,0);
const configured=await api('/api/rule',{stream,rule:{mode:'below',thresholdGwei:5,minObservations:3}});
assert.equal(configured.journal.rule.minObservations,3);
async function observe(value,key){
 const res=await api('/api/observe-demo',{stream,id:'ci-observation-'+key,gwei:value});
 result.actions.push({id:'ci-observation-'+key,gwei:value,duplicate:res.duplicate,
  decision:res.observation.decision,alertCount:res.journal.alertCount,
  recordedAt:res.observation.at});
 return res;
}
for(const [index,value] of [10,3,10].entries()){
 const entry=await observe(value,index);
 assert.equal(entry.triggered,false);
 assert.equal(entry.journal.alertCount,0);
}
const storedSpike=await state();
assert.equal(storedSpike.observationCount,3);
assert.equal(storedSpike.alertCount,0);
for(const [index,value] of [4,3,2].entries()){
 const entry=await observe(value,index+3);
 assert.equal(entry.triggered,index===2);
}
const firstAlert=await state();
assert.equal(firstAlert.observationCount,6);
assert.equal(firstAlert.alertCount,1);
assert.equal(firstAlert.events[0].observationId,'ci-observation-5');
assert.equal(firstAlert.events[0].countAtTrigger,3);
assert.equal(firstAlert.events[0].action,'PERSISTED_ALERT_ONLY');
const dup=await api('/api/observe-demo',{stream,id:'ci-observation-5',gwei:2});
assert.equal(dup.duplicate,true);
assert.equal(dup.journal.alertCount,1);
assert.equal(dup.journal.observationCount,6);
result.replayedOnce=true;
for(const [index,value] of [1,1].entries()){
 const entry=await observe(value,index+6);
 assert.equal(entry.triggered,false);
 assert.equal(entry.journal.alertCount,1);
}
await observe(10,8); // break resets the latch
for(const [index,value] of [4,3,2].entries())await observe(value,index+9);
const afterRestartStyleReload=await state(); // independent HTTP request, not a forced DO eviction
assert.equal(afterRestartStyleReload.observationCount,12);
assert.equal(afterRestartStyleReload.alertCount,2);
assert.equal(afterRestartStyleReload.events[1].observationId,'ci-observation-11');
result.stateSnapshot=afterRestartStyleReload;
result.note='State was loaded across distinct independent HTTP requests; test does NOT force an actual Worker process restart.';
const liveStream='ci-live-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
let liveResult;
for(let tries=0;tries<3;tries++){
 try{liveResult=await api('/api/check-live',{stream:liveStream,id:'live-check-'+Date.now()});
  break;
 }catch(e){
  if(tries===2)throw e;
  console.log('Live RPC read retry '+(tries+1)+': '+e.message);
  await wait(15000);
 }
}
assert.equal(liveResult.journal.observations[0].source,'PHAROS_ATLANTIC_LIVE');
assert.match(liveResult.observation.blockNumber,/^[0-9]+$/);
assert.ok(liveResult.observation.gwei>=0);
result.liveObservation=liveResult.observation;
await mkdir('proof',{recursive:true});
await writeFile('proof/ci-trend-evidence.json',JSON.stringify(result,null,2)+'\n');
console.log('PERSISTENT TREND PROOF VERIFIED',JSON.stringify({
  history:afterRestartStyleReload.observationCount,alerts:afterRestartStyleReload.alertCount,
  firstFire:afterRestartStyleReload.events[0].at,secondFire:afterRestartStyleReload.events[1].at,
  liveGasGwei:liveResult.observation.gwei,source:liveResult.observation.source,
  persistentUrl:result.url,
  warning:'Demo values are SYNTHETIC_DEMO, live value is actual RPC; no blockchain writes.'
}));

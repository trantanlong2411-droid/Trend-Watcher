import assert from 'node:assert/strict';
import source from '../proof/user-trend-proof-2026-10-28.json' with {type:'json'};
import {newJournal,changeRule,applyObservation} from '../src/trend.mjs';

assert.equal(source.project,'Pharos Trend Watcher');
assert.equal(source.journal.stream,'demo-42371df8-3821-4d54-b4b2-e22837f714de');
assert.equal(source.journal.persistentStorage,'CLOUDFLARE_SQLITE_DURABLE_OBJECT');
const j=source.journal;
const obs=j.observations;
const events=j.events;
assert.equal(obs.length,12);
assert.equal(j.observationCount,12);
assert.equal(j.alertCount,1);
assert.equal(events.length,1);
assert.equal(j.rule.mode,'below');
assert.equal(j.rule.thresholdGwei,5);
assert.equal(j.rule.minObservations,3);
assert.equal(j.ruleRevision,2);
assert.equal(j.observationSource,'SYNTHETIC_DEMO');
assert.deepEqual(obs.map(x=>x.gwei),[10,3,10,4,3,2,4,3,2,1,1,1]);
assert.deepEqual(obs.slice(0,3).map(x=>x.decision),['NO_TREND','OBSERVE_ONLY','NO_TREND']);
assert.equal(obs[5].decision,'ALERT_FIRED');
assert.equal(obs[5].consecutive,3);
assert.equal(events[0].at,'2026-10-28T18:59:48.902Z');
assert.equal(events[0].at,obs[5].at);
assert.equal(events[0].observationId,obs[5].id);
assert.equal(events[0].countAtTrigger,3);
assert.equal(events[0].action,'PERSISTED_ALERT_ONLY');
assert.ok(obs.every(x=>x.source==='SYNTHETIC_DEMO'&&x.blockNumber===null));
assert.ok(obs.slice(6).every(x=>x.decision==='OBSERVE_ONLY'&&!x.eventId));
assert.equal(j.armed,false);
assert.equal(j.consecutive,9);
assert.equal(new Set(obs.map(x=>x.id)).size,12);
assert.deepEqual(j.seenIds,obs.map(x=>x.id));

const configChange=j.configHistory[0];
let state=newJournal(configChange.oldRule,j.createdAt);
state=changeRule(state,configChange.newRule,configChange.at).journal;
assert.equal(state.ruleRevision,2);
for(const item of obs){
 const result=applyObservation(state,{id:item.id,gwei:item.gwei,source:item.source},item.at);
 assert.equal(result.duplicate,false,'duplicate stored observation');
 assert.equal(result.observation.decision,item.decision);
 assert.equal(result.observation.consecutive,item.consecutive);
 assert.equal(result.observation.ruleRevision,item.ruleRevision);
 assert.equal(result.observation.armedAfter,item.armedAfter);
 assert.equal(result.observation.eventId,item.eventId);
 state=result.journal;
}
assert.equal(state.alertCount,1);
assert.deepEqual(state.events,events,'independent state machine replay must reconstruct exact alert metadata');
assert.deepEqual(state.observations,obs,'independent replay must reconstruct exact observations');
const replay=applyObservation(state,{id:obs[5].id,gwei:2,source:'SYNTHETIC_DEMO'},obs[5].at);
assert.equal(replay.duplicate,true);
assert.equal(replay.journal.alertCount,1);

if(process.argv.includes('--live')){
 const url='https://trend-watcher.trantanlong2411.workers.dev/api/state?stream='+encodeURIComponent(j.stream);
 let data,last;
 for(let n=0;n<3;n++){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(16000)});
   if(!r.ok)throw Error('HTTP '+r.status);
   data=await r.json();
   if(!data.ok)throw Error(data.error||'No journal');
   break;
  }catch(e){last=e;if(n<2)await new Promise(r=>setTimeout(r,1800))}
 }
 if(!data)throw Error('Live Durable Object read unavailable: '+last?.message);
 assert.ok(data.observations.length>=12,'Live notebook has fewer observations than original export');
 for(let i=0;i<12;i++)assert.deepEqual(data.observations[i],obs[i],'Live notebook historical row mismatch at '+i);
 assert.ok(data.events.some(e=>e.eventId==='alert-1'&&e.at===events[0].at&&
  e.observationId===events[0].observationId),'Original alert record missing from cloud storage');
 console.log('LIVE DURABLE OBJECT HISTORY VERIFIED',JSON.stringify({
  url,originalObservations:12,currentlySaved:data.observationCount,
  originalAlertAt:events[0].at,currentlySavedAlerts:data.alertCount
 }));
}
console.log('USER EXPORTED TREND PROOF VERIFIED',JSON.stringify({
 source:'SYNTHETIC_DEMO',observations:12,alerts:1,firstAlertAt:events[0].at,
 firstThreeReadings:'single spike NO ALERT',threeLows:'ALERT_FIRED',
 furtherLowReadings:'NO DUPLICATE ALERT',broadcast:false
}));

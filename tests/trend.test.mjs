import test from 'node:test';
import assert from 'node:assert/strict';
import {newJournal,applyObservation,changeRule,validateRule,publicState} from '../src/trend.mjs';
function sample(gwei,id){return {gwei,id:'observation-'+id,source:'SYNTHETIC_DEMO'};}
test('defaults require three observations or more',()=>assert.equal(validateRule().minObservations,3));
test('invalid trend policy rejects one or two observations',()=>{
 assert.throws(()=>validateRule({minObservations:2}),/3 to 12/);
 assert.throws(()=>validateRule({mode:'unknown'}),/Unsupported/);
});
test('a single downward spike never triggers',()=>{
 let j=newJournal({mode:'below',thresholdGwei:5,minObservations:3});
 for(const [i,v] of [10,2,10].entries())j=applyObservation(j,sample(v,i)).journal;
 assert.equal(j.alertCount,0);
 assert.deepEqual(j.observations.map(x=>x.decision),['NO_TREND','OBSERVE_ONLY','NO_TREND']);
});
test('three consecutive low observations fire once and store exact timestamp',()=>{
 let j=newJournal({mode:'below',thresholdGwei:5,minObservations:3});
 for(const [i,v] of [10,4,3,2,1,1].entries()){
  const r=applyObservation(j,sample(v,i),'2026-10-28T12:00:0'+i+'.000Z');
  j=r.journal;
 }
 assert.equal(j.alertCount,1);
 assert.equal(j.events[0].at,'2026-10-28T12:00:03.000Z');
 assert.equal(j.events[0].countAtTrigger,3);
 assert.equal(j.observations[3].decision,'ALERT_FIRED');
 assert.equal(j.events[0].action,'PERSISTED_ALERT_ONLY');
});
test('non qualifying sample re-arms exactly once for a new episode',()=>{
 let j=newJournal({mode:'below',thresholdGwei:5,minObservations:3});
 for(const [i,v] of [4,3,2,1,8,4,3,2].entries())j=applyObservation(j,sample(v,i)).journal;
 assert.equal(j.alertCount,2);
 assert.deepEqual(j.events.map(e=>e.observationId),['observation-2','observation-7']);
});
test('retry with an existing observation id is idempotent',()=>{
 let j=newJournal();
 const a=applyObservation(j,sample(1,'fixed'));
 j=a.journal;
 const retry=applyObservation(j,sample(1,'fixed'));
 assert.equal(retry.duplicate,true);
 assert.deepEqual(retry.journal,j);
 assert.equal(j.observations.length,1);
});
test('strict falling trend uses at least three distinct observations',()=>{
 let j=newJournal({mode:'falling',thresholdGwei:9,minObservations:3});
 for(const [i,v] of [10,9,8,7].entries())j=applyObservation(j,sample(v,i)).journal;
 assert.equal(j.events.length,1);
 assert.equal(j.events[0].countAtTrigger,3);
});
test('rule edits preserve old history but reset confirmation count',()=>{
 let j=newJournal({mode:'below',thresholdGwei:5,minObservations:3});
 j=applyObservation(j,sample(2,'first')).journal;
 j=changeRule(j,{mode:'below',thresholdGwei:10,minObservations:4}).journal;
 assert.equal(j.observations.length,1);
 assert.equal(j.ruleRevision,2);
 assert.equal(j.consecutive,0);
 assert.equal(j.armed,true);
});
test('persistent JSON can be reloaded across constructor/run without losing history',()=>{
 let saved=newJournal();
 saved=applyObservation(saved,sample(8,'a')).journal;
 const restart=JSON.parse(JSON.stringify(saved));
 const j=applyObservation(restart,sample(7,'b')).journal;
 assert.equal(j.observations.length,2);
 assert.equal(publicState(j,'demo-eight').persistentStorage,'CLOUDFLARE_SQLITE_DURABLE_OBJECT');
});
test('reject spoofed live observations without a chain block',()=>{
 assert.throws(()=>applyObservation(newJournal(),{id:'hello-world',gwei:5,source:'PHAROS_ATLANTIC_LIVE'}),/block number/);
});
test('bounded journal retains 250 latest observations and 500 recent replay IDs',()=>{
 let j=newJournal();
 for(let i=0;i<300;i++)j=applyObservation(j,sample(9,i)).journal;
 assert.equal(j.observations.length,250);
 assert.equal(j.seenIds.length,300);
});

test('synthetic and real Pharos observations cannot be mixed in one persistent notebook',()=>{
 let journal=newJournal();
 journal=applyObservation(journal,sample(10,'synthetic-first')).journal;
 assert.equal(journal.observationSource,'SYNTHETIC_DEMO');
 assert.throws(()=>applyObservation(journal,{
  id:'real-block-1234',gwei:10,blockNumber:'1234',source:'PHAROS_ATLANTIC_LIVE'
 }),/Cannot mix live and synthetic/);
});

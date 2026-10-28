// A pure, deterministic state machine; persistence is handled by Cloudflare Durable Objects.
export const DEFAULT_RULE=Object.freeze({mode:'below',thresholdGwei:9,minObservations:3});
export const NETWORK=Object.freeze({chainId:688689,name:'Pharos Atlantic Testnet',rpc:'https://atlantic.dplabs-internal.com'});
export function validateRule(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Rule must be an object');
 const mode=String(value.mode??DEFAULT_RULE.mode);
 if(!['below','falling'].includes(mode))throw Error('Unsupported mode');
 const thresholdGwei=Number(value.thresholdGwei??DEFAULT_RULE.thresholdGwei);
 const minObservations=Number(value.minObservations??DEFAULT_RULE.minObservations);
 if(!Number.isFinite(thresholdGwei)||thresholdGwei<0||thresholdGwei>100000)throw Error('thresholdGwei must be between 0 and 100000');
 if(!Number.isInteger(minObservations)||minObservations<3||minObservations>12)throw Error('minObservations must be an integer from 3 to 12');
 return {mode,thresholdGwei,minObservations};
}
export function newJournal(rule=DEFAULT_RULE,at=new Date().toISOString()){
 return {schema:'pharos-trend-journal-v1',createdAt:at,updatedAt:at,
  rule:validateRule(rule),ruleRevision:1,consecutive:0,armed:true,
  observations:[],events:[],alertCount:0,seenIds:[],configHistory:[]};
}
export function changeRule(state,rule,now=new Date().toISOString()){
 const next=structuredClone(state);
 const valid=validateRule(rule);
 if(JSON.stringify(next.rule)===JSON.stringify(valid))return {journal:next,unchanged:true};
 next.configHistory.push({at:now,oldRule:next.rule,newRule:valid,revision:next.ruleRevision+1});
 next.configHistory=next.configHistory.slice(-80);
 next.rule=valid;next.ruleRevision+=1;next.consecutive=0;next.armed=true;next.updatedAt=now;
 return {journal:next,unchanged:false};
}
export function validateObservation(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Observation body must be an object');
 const id=String(value.id||'');
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(id))throw Error('Observation id must be 8-100 alphanumeric, dash or underscore characters');
 const gwei=Number(value.gwei);
 if(!Number.isFinite(gwei)||gwei<0||gwei>100000)throw Error('Invalid gas price Gwei');
 const source=String(value.source||'');
 if(!['SYNTHETIC_DEMO','PHAROS_ATLANTIC_LIVE'].includes(source))throw Error('Unsupported source');
 let blockNumber=null;
 if(source==='PHAROS_ATLANTIC_LIVE'){
  if(!/^[0-9]+$/.test(String(value.blockNumber)))throw Error('Live observations need actual block number');
  blockNumber=String(value.blockNumber);
 }
 return {id,gwei,source,blockNumber};
}
export function applyObservation(journal,raw,now=new Date().toISOString()){
 const sample=validateObservation(raw);
 if(journal.seenIds.includes(sample.id))return {journal,duplicate:true,observation:journal.observations.find(x=>x.id===sample.id)||null,
  triggered:false};
 const next=structuredClone(journal);
 const previous=next.observations.at(-1);
 let qualifies;
 if(next.rule.mode==='below'){
  qualifies=sample.gwei<next.rule.thresholdGwei;
  next.consecutive=qualifies?next.consecutive+1:0;
 }else{
  qualifies=Boolean(previous && sample.gwei<previous.gwei);
  next.consecutive=qualifies?Math.max(2,next.consecutive+1):1;
 }
 if(!qualifies)next.armed=true; // a non-qualifying observation re-arms a new future episode
 const triggered=qualifies&&next.armed&&next.consecutive>=next.rule.minObservations;
 const decision=triggered?'ALERT_FIRED':qualifies?'OBSERVE_ONLY':'NO_TREND';
 let evt=null;
 if(triggered){
  next.alertCount++;
  next.armed=false;
  evt={eventId:'alert-'+next.alertCount,at:now,source:sample.source,
   observationId:sample.id,ruleRevision:next.ruleRevision,
   rule:structuredClone(next.rule),countAtTrigger:next.consecutive,
   type:'ALERT_FIRED',action:'PERSISTED_ALERT_ONLY',
   message:'Trend confirmed after '+next.consecutive+' observations. No on-chain transaction was sent.'};
  next.events.push(evt);next.events=next.events.slice(-150);
 }
 const observation={...sample,at:now,decision,consecutive:next.consecutive,
  ruleRevision:next.ruleRevision,armedAfter:next.armed,qualifies,
  eventId:evt?.eventId||null};
 next.observations.push(observation);next.observations=next.observations.slice(-250);
 next.seenIds.push(sample.id);next.seenIds=next.seenIds.slice(-500);
 next.updatedAt=now;
 return {journal:next,duplicate:false,observation,triggered,event:evt};
}
export function publicState(journal,stream){
 return {ok:true,stream,persistentStorage:'CLOUDFLARE_SQLITE_DURABLE_OBJECT',
  ...journal,observationCount:journal.observations.length,
  latest:journal.observations.at(-1)||null,lastAlert:journal.events.at(-1)||null};
}

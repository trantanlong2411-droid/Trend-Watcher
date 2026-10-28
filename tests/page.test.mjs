import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {HTML} from '../src/page.mjs';
test('the dashboard offers persistent streams, multiple observations, live source and downloadable proof',()=>{
 for(const id of ['fresh','copy','reload','rule','live','sample','spike','confirm','steady','full','export','history','events'])
  assert.ok(HTML.includes('id="'+id+'"'),id);
 assert.match(HTML,/SYNTHETIC_DEMO/);
 assert.match(HTML,/PHAROS_ATLANTIC_LIVE|Observe LIVE Pharos gas/);
 assert.match(HTML,/localStorage/);
 assert.match(HTML,/\/api\/state/);
});
test('dashboard JavaScript is valid browser syntax',()=>{
 const scripts=[...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 new Script(scripts[0][1],{filename:'trend-ui.js'});
});

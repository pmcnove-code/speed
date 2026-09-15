import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipEditPlan} from './clip-edit.mjs';

test('clip editing removes only outer padding and shifts exact word timing',()=>{
 const plan=clipEditPlan(6000,{spoken:'Step outside',text:'Step outside',words:[{word:'Step',start:1,end:1.5},{word:'outside',start:3.5,end:4}]});
 assert.equal(plan.sourceStartMs,750);assert.equal(plan.durationMs,3625);
 assert.equal(plan.caption.words[0].start,.25);assert.equal(plan.caption.words[1].end,3.25);
 assert.ok(plan.durationMs/1000-plan.caption.words[1].end>=.35);
});
test('uncertain, incomplete, nonmonotonic and silent speech retain full clips',()=>{
 for(const caption of [{text:'Step outside',words:[]},{text:'Step outside',words:[{word:'Step',start:1,end:2}]},{hold:true,text:'Step',words:[{word:'Step',start:1,end:2}]},{text:'Step outside',words:[{word:'Step',start:2,end:3},{word:'outside',start:1,end:2}]}]){
  const plan=clipEditPlan(8000,caption);assert.equal(plan.sourceStartMs,0);assert.equal(plan.durationMs,8000);
 }
});
test('short spoken sections retain enough footage and full script drives trim safety',()=>{
 const plan=clipEditPlan(8000,{spoken:'Step outside now',text:'Step',words:[{word:'Step',start:1,end:2}]});
 assert.equal(plan.durationMs,8000);
 const short=clipEditPlan(4000,{text:'Hi',words:[{word:'Hi',start:1,end:1.2}]});assert.equal(short.durationMs,4000);
});

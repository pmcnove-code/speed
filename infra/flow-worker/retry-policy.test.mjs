import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MAX_CLIP_ATTEMPTS,CLIP_RETRY_LIMITS,retryDelayMs} from './retry-policy.mjs';
import {createClipState,markClipDispatched,recoveryForClip,restoreClipState} from './clip-state.mjs';
test('allows ten total takes across mixed failures, then stops; restart preserves the budget',()=>{
 let state=createClipState('C02');
 for(let attempt=1;attempt<=MAX_CLIP_ATTEMPTS;attempt++){
  markClipDispatched(state);
  const error=attempt%2?{code:'SPEECH',confirmedCurrent:true}:{code:'RENDER_UNAVAILABLE'};
  const decision=recoveryForClip(state,Object.assign(new Error('failed take'),error),CLIP_RETRY_LIMITS);
  assert.equal(state.dispatchCount,attempt);
  if(attempt<10){assert.match(decision.action,/^regenerate-/);assert.equal(state.costCommitted,false);state=restoreClipState('C02',JSON.parse(JSON.stringify(state)));}
  else assert.equal(decision.action,'fail');
 }
 assert.equal(state.dispatchCount,10);assert.equal(state.generationRetries,9);
});
test('tries free downloads first and preserves unrelated completed clip state',()=>{
 const completed=createClipState('C01',{phase:'verified',mediaHash:'saved'});const before=structuredClone(completed);
 const state=markClipDispatched(createClipState('C02'));
 for(let n=0;n<3;n++)assert.equal(recoveryForClip(state,{code:'DOWNLOAD'},CLIP_RETRY_LIMITS).action,'retry-acquire');
 assert.equal(state.dispatchCount,1);assert.equal(recoveryForClip(state,{code:'DOWNLOAD'},CLIP_RETRY_LIMITS).action,'regenerate-unavailable');
 assert.deepEqual(completed,before);
});
test('stops unrepairable failures without spending additional credits',()=>{
 for(const code of ['CREDITS','EXPIRED','BLOCKED','CHARACTER_MISSING','GENDER_MISSING','PROMPT_CONTRACT']){
  const state=markClipDispatched(createClipState('C01'));
  assert.equal(recoveryForClip(state,{code},CLIP_RETRY_LIMITS).action,'fail');assert.equal(state.generationRetries,0);
 }
 assert.deepEqual([1,2,3,4,9].map(retryDelayMs),[15000,30000,60000,120000,120000]);
});
test('job restart does not reset its overall time budget',async()=>{
 const {generationDeadline,JOB_GENERATION_MS}=await import('./retry-policy.mjs');
 const started=Date.parse('2026-09-12T00:00:00Z');
 assert.equal(generationDeadline(new Date(started).toISOString(),started+60000),started+JOB_GENERATION_MS);
 assert.equal(generationDeadline(null,started),started+JOB_GENERATION_MS);
});
test('fresh attempts clear failed output but persist exclusions and casting across restart',async()=>{
 const {freshAttemptMetadata}=await import('./retry-policy.mjs');
 const previous={assetId:'bad',assetUrl:'bad-url',networkMedia:{url:'old'},mediaHash:'bad-hash',durationMs:10000,genAt:5,casting:{voice:'same'},editHrefsBefore:['older'],editHrefsAfter:['failed'],rejectedHashes:['older-hash']};
 const fresh=JSON.parse(JSON.stringify(freshAttemptMetadata(previous,'failed',['bad-hash'])));
 for(const key of ['assetId','assetUrl','networkMedia','mediaHash','durationMs','genAt'])assert.equal(fresh[key],null);
 assert.deepEqual(fresh.editHrefsBefore,['older','failed']);assert.deepEqual(fresh.rejectedHashes,['older-hash','bad-hash']);assert.deepEqual(fresh.casting,previous.casting);
 assert.equal(previous.assetId,'bad');
 const state=markClipDispatched(createClipState('C02',{assetId:'bad',mediaHash:'bad-hash',durationMs:10000,uncertainDispatch:true}));
 recoveryForClip(state,{code:'SPEECH',confirmedCurrent:true},CLIP_RETRY_LIMITS);
 for(const key of ['assetId','mediaHash','durationMs','dispatchedAt','uncertainDispatch'])assert.equal(state[key],undefined);
 assert.equal(state.dispatchCount,1);assert.equal(state.generationRetries,1);
});

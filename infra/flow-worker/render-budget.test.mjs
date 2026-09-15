import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRenderBudget,RENDER_OBSERVATION_MS} from './render-budget.mjs';
import {createClipState,markClipDispatched,recoveryForClip} from './clip-state.mjs';
test('Reel 89 acquisition retries cannot reset C03 observation or consume another thirty minutes',()=>{
 const deadline=createRenderBudget();const end=deadline('C03',1,1000);
 assert.equal(end,1000+RENDER_OBSERVATION_MS);
 for(const now of [end,end+75000,end+600000,end+1200000]) assert.equal(deadline('C03',1,now),end);
 assert.equal(deadline('C04',1,end),end+RENDER_OBSERVATION_MS);
 assert.equal(deadline('C03',2,end),end+RENDER_OBSERVATION_MS);
 const state=markClipDispatched(createClipState('C03'));
 assert.equal(recoveryForClip(state,Object.assign(new Error('missing output'),{code:'RENDER_UNAVAILABLE'})).action,'fail');
 assert.equal(state.costCommitted,true);assert.equal(state.dispatchCount,1);assert.equal(state.acquisitionRetries,0);
});

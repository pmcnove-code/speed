import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderReadyToOpen} from './render-ready.mjs';
const ready={pending:0,generating:false,percents:[],playCount:5,playReady:true,mediaCount:6};
test('C05 at 24% never completes because a thumbnail or existing play icons exist',()=>{
  assert.equal(renderReadyToOpen({...ready,playCount:4,mediaCount:99},4),false);
  assert.equal(renderReadyToOpen({...ready,percents:[24]},4),false);
  assert.equal(renderReadyToOpen({...ready,generating:true},4),false);
  assert.equal(renderReadyToOpen({...ready,pending:1},4),false);
});
test('a transient ready signal does not latch across a rendering update',()=>{
  assert.equal(renderReadyToOpen(ready,4),true);
  assert.equal(renderReadyToOpen({...ready,percents:[24],generating:true},4),false);
  assert.equal(renderReadyToOpen({...ready,percents:[100]},4),true);
});

test('recognizes only failures from newly submitted tiles', async () => {
  const {newRenderFailure} = await import('./render-ready.mjs');
  const failed = {name:'New replacement',message:'Failed\nThe video failed to load.'};
  assert.equal(newRenderFailure({failedTiles:[failed]},[{name:'Old rejected take'}]),failed);
  assert.equal(newRenderFailure({failedTiles:[failed]},[{name:'New replacement'}]),null);
  assert.equal(newRenderFailure({failedTiles:[]},[]),null);
});

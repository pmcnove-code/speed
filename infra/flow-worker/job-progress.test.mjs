import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendJobLog} from './job-progress.mjs';
test('Reel 88 clips-ready event remains in clips stage and persists without a generation result in scope',()=>{
 const job={status:'running',stage:'clips',log:[]};let persisted=0;
 appendJobLog(job,'Flow: [ok] 2 clips ready — open Results editor to edit and stitch','magic',()=>persisted++);
 assert.equal(job.stage,'clips');assert.equal(job.status,'running');assert.equal(persisted,1);assert.match(job.stageDetail,/2 clips ready/);
 job.status='done';appendJobLog(job,'Flow: [ok] 2 clips ready — edit and stitch in Results editor','magic');
 assert.equal(job.stage,'clips');assert.equal(job.status,'done');
});
test('actual assembly still reports stitching while download and setup preserve their stages',()=>{
 const job={log:[]};
 for(const [line,stage] of [['Flow: setup…','setup'],['Flow: C01 downloading','downloading'],['Flow: [stitch] All clips edited — assembling transitions and subtitles','stitch']]){
  appendJobLog(job,line);assert.equal(job.stage,stage);
 }
});

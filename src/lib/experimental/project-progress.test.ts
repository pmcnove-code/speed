import {it,expect} from 'vitest';
import {projectProgress} from './project-progress';
it('uses live clip progress ahead of a stale failed app record',()=>{
 const p=projectProgress({processing:true,detail:'Flow: [clip] C05/C07\nFlow: [script] C05 downloading',job:{status:'error',stage:'clips',error:'Old failure'}},5,7);
 expect(p.busy).toBe(true);expect(p.failed).toBe(false);expect(p.message).toBe('Downloading C05');expect(p.percent).toBeLessThan(85);
});
it('continues after clips finish through editing stitching and final success',()=>{
 const edit=projectProgress({processing:false,job:{status:'running',stage:'stitch',stageDetail:'Flow: [clip-edit] C02/7 editing source clip'}},7,7);
 expect(edit.busy).toBe(true);expect(edit.step).toBe(2);expect(edit.message).toBe('Editing clip 2 of 7');
 const stitch=projectProgress({job:{status:'running',stage:'stitch',stageDetail:'Flow: [stitch] Saving your automatically edited video'}},7,7);
 expect(stitch.step).toBe(3);expect(stitch.percent).toBeLessThan(100);
 const done=projectProgress({job:{status:'done',stage:'stitch'}},7,7);
 expect(done.busy).toBe(false);expect(done.percent).toBe(100);
});
it('announces submission immediately and retains failure detail',()=>{
 expect(projectProgress({},5,7,true).message).toBe('Sending your regeneration request');
 const p=projectProgress({error:'download failed',detail:'Flow: C05 download failed'},5,7);
 expect(p.failed).toBe(true);expect(p.detail).toContain('download failed');
});
it('shows the worker queue position without implying rendering has started',()=>{
 const p=projectProgress({status:'queued',processing:true,queueAhead:2,detail:'Flow: [recover] Regenerating C05',job:{status:'queued',stage:'clips'}},5,7);
 expect(p.percent).toBe(0);expect(p.step).toBe(0);expect(p.message).toBe('Queued — 2 videos ahead');
});
it('shows the attempt number for the current clip, without borrowing a previous clip attempt',()=>{
 const detail='Flow: [retry] C01 attempt 5/10\nFlow: [retry] C02 attempt 2/10\nFlow: [script] C02 downloading';
 expect(projectProgress({processing:true,detail},1,3).message).toBe('Downloading C02 · attempt 2 of 10');
});

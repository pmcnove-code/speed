import {expect,it} from 'vitest';
import {generationQueue} from './generation-queue';
it('keeps running work first and orders regenerated projects by queue entry rather than project id',()=>{
 const jobs=[{id:2,status:'queued',queuedAt:'2026-09-12T03:00:00Z'},{id:99,status:'queued',queuedAt:'2026-09-12T02:00:00Z'},{id:98,status:'running'},{id:100,status:'done'},{id:1,status:'error'}];
 expect(generationQueue(jobs).map(j=>j.id)).toEqual([98,99,2]);expect(jobs[0].id).toBe(2);
});
it('keeps the character note separate from the exact spoken prompt',async()=>{
 const {normalizeSceneDirection,buildScenePrompt}=await import('../../../shared/flow/scenes.mjs');
 const scene=normalizeSceneDirection({characterDescription:'Latino Dad with a beard'});
 expect(scene?.characterDescription).toBe('Latino Dad with a beard');
 expect(buildScenePrompt('Exact words.',scene!)).not.toContain('Latino Dad');
 expect(()=>normalizeSceneDirection({characterDescription:'x'.repeat(501)})).toThrow();
});

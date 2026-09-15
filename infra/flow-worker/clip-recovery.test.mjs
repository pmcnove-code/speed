import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createClipRecovery} from './clip-recovery.mjs';

test('recovery preserves ready clips, archives rejected takes and deduplicates concurrent/restarted requests',async()=>{
 const root=await mkdtemp(join(tmpdir(),'clip-recovery-'));
 try{
  await mkdir(join(root,'job'));await writeFile(join(root,'job','C01.mp4'),'ready');await writeFile(join(root,'job','C02.mp4'),'rejected');
  const ready={assetId:'ready-id',clipState:{phase:'verified',mediaHash:'keep'}};
  const job={id:'job',status:'error',payload:{},checkpoint:{projectUrl:'https://flow.google.com/project/p',clips:{C01:ready,C02:{assetId:'old-id',clipState:{phase:'validating',costCommitted:true,dispatchCount:1}}}}};
  let queued=0,saved;
  const deps={root,getJob:()=>job,inspect:async()=>({clips:[{id:'C01',available:true},{id:'C02',available:false},{id:'C03',available:false}]}),persist:async j=>{saved=structuredClone(j);},enqueue:()=>queued++};
  const recover=createClipRecovery(deps);
  await Promise.all([recover('job','request-0001'),recover('job','request-0001')]);
  assert.equal(queued,1);assert.deepEqual(job.checkpoint.clips.C01,ready);
  assert.equal(job.checkpoint.clips.C02.clipState.costCommitted,false);
  assert.equal(job.checkpoint.clips.C03.clipState.phase,'preflight');
  assert.ok(job.checkpoint.clips.C02.editHrefsBefore[0].endsWith('/old-id'));
  assert.equal(await readFile(join(root,'job','C01.mp4'),'utf8'),'ready');
  assert.equal(await readFile(join(root,'job','recovery-history','request-0001','C02.mp4'),'utf8'),'rejected');
  await createClipRecovery({...deps,getJob:()=>saved})('job','request-0001');assert.equal(queued,1);
  await assert.rejects(recover('job','request-0002'),e=>e.status===409);
  await assert.rejects(recover('job','../bad'),e=>e.status===400);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('completed projects and active edits cannot start replacements',async()=>{
 const deps={root:'/unused',getJob:()=>({id:'job',status:'done'}),persist:()=>assert.fail(),enqueue:()=>assert.fail(),inspect:async()=>({clips:[{id:'C01',available:true}]})};
 await assert.rejects(createClipRecovery(deps)('job','request-0001'),e=>e.status===409);
 await assert.rejects(createClipRecovery({...deps,hasActiveEdit:()=>true})('job','request-0001'),e=>e.status===409);
});
test('single-clip regeneration replaces a ready clip without touching another missing clip',async()=>{
 const root=await mkdtemp(join(tmpdir(),'single-clip-'));
 try{
  const job={id:'job',status:'error',checkpoint:{clips:{C01:{clipState:{phase:'verified'}},C02:{clipState:{phase:'rendering',costCommitted:true}}}}};
  const old=structuredClone(job.checkpoint.clips.C02);
  const recover=createClipRecovery({root,getJob:()=>job,inspect:async()=>({clips:[{id:'C01',available:true},{id:'C02',available:false}]}),persist:async()=>{},enqueue:()=>{}});
  await recover('job','single-request','C01');
  assert.deepEqual(job.recoveryTargetIds,['C01']);assert.deepEqual(job.checkpoint.clips.C02,old);
  assert.equal(job.checkpoint.clips.C01.clipState.phase,'preflight');
  await assert.rejects(recover('job','single-request','C02'),e=>e.status===409);
  await recover('job','single-request','C01');
 }finally{await rm(root,{recursive:true,force:true});}
});

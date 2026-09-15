import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resultClips,resultClipFile} from './result-clips.mjs';
import {createEditService} from './edit-api.mjs';
const exec=promisify(execFile);
test('exposes verified individual clips while preventing partial or running-job stitching',async()=>{
 const root=await mkdtemp(join(tmpdir(),'result-clips-'));await mkdir(join(root,'source'));
 try{
  await exec('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=144x256:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac',join(root,'source','C01.mp4')]);
  const job={id:'source',status:'running',payload:{clips:[{id:'C01',spoken:'Keep every word'},{id:'C02',spoken:'Next line'}]},checkpoint:{clips:{C01:{clipState:{phase:'verified'}}}}};
  const result=await resultClips(job,root);assert.equal(result.clips[0].available,true);assert.equal(result.clips[1].available,false);assert.equal(result.canStitch,false);
  assert.equal(await resultClipFile(job,root,'C01'),join(root,'source','C01.mp4'));
  await assert.rejects(resultClipFile(job,root,'C02'),/not downloaded/);await assert.rejects(resultClipFile(job,root,'C99'),/not found/);
  job.payload.clips.pop();assert.equal((await resultClips(job,root)).canStitch,false);job.status='error';assert.equal((await resultClips(job,root)).canStitch,true);
  job.status='done';job.clipsReady=true;job.videoPath=null;
  await writeFile(join(root,'source','edit-source.json'),JSON.stringify({paths:[join(root,'source','C01.mp4')],captions:[{text:'Keep every word'}]}));
  let renders=0;
  const service=createEditService({root:join(root,'edits'),jobsRoot:root,getJob:()=>job,render:async(paths,out)=>{renders++;assert.equal(paths[0],join(root,'source','C01.mp4'));await writeFile(out,'stitched output');}});
  await service.restore();await service.idle();assert.equal(renders,0,'clips ready must not automatically render');
  const edit=await service.submit('source',{requestId:'manual-stitch-test',options:{subtitles:false}});await service.idle();assert.equal(renders,1);assert.equal(service.get('source',edit.id).status,'done');
  job.partialClips=true;job.checkpoint.clips.C01.clipState.phase='validating';
  assert.equal((await resultClips(job,root)).clips[0].available,false,'partial completion must not approve a rejected existing file');
  job.partialClips=false;job.checkpoint.clips.C01.clipState.phase='verified';
  await rm(join(root,'source','C01.mp4'));
  await assert.rejects(service.submit('source',{requestId:'missing-clips-test',options:{}}),/downloaded and verified/);
  job.status='error';job.checkpoint.clips.C01.clipState.phase='downloaded';assert.equal((await resultClips(job,root)).clips[0].available,false);
 }finally{await rm(root,{recursive:true,force:true});}
});

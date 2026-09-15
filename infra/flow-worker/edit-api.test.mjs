import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEditService} from './edit-api.mjs';
import {normalizeEditOptions} from '../../shared/flow/edit-options.mjs';

test('editing API exports an independent copy, validates options, and deduplicates requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'edit-api-'));
 try {
  const path=join(dir,'original.mp4'); await writeFile(path,'original verified video');
  await writeFile(join(dir,'edit-source.json'),JSON.stringify({paths:[path],captions:[{text:'Keep every word'}]}));
  let calls=0;
  const service=createEditService({root:join(dir,'edits'),getJob:id=>id==='source'?{status:'done',videoPath:path}:null,render:async(paths,out,captions,options)=>{calls++;assert.equal(paths[0],path);assert.equal(captions[0].text,'Keep every word');assert.equal(options.subtitleSize,42);await writeFile(out,'edited copy');}});
  await service.restore();
  const body={requestId:'request-12345',options:{subtitleSize:42,transition:'cut'}};
  const [first,duplicate]=await Promise.all([service.submit('source',body),service.submit('source',body)]);
  assert.equal(first.id,duplicate.id); await service.idle(); assert.equal(calls,1);
  assert.equal(service.get('source',first.id).status,'done');
  assert.equal(await readFile(path,'utf8'),'original verified video');
  assert.equal(await readFile(service.video('source',first.id),'utf8'),'edited copy');
  assert.throws(()=>service.get('another-source',first.id),/not found/);
  await assert.rejects(service.submit('source',{...body,options:{subtitleSize:72}}),/different options/);
  await assert.rejects(service.submit('source',{requestId:'second-12345',options:{command:'rm'}}),/Unsupported/);
  await assert.rejects(service.submit('source',{requestId:'second-12345',options:{subtitleSize:500}}),/36 and 72/);
  const restored=createEditService({root:join(dir,'edits'),getJob:()=>null,render:()=>{throw new Error('must not rerender finished edit');}});
  await restored.restore(); await restored.idle(); assert.equal(restored.get('source',first.id).status,'done');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('an interrupted edit resumes without generation; rendering failures remain visible',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'edit-restart-'));
 try {
  const id='a'.repeat(64);
  await writeFile(join(dir,`${id}.json`),JSON.stringify({id,sourceJobId:'source',source:{paths:['saved.mp4'],captions:[]},options:{},status:'running',log:[],createdAt:new Date().toISOString()}));
  let attempts=0;
  const service=createEditService({root:dir,getJob:()=>null,render:async()=>{attempts++;throw new Error('subtitle export failed');}});
  await service.restore();await service.idle();
  assert.equal(attempts,1); assert.equal(service.get('source',id).status,'error');
  assert.match(service.get('source',id).error,/subtitle export failed/);
  assert.throws(()=>service.video('source',id),/not ready/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('editing option schema rejects injection and retains explicit false values',()=>{
 assert.throws(()=>normalizeEditOptions({subtitlePosition:'bottom;exec'}));
 assert.throws(()=>normalizeEditOptions({subtitleFade:'false'}));
 assert.throws(()=>normalizeEditOptions({transition:null}));
 const options=normalizeEditOptions({subtitles:false,subtitleFade:false});
 assert.equal(options.subtitles,false);assert.equal(options.subtitleFade,false);
});

test('legacy reel metadata recovers timing from existing audio without generating clips',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'edit-legacy-'));
 try {
  await writeFile(join(dir,'C01.mp4'),'verified');
  let timingCalls=0;
  const service=createEditService({root:join(dir,'edits'),getJob:()=>({status:'done',videoPath:join(dir,'reel.mp4'),payload:{clips:[{id:'C01',spoken:'Step outside',onScreen:'Step outside'}]}}),timings:async()=>{timingCalls++;return[{word:'Step',start:0,end:.3},{word:'outside',start:.3,end:.8}];},render:async(paths,out,captions)=>{assert.equal(paths[0],join(dir,'C01.mp4'));assert.equal(captions[0].words.length,2);await writeFile(out,'edited');}});
  await service.restore();const row=await service.submit('legacy',{requestId:'legacy-test',options:{}});await service.idle();
  assert.equal(service.get('legacy',row.id).status,'done');assert.equal(timingCalls,1);
 } finally {await rm(dir,{recursive:true,force:true});}
});

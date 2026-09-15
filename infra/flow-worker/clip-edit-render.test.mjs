import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareClipEdits,probeDurationMs} from './ffmpeg.mjs';
const exec=promisify(execFile);
test('renders the CapCut source range before assembly and reuses the verified edited clip',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'clip-first-'));
 try{
  const source=join(dir,'source.mp4');
  await exec('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=144x256:d=6','-f','lavfi','-i','sine=frequency=440:duration=6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);
  const original=await readFile(source),log=[];
  const captions=[{spoken:'Step outside',text:'Step outside',words:[{word:'Step',start:1,end:1.5},{word:'outside',start:3.5,end:4}]}];
  const edited=await prepareClipEdits([source],dir,captions,line=>log.push(line));
  assert.notEqual(edited.paths[0],source);
  assert.ok(Math.abs(await probeDurationMs(edited.paths[0])-3625)<=100);
  assert.equal(edited.captions[0].words[0].start,.25);
  const record=JSON.parse(await readFile(join(dirname(edited.paths[0]),'complete.json'),'utf8'));
  assert.equal(record.sourceStartMs,750);
  const before=await readdir(dirname(edited.paths[0]));
  const again=await prepareClipEdits([source],dir,captions,line=>log.push(line));
  assert.deepEqual(again.paths,edited.paths);assert.deepEqual(await readdir(dirname(edited.paths[0])),before);
  assert.match(log.at(-1),/reused verified edit/);assert.deepEqual(await readFile(source),original);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('editing failures are marked as post-generation to prevent account rotation',async()=>{
 const {concatClips}=await import('./ffmpeg.mjs');
 await assert.rejects(concatClips([], '/tmp/unused.mp4'),error=>error.code==='CLIP_EDIT' && error.dispatched===true);
});

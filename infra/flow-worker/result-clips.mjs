import {stat} from 'node:fs/promises';
import {join} from 'node:path';
import {probeDurationMs, MIN_CLIP_BYTES} from './ffmpeg.mjs';

export async function resultClips(job, jobsRoot) {
  if(!job) throw Object.assign(new Error('Reel not found'),{status:404});
  if(!/^[a-zA-Z0-9_-]+$/.test(job.id || '')) throw Object.assign(new Error('Invalid source job ID'),{status:400});
  const planned=job.payload?.clips;
  if(!Array.isArray(planned) || !planned.length || planned.length>100) return {clips:[],canStitch:false};
  const seen=new Set();
  const clips=[];
  for(const clip of planned){
    if(!/^C\d{2,3}$/.test(clip.id) || seen.has(clip.id)) throw Object.assign(new Error('Saved clip list is invalid'),{status:409});
    seen.add(clip.id);
    const path=join(jobsRoot,job.id,`${clip.id}.mp4`);
    const file=await stat(path).catch(()=>null);
    const verified=(job.status==='done' && !job.partialClips) || job.checkpoint?.clips?.[clip.id]?.clipState?.phase==='verified';
    const durationMs=verified && file?.isFile() && file.size>=MIN_CLIP_BYTES ? await probeDurationMs(path) : null;
    const available=Boolean(durationMs && durationMs>=3000);
    clips.push({id:clip.id,text:clip.spoken || '',durationMs:available?durationMs:null,bytes:available?file.size:0,available,status:available?'ready':verified?'missing':'pending'});
  }
  return {clips,canStitch:!['running','queued'].includes(job.status) && clips.every(c=>c.available)};
}

export async function resultClipFile(job,jobsRoot,clipId) {
  const result=await resultClips(job,jobsRoot);
  const clip=result.clips.find(c=>c.id===clipId);
  if(!clip) throw Object.assign(new Error('Clip not found'),{status:404});
  if(!clip.available) throw Object.assign(new Error('This clip is not downloaded and verified yet'),{status:409});
  return join(jobsRoot,job.id,`${clip.id}.mp4`);
}

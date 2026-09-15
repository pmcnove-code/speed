import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeClips} from './clips.mjs';
import {resultClips} from './result-clips.mjs';
import {checkpointAssetUrl} from './asset-identity.mjs';

/** User-requested replacement of incomplete clips only; serialized and durable. */
export function createClipRecovery({getJob,root,persist,enqueue,inspect=resultClips,hasActiveEdit=()=>false}) {
 let chain=Promise.resolve();
 return (id,requestId,clipId)=>{
  const task=chain.then(async()=>{
   if(typeof requestId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(requestId))throw Object.assign(new Error('Invalid recovery request ID'),{status:400});
   const job=getJob(id);
   if(!job)throw Object.assign(new Error('Reel not found'),{status:404});
   if(clipId!==undefined && !/^C\d{2,3}$/.test(clipId))throw Object.assign(new Error('Invalid clip ID'),{status:400});
   if((job.recoveryRequests||[]).includes(requestId)){
    if((job.recoverySelections?.[requestId]||null)!==(clipId||null))throw Object.assign(new Error('Request ID belongs to a different clip selection'),{status:409});
    return job;
   }
   if(!['error','done'].includes(job.status))throw Object.assign(new Error('This project is already processing. Its saved clips will update here.'),{status:409});
   if(hasActiveEdit(id))throw Object.assign(new Error("An edit is running for this project. Wait for it to finish."),{status:409});
   const result=await inspect(job,root);
   const incomplete=result.clips.filter(c=>clipId?c.id===clipId:!c.available);
   if(clipId&&!incomplete.length)throw Object.assign(new Error('Clip not found'),{status:404});
   if(!incomplete.length)throw Object.assign(new Error('All clips are already ready'),{status:409});
   if(job.payload?.clips?.length){
    const canonical=normalizeClips(job.payload.clips,job.payload);
    if(canonical.length!==job.payload.clips.length||canonical.some((clip,i)=>clip.id!==job.payload.clips[i].id||clip.spoken!==job.payload.clips[i].spoken))
     throw Object.assign(new Error('This older project uses a different clip breakdown. Create a new reel to use the current script rules; saved clips remain available.'),{status:409});
   }
   const archive=join(root,id,'recovery-history',requestId);
   await mkdir(archive,{recursive:true});
   await writeFile(join(archive,'checkpoint.json'),JSON.stringify(job.checkpoint||{}),{mode:0o600});
   const next=structuredClone(job.checkpoint||{clips:{}});
   next.clips ||= {};
   for(const clip of incomplete){
    await copyFile(join(root,id,`${clip.id}.mp4`),join(archive,`${clip.id}.mp4`)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    const old=next.clips[clip.id]||{};
    const oldUrl=checkpointAssetUrl(old,next.projectUrl);
    next.clips[clip.id]={...old,assetId:null,assetUrl:null,mediaHash:null,networkMedia:null,qualityError:null,
     editHrefsBefore:[...new Set([...(old.editHrefsBefore||[]),oldUrl].filter(Boolean))],
     clipState:{id:clip.id,phase:'preflight',costCommitted:false,dispatchCount:Number(old.clipState?.dispatchCount||0),preflightRetries:0,acquisitionRetries:0,contentRetries:0}};
   }
   const updated={...job,checkpoint:next,status:'queued',stage:'clips',error:null,clipsReady:false,partialClips:false,videoPath:null,finishedAt:null,startedAt:null,resumeAttempts:0,
    queuedAt:new Date().toISOString(),
    recoveryTargetIds:incomplete.map(c=>c.id),
    recoverySelections:{...(job.recoverySelections||{}),[requestId]:clipId||null},
    recoveryRequests:[...(job.recoveryRequests||[]),requestId],
    stageDetail:`Flow: [recover] Regenerating incomplete clips ${incomplete.map(c=>c.id).join(', ')}; leaving other clips unchanged.`,
    log:[...(job.log||[]),`Flow: [recover] User requested replacement of ${incomplete.map(c=>c.id).join(', ')}. Ready clips are preserved.`]};
   await persist(updated);
   Object.assign(job,updated);
   enqueue(job);
   return job;
  });
  chain=task.catch(()=>{});
  return task;
 };
}

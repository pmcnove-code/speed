export type ClipPhase={phase?:string|null;attempts?:number;updatedAt?:string|null};
export type ProjectStatus={status?:string;queueAhead?:number;processing?:boolean;detail?:string;error?:string|null;clipPhases?:Record<string,ClipPhase>;job?:{status:string;stage:string;stageDetail?:string;error?:string|null}};

const PHASE_LABEL:Record<string,string>={preflight:'Preparing',dispatching:'Starting',rendering:'Rendering',rendered:'Rendered',acquiring:'Downloading',validating:'Checking',verified:'Finished'};

/** True per-clip live label from the worker's checkpoint (lanes run in parallel),
 * or null when no live phase is known — caller falls back to the shared log line. */
export function clipLiveLabel(data:ProjectStatus,clipId:string):string|null{
 const c=data.clipPhases?.[clipId];
 const label=c?.phase?PHASE_LABEL[c.phase]:undefined;
 if(!label)return null;
 const attempt=(c?.attempts??1)>1?` · attempt ${c!.attempts}`:'';
 return `${label} ${clipId}${attempt}`;
}
export function projectProgress(data:ProjectStatus,ready:number,total:number,starting=false){
 const job=data.job;const busy=Boolean(starting||data.processing||['queued','running'].includes(job?.status||''));
 const detail=data.processing?data.detail||'':job?.stageDetail||data.detail||'';
 const latest=detail.trim().split('\n').at(-1)||'';
 const id=[...detail.matchAll(/\bC(\d{2,3})\b/g)].at(-1)?.[0]||'';
 const failed=!busy&&Boolean(data.error||job?.status==='error');
 let step=0,percent=3,message='Preparing your character and voice';
 if(data.status==='queued'||/queued|next in line|in line/i.test(latest)||job?.status==='queued'&&!data.processing){percent=0;message=data.queueAhead?`Queued — ${data.queueAhead} video${data.queueAhead===1?'':'s'} ahead`:'Queued — your clips will start automatically';}
 else if(/\[clip-edit\]/i.test(latest)){step=2;percent=88;message='Editing your source clips';const m=latest.match(/C(\d+)\/(\d+)/);if(m)message=`Editing clip ${Number(m[1])} of ${Number(m[2])}`;}
 else if(!data.processing&&job?.stage==='stitch'||/\[stitch\]|subtitles|transitions|Saving your automatically edited/i.test(latest)){step=3;percent=/saving/i.test(latest)?97:94;message=/saving/i.test(latest)?'Saving your finished video':'Stitching clips and adding subtitles and transitions';}
 else if(data.processing||ready<total){step=1;percent=Math.min(84,Math.round(10+74*ready/Math.max(1,total)));message=id?`Creating ${id}`:'Preparing the remaining clips';
 if(/downloading|download attempt/i.test(latest))message=`Downloading ${id||'your clip'}`;
 else if(/speech|said the copy/i.test(latest))message=`Checking ${id||'your clip'} against your script`;
 else if(/recover|reload|retry/i.test(latest))message=`Recovering ${id||'your clip'} — saved clips are safe`;
 else if(/render|waiting.*clip|starting generate/i.test(latest))message=`Rendering ${id||'your clip'}`;
 }
 const done=!busy&&!failed&&job?.status==='done';
 if(done){percent=job.stage==='clips'&&ready<total?Math.round(10+74*ready/Math.max(1,total)):100;step=job.stage==='clips'&&ready<total?1:4;message=job.stage==='stitch'?'Your finished video is ready':ready===total?'Your clips are ready':'Selected clips are ready; other clips still need attention';}
 if(starting){step=0;percent=3;message='Sending your regeneration request';}
 if(failed)message='Generation needs attention. Your saved clips are preserved.';
 const attempt=[...detail.matchAll(/\[retry\] (C\d+) attempt (\d+)\/(\d+)/g)].filter(m=>m[1]===id).at(-1);
 if(busy&&step===1&&attempt)message+=` · attempt ${attempt[2]} of ${attempt[3]}`;
 return {busy,failed,done,step,percent,message,clipId:id,detail};
}

'use client';
import {useEffect,useState,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {LoaderCircle,RotateCcw} from 'lucide-react';
import {ProjectGenerationProgress} from './project-generation-progress';
import {projectProgress,type ProjectStatus} from '@/lib/experimental/project-progress';
import {ResultsEditor} from './results-editor';
type Clip={id:string;text:string;available:boolean;status:string;durationMs:number|null;bytes:number};
export function ProjectClips({reelId,processing}:{reelId:number;processing:boolean}){
 const progressPanel=useRef<HTMLDivElement>(null);
 const requestId=useRef(''),requestClip=useRef<string|undefined>(undefined);
 const [live,setLive]=useState<ProjectStatus>({}),[watching,setWatching]=useState(processing),[selected,setSelected]=useState<string|undefined>(undefined);
 const [recovering,setRecovering]=useState(false),[busy,setBusy]=useState(processing),[recoveryError,setRecoveryError]=useState(''),[jobError,setJobError]=useState('');
 const [clips,setClips]=useState<Clip[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let cancelled=false,inFlight=false;
  async function load(){if(inFlight)return;inFlight=true;try{
   const response=await fetch(`/api/experimental/reels/${reelId}/clips`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load saved clips');
   if(!cancelled){setClips(data.clips);setLive(data);setBusy(Boolean(data.processing||['queued','running'].includes(data.job?.status)));if(data.processing||['queued','running'].includes(data.job?.status))setWatching(true);setJobError(data.error||data.job?.error||'');setLoaded(true);setError('');}
  }catch(err){if(!cancelled)setError(err instanceof Error?err.message:'Could not load saved clips');}finally{inFlight=false;}}
  void load();const timer=setInterval(load,2500);return()=>{cancelled=true;if(timer)clearInterval(timer);};
 },[reelId,processing,retry]);
 useEffect(()=>{
  if(recovering)progressPanel.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 },[recovering]);
 async function regenerate(clipId?:string){
  if(recovering||busy)return;
  if(requestClip.current!==clipId)requestId.current='';
  requestClip.current=clipId;
  setSelected(clipId);setWatching(true);
  setRecovering(true);setRecoveryError('');
  try{
   // randomUUID is unavailable on HTTP IP addresses; getRandomValues works there.
   requestId.current ||= globalThis.crypto?.randomUUID?.() || `regen-${Date.now()}-${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
   const response=await fetch(`/api/experimental/reels/${reelId}/clips/regenerate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current,...(clipId?{clipId}:{})})});
   const data=await response.json();
   if(!response.ok){if(response.status<500)requestId.current='';throw new Error(data.error||'Could not regenerate clips');}
   requestId.current='';setBusy(Boolean(data.processing));setLive({processing:Boolean(data.processing),detail:'Flow: queued — next in line'});setJobError('');setRetry(r=>r+1);
  }catch(err){setRecoveryError(err instanceof Error?err.message:'Could not regenerate clips');}
  finally{setRecovering(false);}
 }
 const missing=clips.filter(c=>!c.available).length;
 const progress=projectProgress(live,clips.length-missing,clips.length,recovering);
 return <section aria-label="Project clip downloads" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted-foreground">{loaded?`${clips.filter(c=>c.available).length} of ${clips.length} clips ready`:'Loading saved clips…'}</p><ResultsEditor reelId={reelId}/></div>
  {(watching||busy||recovering)&&<div ref={progressPanel} className="scroll-mt-20"><ProjectGenerationProgress data={live} ready={clips.length-missing} total={clips.length} starting={recovering} reelId={reelId}/></div>}
  {loaded&&missing>0&&<div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
   <div className="min-w-0 flex-1"><p role="status" className="text-sm font-medium">{busy?'Creating your remaining clips…':`${missing} clip${missing===1?' needs':'s need'} attention`}</p><p className="mt-1 text-sm text-muted-foreground">Completed clips stay saved. Missing or rejected clips get new takes using the same script and character. Flow credits apply. The finished set will be edited and stitched automatically.</p></div>
   <Button onClick={()=>regenerate()} disabled={busy||recovering}>{recovering?<><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none"/>Starting…</>:busy?'Generation in progress':'Regenerate incomplete clips'}</Button>
  </div>}
  {recoveryError&&<p role="alert" className="text-sm text-destructive">{recoveryError}</p>}
  {jobError&&!busy&&<p role="alert" className="break-words text-sm text-muted-foreground">{jobError}</p>}
  {error&&<div role="alert" className="rounded-lg border p-4"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-3" onClick={()=>setRetry(r=>r+1)}>Retry loading</Button></div>}
  {loaded&&!clips.length&&<p className="rounded-lg border p-6 text-sm text-muted-foreground">No individual source clips are available for this project.</p>}
  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{clips.map(clip=><article key={clip.id} className="min-w-0 overflow-hidden rounded-lg border">
   {clip.available?<video aria-label={`Preview ${clip.id}`} src={`/api/experimental/reels/${reelId}/clips/${clip.id}/video`} controls playsInline preload="none" className="h-72 w-full bg-muted object-contain"/>:<div className="flex h-48 items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">{busy?<span className="flex flex-col items-center gap-3"><LoaderCircle aria-hidden className="size-6 animate-spin motion-reduce:animate-none"/>{progress.clipId===clip.id?progress.message:'Waiting for this clip'}</span>:clip.status==='missing'?'Saved file is unavailable':'This clip has not been completed'}</div>}
   <div className="space-y-3 p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">{clip.id}</h2><span className="text-sm text-muted-foreground">{clip.available?`${((clip.durationMs||0)/1000).toFixed(1)}s · ${(clip.bytes/1048576).toFixed(1)} MB`:'Not available'}</span></div><p className="break-words text-sm leading-relaxed text-muted-foreground">{clip.text||'Silent clip'}</p>{clip.available?<Button asChild variant="outline" className="w-full"><a href={`/api/experimental/reels/${reelId}/clips/${clip.id}/video?download=1`}>Download {clip.id}</a></Button>:<Button disabled variant="outline" className="w-full">Download {clip.id}</Button>}
    <Button variant="secondary" className="w-full" disabled={busy||recovering} onClick={()=>regenerate(clip.id)}>{(recovering&&selected===clip.id)||(busy&&progress.clipId===clip.id)?<LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none"/>:<RotateCcw aria-hidden className="size-4"/>}{recovering&&selected===clip.id?'Starting…':`Regenerate ${clip.id}`}</Button>
    {busy&&progress.clipId===clip.id&&<p role="status" className="text-xs text-muted-foreground">{progress.message}</p>}
   </div>
  </article>)}</div>
 </section>;
}

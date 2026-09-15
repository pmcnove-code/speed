"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {cn} from '@/lib/utils';
import styles from './results-editor.module.css';

type Clip={id:string;text:string;available:boolean;status:string;durationMs:number|null;bytes:number};
type Edit={id:string;status:string;error:string|null;log:string[]};
export function ResultsEditor({reelId}:{reelId:number}){
 const [open,setOpen]=useState(false),[pane,setPane]=useState<'clips'|'preview'>('clips');
 const [clips,setClips]=useState<Clip[]>([]),[edits,setEdits]=useState<Edit[]>([]),[canStitch,setCanStitch]=useState(false);
 const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false);
 const [clipId,setClipId]=useState<string|null>(null),[editId,setEditId]=useState<string|null>(null);
 const [transition,setTransition]=useState(''),[subtitles,setSubtitles]=useState(true),[size,setSize]=useState(54),[fade,setFade]=useState(true);
 const request=useRef<{key:string;id:string}|null>(null);
 const base=`/api/experimental/reels/${reelId}`;
 const active=edits.find(edit=>['queued','running'].includes(edit.status));
 const selected=clips.find(c=>c.id===clipId&&c.available)||clips.find(c=>c.available);
 const preview=editId?`${base}/edits/${editId}/video`:selected?`${base}/clips/${selected.id}/video`:null;
 useEffect(()=>{
  if(!open)return;
  let cancelled=false,inFlight=false;
  async function refresh(){
   if(inFlight)return;inFlight=true;
   try{
    const [clipResponse,editResponse]=await Promise.all([fetch(`${base}/clips`,{cache:'no-store'}),fetch(`${base}/edits`,{cache:'no-store'})]);
    const [clipData,editData]=await Promise.all([clipResponse.json(),editResponse.json()]);
    if(!clipResponse.ok)throw new Error(clipData.error||'Could not load clips');
    if(!editResponse.ok && editResponse.status!==409)throw new Error(editData.error||'Could not load exports');
    if(!cancelled){setClips(clipData.clips);setCanStitch(clipData.canStitch);setEdits(editData.edits||[]);setLoaded(true);setLoadError('');}
   }catch(error){if(!cancelled)setLoadError(error instanceof Error?error.message:'Could not load results');}
   finally{inFlight=false;}
  }
  void refresh();const timer=setInterval(refresh,3000);return()=>{cancelled=true;clearInterval(timer);};
 },[open,base]);
 async function stitch(){
  if(sending||active||!canStitch||loadError)return;
  setSending(true);setError('');
  const options={...(transition?{transition}:{}),subtitles,subtitleSize:size,subtitlePosition:'bottom',subtitleFade:fade};
  const key=JSON.stringify(options);if(request.current?.key!==key)request.current={key,id:globalThis.crypto?.randomUUID?.()||`stitch-${Date.now()}-${Math.random().toString(36).slice(2)}`};
  try{
   const response=await fetch(`${base}/edits`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:request.current.id,options})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not start editing');
   setEdits(rows=>[...rows.filter(r=>r.id!==data.edit.id),data.edit]);request.current=null;setPane('preview');
  }catch(error){setError(error instanceof Error?error.message:'Could not start editing');}finally{setSending(false);}
 }
 const field='mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm';
 return <>
  <Button type="button" variant="outline" size="sm" onClick={()=>setOpen(true)}>Clips & results</Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className={cn(styles.dialog,"sm:max-w-5xl")}>
   <DialogHeader><DialogTitle>Results editor · Reel #{reelId}</DialogTitle><DialogDescription>Preview and download individual clips, then edit and stitch them into a video.</DialogDescription></DialogHeader>
   <div className={styles.mobileTabs}><Button variant={pane==='clips'?'secondary':'ghost'} onClick={()=>setPane('clips')}>Clips</Button><Button variant={pane==='preview'?'secondary':'ghost'} onClick={()=>setPane('preview')}>Preview</Button></div>
   <div className={styles.body}>
    <section aria-label="Individual clips" className={cn(styles.clips,pane!=='clips'&&styles.hiddenMobile)}>
     <h3 className="text-sm font-semibold">Source clips{loaded?` · ${clips.filter(c=>c.available).length}/${clips.length} ready`:''}</h3>
     {!loaded&&!loadError&&<p role="status" className="py-4 text-sm text-muted-foreground">Loading saved clips…</p>}
     {loaded&&!clips.length&&<p className="py-4 text-sm text-muted-foreground">No individual Flow clips are available for this reel yet.</p>}
     {clips.map(clip=><div key={clip.id} className={styles.clip}>
      <button type="button" className={styles.clipButton} disabled={!clip.available} aria-label={`Preview ${clip.id}`} aria-pressed={!editId&&selected?.id===clip.id} onClick={()=>{setClipId(clip.id);setEditId(null);setPane('preview');}}><span className="flex justify-between gap-2 text-sm font-medium"><span>{clip.id}</span><span>{clip.available?`${((clip.durationMs||0)/1000).toFixed(1)}s`:clip.status==='missing'?'File unavailable':'Not ready'}</span></span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{clip.text||'Silent clip'}</span></button>
      {clip.available&&<a className="ml-2 mt-2 inline-block text-xs underline underline-offset-4" aria-label={`Download ${clip.id}`} href={`${base}/clips/${clip.id}/video?download=1`}>Download {clip.id} · {(clip.bytes/1048576).toFixed(1)} MB</a>}
     </div>)}
    </section>
    <section aria-label="Preview and automatic edit" className={cn(styles.preview,pane!=='preview'&&styles.hiddenMobile)}>
     <div><p className="mb-2 text-sm font-semibold">{editId?'Stitched result':selected?`${selected.id} · Original clip`:'Preview'}</p>{preview?<video key={preview} src={preview} controls playsInline preload="metadata" className={styles.video}/>:<p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Your downloaded clips will appear here.</p>}</div>
     <div className={styles.settings}><label className="text-sm">Transition<select aria-label="Transition" className={field} value={transition} onChange={e=>setTransition(e.target.value)}><option value="">Original</option><option value="cut">Cut</option><option value="dissolve">Dissolve</option><option value="fade">Fade to black</option></select></label><label className="text-sm">Subtitle size<select aria-label="Subtitle size" className={field} disabled={!subtitles} value={size} onChange={e=>setSize(Number(e.target.value))}><option value={42}>Small</option><option value={54}>Regular</option><option value={66}>Large</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subtitles} onChange={e=>setSubtitles(e.target.checked)}/>Subtitles</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!subtitles} checked={fade} onChange={e=>setFade(e.target.checked)}/>Fade subtitles</label></div>
     {active&&<div role="status"><p className="text-sm">{active.log.at(-1)?.match(/C(\d+)\/(\d+)/) ? `Editing clip ${Number(active.log.at(-1)?.match(/C(\d+)\/(\d+)/)?.[1])} of ${Number(active.log.at(-1)?.match(/C(\d+)\/(\d+)/)?.[2])}` : active.log.at(-1)?.includes('[stitch]') ? 'Stitching your edited clips…' : active.status==='queued' ? 'Your edit is queued' : 'Editing clips and preparing your video…'}</p><progress aria-label="Automatic editing progress" className="mt-2 h-2 w-full"/></div>}
     {[...edits].reverse().map((edit,i)=><div key={edit.id} className="rounded-md border p-3 text-sm"><p className="font-medium">Result {edits.length-i} · {edit.status==='done'?'Ready':edit.status==='error'?'Needs attention':edit.status==='queued'?'Queued':'Editing & stitching'}</p>{edit.status==='done'&&<div className="mt-2 flex gap-4"><button type="button" className="underline" onClick={()=>setEditId(edit.id)}>Watch result</button><a className="underline" href={`${base}/edits/${edit.id}/video?download=1`}>Download result</a></div>}{edit.error&&<details className="mt-2"><summary>Error details</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{[edit.error,...edit.log].join('\n')}</pre></details>}</div>)}
    </section>
   </div>
   {(error||loadError)&&<p role="alert" className="text-sm text-destructive">{error||loadError}</p>}
   <footer className={styles.footer}><p className="text-sm text-muted-foreground">{canStitch?`Uses all ${clips.length} clips in script order`:'Available when all clips are downloaded and verified'}</p><Button type="button" disabled={!loaded||!canStitch||Boolean(loadError)||sending||Boolean(active)} onClick={stitch}>{sending?'Starting…':active?'Editing & stitching…':'Edit & stitch automatically'}</Button></footer>
  </DialogContent></Dialog>
 </>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Edit = {id:string;status:string;error:string|null;log:string[];createdAt:string};
export function EditVideoDialog({reelId}:{reelId:number}) {
  const [open,setOpen]=useState(false);
  const [edits,setEdits]=useState<Edit[]>([]);
  const [error,setError]=useState("");
  const [sending,setSending]=useState(false);
  const [transition,setTransition]=useState("");
  const [subtitles,setSubtitles]=useState(true);
  const [size,setSize]=useState(54);
  const [position,setPosition]=useState("bottom");
  const [fade,setFade]=useState(true);
  const [preview,setPreview]=useState<string|null>(null);
  const request=useRef<{key:string;id:string}|null>(null);
  const endpoint=`/api/experimental/reels/${reelId}/edits`;
  const active=edits.find(edit=>['queued','running'].includes(edit.status));
  useEffect(()=>{
    if(!open) return;
    let cancelled=false;
    async function refresh() {
      try {
        const response=await fetch(endpoint,{cache:'no-store'});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error || 'Could not load edits');
        if(!cancelled) setEdits(data.edits);
      } catch(error) {if(!cancelled) setError(error instanceof Error?error.message:'Could not load edits');}
    }
    void refresh();
    const timer=setInterval(refresh,3000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[open,endpoint]);
  async function submit() {
    setSending(true); setError("");
    const options={...(transition?{transition}:{}),subtitles,subtitleSize:size,subtitlePosition:position,subtitleFade:fade};
    const key=JSON.stringify(options);
    if(request.current?.key!==key) request.current={key,id:crypto.randomUUID?.() || `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:request.current.id,options})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Could not start edit');
      setEdits(rows=>[...rows.filter(row=>row.id!==data.edit.id),data.edit]);
      request.current=null;
    } catch(error) {setError(error instanceof Error?error.message:'Could not start edit');}
    finally {setSending(false);}
  }
  const field="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm";
  return <>
    <Button type="button" variant="outline" size="sm" onClick={()=>setOpen(true)}>Edit video</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Edit saved video · #{reelId}</DialogTitle><DialogDescription>Export an edited copy from the saved footage. Your original stays available and no new clips are generated.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Transition<select aria-label="Transition" className={field} value={transition} onChange={e=>setTransition(e.target.value)}><option value="">Keep original</option><option value="cut">Cut</option><option value="dissolve">Dissolve</option><option value="fade">Fade through black</option></select></label>
        <label className="text-sm">Subtitle size<select aria-label="Subtitle size" className={field} value={size} disabled={!subtitles} onChange={e=>setSize(Number(e.target.value))}><option value={42}>Small</option><option value={54}>Regular</option><option value={66}>Large</option></select></label>
        <label className="text-sm">Subtitle position<select aria-label="Subtitle position" className={field} value={position} disabled={!subtitles} onChange={e=>setPosition(e.target.value)}><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label>
        <div className="space-y-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={subtitles} onChange={e=>setSubtitles(e.target.checked)}/>Show subtitles</label><label className="flex items-center gap-2"><input type="checkbox" checked={fade} disabled={!subtitles} onChange={e=>setFade(e.target.checked)}/>Fade subtitles</label></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {active && <div role="status" className="space-y-2"><p className="text-sm">{active.log.at(-1) || 'Editing your video'}</p><progress aria-label="Editing video" className="h-2 w-full"/></div>}
      <Button type="button" disabled={sending || Boolean(active)} onClick={submit}>{sending?'Starting edit…':active?'Editing…':'Create edited copy'}</Button>
      {preview && <video key={preview} src={preview} controls playsInline className="max-h-[40dvh] w-full rounded-md bg-black"/>}
      <div className="space-y-3">{[...edits].reverse().map((edit,i)=><div key={edit.id} className="rounded-md border p-3 text-sm"><p className="font-medium">Edited copy {edits.length-i} · {edit.status==='done'?'Ready':edit.status==='error'?'Needs attention':edit.status==='running'?'Rendering':'Queued'}</p>{edit.status==='done' && <div className="mt-2 flex gap-3"><button type="button" className="underline" onClick={()=>setPreview(`${endpoint}/${edit.id}/video`)}>Watch</button><a className="underline" href={`${endpoint}/${edit.id}/video?download=1`}>Download</a></div>}{edit.error && <details className="mt-2"><summary>Error details</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{edit.log.join('\n')}</pre></details>}</div>)}</div>
    </DialogContent></Dialog>
  </>;
}

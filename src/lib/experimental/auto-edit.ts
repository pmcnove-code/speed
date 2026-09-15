import {flowEditRequest} from './flow-worker';

type Edit = {id:string;status:string;error?:string|null;log?:string[]};
export async function automaticallyEditClips(workerId:string,reelId:number,onProgress:(detail:string)=>Promise<void>,dependencies:{request?:typeof flowEditRequest;sleep?:(ms:number)=>Promise<void>;now?:()=>number;revision?:number}={}) {
 const request=dependencies.request||flowEditRequest;
 const sleep=dependencies.sleep||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 const now=dependencies.now||Date.now;
 const deadline=now()+45*60*1000;
 async function readEdit(response:Response):Promise<Edit>{
  const body=await response.json();
  if(!response.ok||!body.edit?.id)throw new Error(body.error||'Automatic editing could not start');
  return body.edit;
 }
 try{
  await onProgress('Flow: [clip-edit] Preparing saved clips for automatic CapCut editing');
  // Repeated runner attempts recover this exact edit, including after a restart.
  let edit=await readEdit(await request(workerId,'',{requestId:`automatic-reel-${reelId}-v1${dependencies.revision ? `-recovery-${dependencies.revision}` : ""}`,options:{subtitles:true,subtitleSize:54,subtitlePosition:'bottom',subtitleFade:true}}));
  while(edit.status==='queued'||edit.status==='running'){
   if(now()>=deadline)throw new Error('Automatic editing is taking longer than expected. Check its status in Clips & results; saved clips are preserved.');
   await onProgress((edit.log||[]).map(line=>`Flow: ${line.replace(/^Flow:\s*/, '')}`).join('\n')||'Flow: [clip-edit] Editing saved clips');
   await sleep(2500);
   edit=await readEdit(await request(workerId,`/${edit.id}`));
  }
  if(edit.status!=='done')throw new Error([edit.error||'Automatic editing failed',...(edit.log||[])].join('\n'));
  await onProgress('Flow: [stitch] Saving your automatically edited video');
  const response=await request(workerId,`/${edit.id}/video`);
  if(!response.ok)throw new Error('Could not download the automatically edited video. The saved edit remains in Clips & results.');
  return Buffer.from(await response.arrayBuffer());
 }catch(error){throw Object.assign(error instanceof Error?error:new Error(String(error)),{code:'FLOW_TERMINAL'});}
}

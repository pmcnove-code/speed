import {NextResponse} from 'next/server';
import {and,eq,inArray} from 'drizzle-orm';
import {db,t} from '@/db';
import {getSession} from '@/lib/session';
import {regenerateFlowClips} from '@/lib/experimental/flow-worker';
export const runtime='nodejs';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!await getSession())return NextResponse.json({error:'unauthorized'},{status:401});
 const origin=req.headers.get('origin');
 const host=req.headers.get('x-forwarded-host')?.split(',')[0].trim()||req.headers.get('host')||new URL(req.url).host;
 if(origin){try{if(new URL(origin).host!==host)throw Error();}catch{return NextResponse.json({error:'Invalid origin'},{status:403});}}
 const id=Number((await params).id);
 if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Invalid project ID'},{status:400});
 let requestId:string;let clipId:string|undefined;
 try{const raw=await req.text();if(raw.length>1024)throw Error();const body=JSON.parse(raw);if(!body||Object.keys(body).some(k=>!['requestId','clipId'].includes(k))||typeof body.requestId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))throw Error();requestId=body.requestId;if(body.clipId!==undefined&&(typeof body.clipId!=='string'||!/^C\d{2,3}$/.test(body.clipId)))throw Error();clipId=body.clipId;}
 catch{return NextResponse.json({error:'Invalid recovery request'},{status:400});}
 const [job]=await db.select({workerJobId:t.reelJobs.workerJobId,status:t.reelJobs.status}).from(t.reelJobs).where(eq(t.reelJobs.id,id));
 if(!job)return NextResponse.json({error:'Project not found'},{status:404});
 if(['queued','running'].includes(job.status))return NextResponse.json({error:'This project is still processing. Wait for generation and editing to finish.'},{status:409});
 if(!job.workerJobId)return NextResponse.json({error:'No saved Flow project is available'},{status:409});
 try{
  const response=await regenerateFlowClips(job.workerJobId,requestId,...(clipId?[clipId]:[]));
  const data=await response.json();
  if(!response.ok)return NextResponse.json(data,{status:response.status});
  if(['queued','running','done'].includes(data.job?.status)){
   await db.update(t.reelJobs).set({status:'queued',queuedAt:data.job?.queuedAt?new Date(data.job.queuedAt):new Date(),stage:'clips',stageDetail:data.job.stageDetail||'Regenerating incomplete clips',error:null,finishedAt:null,leaseOwner:null,leaseExpiresAt:null,updatedAt:new Date()})
    .where(and(eq(t.reelJobs.id,id),eq(t.reelJobs.workerJobId,job.workerJobId),inArray(t.reelJobs.status,data.job.status==='done'?['error']:['done','error'])));
  }
  return NextResponse.json({processing:['queued','running'].includes(data.job?.status)},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Could not confirm recovery. Retry this request to check it without submitting twice.'},{status:502});}
}

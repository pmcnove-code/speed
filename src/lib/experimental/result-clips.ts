import {NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db,t} from '@/db';
import {getSession} from '@/lib/session';
import {flowClipsRequest} from './flow-worker';
import {parseByteRange} from './byte-range';

export async function reelClipsRequest(req:Request,idText:string,clipId?:string){
 if(!await getSession()) return NextResponse.json({error:'unauthorized'},{status:401});
 const id=Number(idText);
 if(!Number.isSafeInteger(id)||id<=0||(clipId&&!/^C\d{2,3}$/.test(clipId))) return NextResponse.json({error:'Invalid reel or clip ID'},{status:400});
 const [job]=await db.select({workerJobId:t.reelJobs.workerJobId,status:t.reelJobs.status,stage:t.reelJobs.stage,stageDetail:t.reelJobs.stageDetail,error:t.reelJobs.error}).from(t.reelJobs).where(eq(t.reelJobs.id,id));
 if(!job) return NextResponse.json({error:'Reel not found'},{status:404});
 if(!job.workerJobId) return clipId ? NextResponse.json({error:'Clip not found'},{status:404}) : NextResponse.json({clips:[],canStitch:false});
 try{
  const response=await flowClipsRequest(job.workerJobId,clipId);
  if(!response.ok||!clipId){const data=await response.json();return NextResponse.json(response.ok?{...data,job:{status:job.status,stage:job.stage,stageDetail:job.stageDetail,error:job.error}}:data,{status:response.status,headers:{'Cache-Control':'no-store'}});}
  const bytes=Buffer.from(await response.arrayBuffer());
  const download=new URL(req.url).searchParams.has('download');
  const range=parseByteRange(req.headers.get('range'),bytes.length);
  if(req.headers.has('range')&&!range&&!download) return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});
  const headers:Record<string,string>={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','Content-Disposition':download?`attachment; filename="reel-${id}-${clipId}.mp4"`:'inline'};
  if(range&&!download){headers['Content-Range']=`bytes ${range.start}-${range.end}/${bytes.length}`;headers['Content-Length']=String(range.end-range.start+1);return new NextResponse(new Uint8Array(bytes.subarray(range.start,range.end+1)),{status:206,headers});}
  headers['Content-Length']=String(bytes.length);return new NextResponse(new Uint8Array(bytes),{headers});
 }catch{return NextResponse.json({error:'Saved clips are temporarily unavailable. Try again shortly.'},{status:502});}
}

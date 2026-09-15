import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { flowEditRequest } from "./flow-worker";
import { normalizeEditOptions } from "../../../shared/flow/edit-options.mjs";
import { parseByteRange } from "./byte-range";

export async function reelEditRequest(req: Request, idText: string, editId?: string, video = false) {
  if (!await getSession()) return NextResponse.json({error:"unauthorized"},{status:401});
  const id=Number(idText);
  if(!Number.isSafeInteger(id) || id<=0 || (editId && !/^[a-f0-9]{64}$/.test(editId))) return NextResponse.json({error:"Invalid reel or edit ID"},{status:400});
  const [job]=await db.select({workerJobId:t.reelJobs.workerJobId,status:t.reelJobs.status}).from(t.reelJobs).where(eq(t.reelJobs.id,id));
  if(!job) return NextResponse.json({error:"Reel not found"},{status:404});
  if(!job.workerJobId || (req.method==="POST" && !["done","error"].includes(job.status))) return NextResponse.json({error:"All source clips must be downloaded and verified before stitching"},{status:409});
  let body;
  if(req.method==="POST") {
    const origin=req.headers.get("origin");
    const publicHost=req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || new URL(req.url).host;
    if(origin) {
      try {if(new URL(origin).host!==publicHost) return NextResponse.json({error:"Invalid origin"},{status:403});}
      catch {return NextResponse.json({error:"Invalid origin"},{status:403});}
    }
    try {
      const raw=await req.text();
      if(raw.length>16384) throw new Error("Edit request is too large");
      const parsed=JSON.parse(raw);
      if(!parsed || typeof parsed!=="object" || Array.isArray(parsed) || Object.keys(parsed).some(k=>!['requestId','options'].includes(k))) throw new Error("Only requestId and options are accepted");
      if(typeof parsed.requestId!=="string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(parsed.requestId)) throw new Error("requestId must contain 8–100 letters, numbers, underscores or hyphens");
      body={requestId:parsed.requestId,options:normalizeEditOptions(parsed.options)};
    } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Invalid edit request"},{status:400}); }
  }
  try {
    const response=await flowEditRequest(job.workerJobId,editId ? `/${editId}${video?"/video":""}` : "",body);
    if(!response.ok || !video) return NextResponse.json(await response.json(),{status:response.status,headers:{"Cache-Control":"no-store"}});
    const bytes=Buffer.from(await response.arrayBuffer());
    const range=parseByteRange(req.headers.get("range"),bytes.length);
    const download=new URL(req.url).searchParams.has("download");
    const headers:Record<string,string>={"Content-Type":"video/mp4","Accept-Ranges":"bytes","Cache-Control":"private, max-age=3600","Content-Disposition":download?`attachment; filename="reel-${id}-edit-${editId!.slice(0,8)}.mp4"`:"inline"};
    if(range && !download) {
      headers['Content-Range']=`bytes ${range.start}-${range.end}/${bytes.length}`;
      headers['Content-Length']=String(range.end-range.start+1);
      return new NextResponse(new Uint8Array(bytes.subarray(range.start,range.end+1)),{status:206,headers});
    }
    headers['Content-Length']=String(bytes.length);
    return new NextResponse(new Uint8Array(bytes),{headers});
  } catch { return NextResponse.json({error:"The editing worker is unavailable. Check edit status before retrying with the same requestId."},{status:502}); }
}

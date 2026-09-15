import { reelEditRequest } from "@/lib/experimental/edit-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context) {return reelEditRequest(req,(await params).id);}
export async function POST(req:Request,{params}:Context) {return reelEditRequest(req,(await params).id);}

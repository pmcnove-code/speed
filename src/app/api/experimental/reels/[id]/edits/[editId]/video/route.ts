import { reelEditRequest } from "@/lib/experimental/edit-api";
export const runtime = "nodejs";
export async function GET(req:Request,{params}:{params:Promise<{id:string;editId:string}>}) {
  const {id,editId}=await params; return reelEditRequest(req,id,editId,true);
}

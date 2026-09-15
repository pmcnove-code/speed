import {reelClipsRequest} from '@/lib/experimental/result-clips';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{id:string;clipId:string}>}){const {id,clipId}=await params;return reelClipsRequest(req,id,clipId);}

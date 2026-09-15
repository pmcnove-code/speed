import {reelClipsRequest} from '@/lib/experimental/result-clips';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return reelClipsRequest(req,(await params).id);}

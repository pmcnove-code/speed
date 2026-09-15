import Link from 'next/link';
import {notFound} from 'next/navigation';
import {eq} from 'drizzle-orm';
import {db,t} from '@/db';
import {ProjectClips} from '@/components/experimental/project-clips';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)notFound();
 const [job]=await db.select({id:t.reelJobs.id,hook:t.reelJobs.hook,status:t.reelJobs.status,workerJobId:t.reelJobs.workerJobId}).from(t.reelJobs).where(eq(t.reelJobs.id,id));if(!job)notFound();
 return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6"><header className="space-y-3"><Link href={`/videos/${id}`} className="text-sm text-muted-foreground underline underline-offset-4">Back to video</Link><h1 className="text-2xl font-semibold tracking-tight">Video #{id} clips</h1><p className="break-words text-sm text-muted-foreground">{job.hook||`Reel #${id}`}</p></header><ProjectClips reelId={id} processing={['queued','running'].includes(job.status)}/></main>;
}

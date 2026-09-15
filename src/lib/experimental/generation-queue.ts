export function generationQueue<T extends {id:number;status:string;queuedAt?:string|null;createdAt?:string|null}>(jobs:T[]):T[]{
  return jobs.filter(job=>job.status==='running'||job.status==='queued').sort((a,b)=>
    Number(b.status==='running')-Number(a.status==='running') ||
    (a.queuedAt||a.createdAt||'').localeCompare(b.queuedAt||b.createdAt||'') || a.id-b.id);
}

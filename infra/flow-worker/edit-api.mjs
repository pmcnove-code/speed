import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { normalizeEditOptions } from '../../shared/flow/edit-options.mjs';
import {resultClips} from './result-clips.mjs';
import { captionWordsFor, speechKeysFrom } from './speech.mjs';
import { concatClips } from './ffmpeg.mjs';

function failure(message, status = 400) { return Object.assign(new Error(message), {status}); }
export function createEditService({ root, getJob, render = concatClips, jobsRoot = join(dirname(root),"jobs"), timings = file => captionWordsFor(file, {...speechKeysFrom(),geminiKey:""}) }) {
  const records = new Map();
  let queue = Promise.resolve();
  let mutations = Promise.resolve();
  const publicEdit = row => ({ id:row.id, sourceJobId:row.sourceJobId, status:row.status, options:row.options, log:row.log, error:row.error || null, createdAt:row.createdAt, finishedAt:row.finishedAt || null });
  async function save(row) {
    await mkdir(root, {recursive:true});
    const path = join(root, `${row.id}.json`);
    await writeFile(`${path}.tmp`, JSON.stringify(row));
    await rename(`${path}.tmp`, path);
  }
  async function sourceFor(job) {
    const dir = dirname(job.videoPath || join(jobsRoot,job.id,"reel.mp4"));
    try { return JSON.parse(await readFile(join(dir,'edit-source.json'),'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw failure('Saved editing metadata is unreadable',409); }
    // Drafts created before edit-source.json retain exact phrase timings in the spec.
    const names = (await readdir(dir)).filter(name => /^capcut-[a-zA-Z0-9]+$/.test(name));
    for (const name of names.reverse()) {
      try {
        const spec = JSON.parse(await readFile(join(dir,name,'edit.json'),'utf8'));
        const video = spec.tracks.find(t=>t.type==='video').items;
        const text = spec.tracks.find(t=>t.type==='text')?.items || [];
        return {paths:video.map(v=>v.path),captions:video.map((v,i)=>{
          const transition = spec.operations?.find(o=>o.op==='transition' && o.target===`clip${i-1}`);
          return {transition:transition?.slug==='black-fade'?'fade':transition?'dissolve':'cut', phrases:text.filter(t=>t.start>=v.start && t.start<v.start+v.duration).map(t=>({text:t.text,startMs:Math.round((t.start-v.start)*1000),endMs:Math.round((t.start+t.duration-v.start)*1000)}))};
        })};
      } catch { /* Another retained compiler attempt may be complete. */ }
    }
    const clips=job.payload?.clips;
    if(Array.isArray(clips) && clips.length && clips.every(c=>/^C\d{2,3}$/.test(c.id) && typeof c.spoken==='string')) {
      return {paths:clips.map(c=>join(dir,`${c.id}.mp4`)),captions:clips.map(c=>({text:c.onScreen || c.spoken,spoken:c.spoken,hold:Boolean(c.hold),transition:c.scene?.transition || 'dissolve'})),needsTiming:true};
    }
    throw failure('This reel has no saved clip timeline. Its original video is still available.',409);
  }
  function enqueue(row) {
    queue = queue.then(async()=>{
      try {
        row.status='running'; row.error=null; row.log.push('Building your CapCut edit'); await save(row);
        const dir=join(root,row.id); await mkdir(dir,{recursive:true});
        if(row.source.needsTiming && row.options.subtitles) {
          row.log.push('Recovering subtitle timing from the saved audio'); await save(row);
          for(let i=0;i<row.source.paths.length;i++) {
            const caption=row.source.captions[i];
            if(caption.hold || !caption.text) continue;
            caption.words=await timings(row.source.paths[i]);
            if(!caption.words?.length) throw new Error('Could not recover subtitle timing from saved audio. Retry later or export with subtitles off.');
          }
          row.source.needsTiming=false; await save(row);
        }
        row.log.push('Rendering subtitles and transitions from saved footage'); await save(row);
        await render(row.source.paths,join(dir,'video.mp4'),row.source.captions,row.options,detail=>{
          row.log.push(detail.replace(/^Flow:\s*/,''));
          row.log=row.log.slice(-100);
        });
        row.status='done'; row.log.push('Your edited video is ready');
      } catch(error) {
        row.status='error'; row.error=String(error.message || error).slice(-1200); row.log.push(`Export failed: ${row.error}`);
      }
      row.finishedAt=new Date().toISOString(); await save(row);
    }).catch(error=>{ console.error(`Edit persistence failed: ${error.message}`); });
  }
  return {
    async restore() {
      await mkdir(root,{recursive:true});
      for(const name of await readdir(root)) {
        if(!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        let row;
        try {row=JSON.parse(await readFile(join(root,name),'utf8'));} catch {console.error(`Unreadable edit record: ${name}`);continue;}
        if(row.id!==name.slice(0,-5) || !Array.isArray(row.log) || !row.source?.paths) continue;
        records.set(row.id,row);
        if(['queued','running'].includes(row.status)) { row.status='queued'; row.log.push('Resuming saved edit after restart'); enqueue(row); }
      }
    },
    submit(sourceJobId, body) {
      const operation=mutations.then(async()=>{
        if(!body || Object.keys(body).some(k=>!['requestId','options'].includes(k))) throw failure('Only requestId and options are accepted');
        if(typeof body.requestId!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId)) throw failure('requestId must contain 8–100 letters, numbers, underscores or hyphens');
        let options; try { options=normalizeEditOptions(body.options); } catch(error) { throw failure(error.message); }
        const id=createHash('sha256').update(`${sourceJobId}:${body.requestId}`).digest('hex');
        const existing=records.get(id);
        if(existing) {
          if(JSON.stringify(existing.options)!==JSON.stringify(options)) throw failure('requestId already used with different options',409);
          return publicEdit(existing);
        }
        if([...records.values()].some(row=>row.sourceJobId===sourceJobId && ['queued','running'].includes(row.status))) throw failure('An edit for this reel is already running',409);
        const job=getJob(sourceJobId);
        if(!job) throw failure('Source job not found',404);
        if(job.status!=='done' && !(job.status==='error' && (await resultClips(job,jobsRoot)).canStitch)) throw failure('All source clips must be downloaded and verified before stitching',409);
        if(job.clipsReady && !(await resultClips(job,jobsRoot)).canStitch) throw failure('All source clips must be downloaded and verified before stitching',409);
        const source=await sourceFor(job);
        if(!source.paths?.length || source.paths.length>100) throw failure('Saved editing timeline is invalid',409);
        for(const path of source.paths) if(!(await stat(path).catch(()=>null))?.isFile()) throw failure('Saved source footage is missing',409);
        const row={id,sourceJobId,source,options,status:'queued',createdAt:new Date().toISOString(),log:['Edit queued — original video preserved']};
        await save(row); records.set(id,row); enqueue(row); return publicEdit(row);
      });
      mutations=operation.catch(()=>{}); return operation;
    },
    list(sourceJobId) { return [...records.values()].filter(r=>r.sourceJobId===sourceJobId).map(publicEdit); },
    get(sourceJobId,id) {const row=records.get(id); if(!row || row.sourceJobId!==sourceJobId) throw failure('Edit not found',404); return publicEdit(row);},
    video(sourceJobId,id) { const row=this.get(sourceJobId,id); if(row.status!=='done') throw failure('Edited video is not ready',409); return join(root,id,'video.mp4'); },
    async idle() {await mutations; await queue;},
  };
}

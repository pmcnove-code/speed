import {it,expect,vi} from 'vitest';
import {automaticallyEditClips} from './auto-edit';
const json=(edit:unknown)=>Response.json({edit});
it('automatically submits saved clips, reports editing and downloads only the completed export',async()=>{
 const request=vi.fn().mockResolvedValueOnce(json({id:'edit',status:'queued'})).mockResolvedValueOnce(json({id:'edit',status:'running',log:['[clip-edit] C01/2 editing source clip with CapCut']})).mockResolvedValueOnce(json({id:'edit',status:'done'})).mockResolvedValueOnce(new Response('finished MP4'));
 const progress=vi.fn();const bytes=await automaticallyEditClips('worker',90,progress,{request,sleep:async()=>{}});
 expect(bytes.toString()).toBe('finished MP4');
 expect(request.mock.calls[0]).toEqual(['worker','',{requestId:'automatic-reel-90-v1',options:{subtitles:true,subtitleSize:54,subtitlePosition:'bottom',subtitleFade:true}}]);
 expect(progress.mock.calls.flat().join('\n')).toContain('C01/2');
 expect(request.mock.calls.at(-1)).toEqual(['worker','/edit/video']);
});
it('reuses the same request key on restart and accepts an already completed edit',async()=>{
 const request=vi.fn(async(_id:string,suffix?:string)=>suffix?new Response('MP4'):json({id:'same',status:'done'}));
 for(let i=0;i<2;i++)await automaticallyEditClips('worker',90,async()=>{},{request});
 expect(request.mock.calls.filter(c=>!c[1]).length).toBe(2);
 expect(request.mock.calls[0]).toEqual(request.mock.calls[2]);
});
it('reports editing failures without treating them as new generation requests',async()=>{
 const request=vi.fn().mockResolvedValue(json({id:'edit',status:'error',error:'Caption export failed',log:['Saved clips preserved']}));
 await expect(automaticallyEditClips('worker',90,async()=>{},{request})).rejects.toMatchObject({code:'FLOW_TERMINAL',message:expect.stringContaining('Caption export failed')});
 expect(request).toHaveBeenCalledTimes(1);
});
it('uses a new edit key after source clip recovery',async()=>{
 const request=vi.fn().mockResolvedValueOnce(json({id:'new-edit',status:'done'})).mockResolvedValueOnce(new Response('new MP4'));
 await automaticallyEditClips('worker',94,async()=>{},{request,revision:1});
 expect(request.mock.calls[0][2]).toMatchObject({requestId:'automatic-reel-94-v1-recovery-1'});
});

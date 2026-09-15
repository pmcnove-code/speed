import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),select:vi.fn(),worker:vi.fn()}));
vi.mock('@/lib/session',()=>({getSession:mocks.session}));
vi.mock('@/db',()=>({db:{select:mocks.select},t:{reelJobs:{id:'id'}}}));
vi.mock('./flow-worker',()=>({flowEditRequest:mocks.worker}));
import {reelEditRequest} from './edit-api';
beforeEach(()=>{
 mocks.session.mockReset().mockResolvedValue({role:'admin'});
 mocks.select.mockReset().mockReturnValue({from:()=>({where:async()=>[{status:'done',workerJobId:'saved-worker'}]})});
 mocks.worker.mockReset().mockImplementation(async()=>Response.json({edit:{id:'a'.repeat(64),status:'queued'}},{status:202}));
});
it('requires a signed-in user before accessing edits',async()=>{
 mocks.session.mockResolvedValue(null);
 expect((await reelEditRequest(new Request('http://test/edits'),'84')).status).toBe(401);
 expect(mocks.select).not.toHaveBeenCalled();
});
it.each([{options:{command:'exec'},requestId:'test-request'},{options:{subtitleSize:5},requestId:'test-request'},{options:{subtitles:'false'},requestId:'test-request'},{options:{},requestId:'../../file'}])('rejects invalid edits without contacting worker',async body=>{
 const result=await reelEditRequest(new Request('http://test/edits',{method:'POST',body:JSON.stringify(body)}),'84');
 expect(result.status).toBe(400);expect(mocks.worker).not.toHaveBeenCalled();
});
it('submits only the database-bound worker ID and validated options',async()=>{
 const result=await reelEditRequest(new Request('http://test/edits',{method:'POST',body:JSON.stringify({requestId:'test-request',options:{subtitles:false,transition:'cut'}})}),'84');
 expect(result.status).toBe(202);expect(mocks.worker).toHaveBeenCalledWith('saved-worker','',expect.objectContaining({requestId:'test-request',options:expect.objectContaining({subtitles:false,transition:'cut'})}));
});
it('serves an edited video with exact byte ranges',async()=>{
 mocks.worker.mockResolvedValue(new Response(new Uint8Array([1,2,3,4,5]),{headers:{'Content-Type':'video/mp4'}}));
 const result=await reelEditRequest(new Request('http://test/video',{headers:{range:'bytes=1-3'}}),'84','a'.repeat(64),true);
 expect(result.status).toBe(206);expect(result.headers.get('content-range')).toBe('bytes 1-3/5');expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([2,3,4]);
});
it('accepts same-origin edits behind the reverse proxy but rejects another site',async()=>{
 const body=JSON.stringify({requestId:'proxy-request',options:{subtitles:false}});
 const headers={origin:'http://studio.example','x-forwarded-host':'studio.example','content-type':'application/json'};
 expect((await reelEditRequest(new Request('http://localhost:3000/edits',{method:'POST',headers,body}),'84')).status).toBe(202);
 expect((await reelEditRequest(new Request('http://localhost:3000/edits',{method:'POST',headers:{...headers,origin:'http://another.example'},body}),'84')).status).toBe(403);
});

import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({saved:null as Record<string,unknown>|null,insert:vi.fn()}));
vi.mock('@/db',()=>({t:{reelJobs:{}},db:{insert:mocks.insert}}));
vi.mock('@/db/schema',()=>({reelJobPublicColumns:()=>({})}));
vi.mock('@/lib/session',()=>({getSession:async()=>({role:'admin',label:'test'})}));
vi.mock('@/lib/experimental/flow-worker',()=>({isFlowReady:async()=>true}));
vi.mock('@/lib/experimental/reel-public',()=>({reelJobSelect:()=>({}),toPublicReelJob:(job:unknown)=>job}));
import {POST} from './route';
beforeEach(()=>{mocks.saved=null;mocks.insert.mockReset().mockReturnValue({values:(values:Record<string,unknown>)=>{mocks.saved=values;return{returning:async()=>[{id:123,...values}]};}});});
describe('video character gender',()=>{
 it.each([undefined,'other',{},'Female'])('rejects missing or invalid gender %j without queuing',async gender=>{
  const res=await POST(new Request('http://test/api/experimental/reels',{method:'POST',body:JSON.stringify({script:'My husband said hello.',characterGender:gender})}));
  expect(res.status).toBe(400);expect(mocks.insert).not.toHaveBeenCalled();
 });
 it.each(['male','female'])('saves the explicit %s selection, regardless of dialogue',async gender=>{
  const script='My husband said she should come.';
  const res=await POST(new Request('http://test/api/experimental/reels',{method:'POST',body:JSON.stringify({hook:'Exact hook.',script,characterGender:gender})}));
  expect(res.status).toBe(200);expect(mocks.saved).toMatchObject({characterGender:gender,script,hook:'Exact hook.',status:'queued'});
 });
});

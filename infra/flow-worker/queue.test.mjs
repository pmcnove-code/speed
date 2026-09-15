import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeJobs, queueAhead, queueLine } from "./queue.mjs";

function job(id, status) {
  return { id, status };
}

describe("generate queue", () => {
  it("counts jobs ahead of a queued reel", () => {
    const jobs = new Map([
      ["a", job("a", "running")],
      ["b", job("b", "queued")],
      ["c", job("c", "queued")],
      ["d", job("d", "done")],
    ]);
    assert.equal(queueAhead(jobs, "a"), 0);
    assert.equal(queueAhead(jobs, "b"), 1);
    assert.equal(queueAhead(jobs, "c"), 2);
    assert.equal(queueAhead(jobs, "d"), 0);
    assert.equal(activeJobs(jobs).length, 3);
    assert.match(queueLine(jobs, "c"), /2 reels ahead/i);
    assert.match(queueLine(jobs, "b"), /1 reel ahead/i);
  });

  it("says next in line when nothing is ahead", () => {
    const jobs = new Map([["a", job("a", "queued")]]);
    assert.equal(queueLine(jobs, "a"), "Flow: queued — next in line");
  });
});
it('puts regenerated old projects behind the running job and earlier queued requests',()=>{
 const jobs=new Map([
  ['old',{id:'old',status:'queued',createdAt:'2026-01-01',queuedAt:'2026-09-12T03:10:00Z'}],
  ['waiting',{id:'waiting',status:'queued',createdAt:'2026-09-12T03:05:00Z'}],
  ['active',{id:'active',status:'running',createdAt:'2026-09-12T03:09:00Z'}],
 ]);
 assert.deepEqual(activeJobs(jobs).map(j=>j.id),['active','waiting','old']);
 assert.match(queueLine(jobs,'old'),/2 reels ahead/);
});
it('restores legacy recovery order from its persisted request time',async()=>{
 const {compareQueue}=await import('./queue.mjs');
 const jobs=[{id:'old',status:'queued',createdAt:'2020-01-01',recoveryRequests:['regen-1789182389094-abc']},{id:'new',status:'queued',createdAt:'2026-09-12T01:00:00Z'}];
 assert.deepEqual(JSON.parse(JSON.stringify(jobs)).sort(compareQueue).map(j=>j.id),['new','old']);
});

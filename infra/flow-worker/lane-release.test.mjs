import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLaneRelease } from "./lane-release.mjs";

const realIdOf = (laneId) => (laneId.includes("::w") ? laneId.slice(0, laneId.indexOf("::w")) : laneId);
const lane = (accountId) => ({ accountId });

describe("createLaneRelease", () => {
  it("releases an account as soon as its only lane finishes", () => {
    const freed = [];
    const r = createLaneRelease({ lanes: [lane("a"), lane("b")], realIdOf, release: (id) => freed.push(id) });
    assert.equal(r.laneFinished("a"), "a");
    assert.deepEqual(freed, ["a"]);
    assert.equal(r.isReleased("b"), false);
  });

  it("holds a shared account until every one of its windows has finished", () => {
    const freed = [];
    const r = createLaneRelease({ lanes: [lane("a::w0"), lane("a::w1"), lane("a::w2")], realIdOf, release: (id) => freed.push(id) });
    assert.equal(r.laneFinished("a::w0"), null);
    assert.equal(r.laneFinished("a::w2"), null);
    assert.deepEqual(freed, []);
    assert.equal(r.laneFinished("a::w1"), "a");
    assert.deepEqual(freed, ["a"]);
  });

  it("never releases the same account twice, so another video's claim is safe", () => {
    const freed = [];
    const r = createLaneRelease({ lanes: [lane("a")], realIdOf, release: (id) => freed.push(id) });
    r.laneFinished("a");
    r.laneFinished("a");
    r.releaseAll(["a"]);
    assert.deepEqual(freed, ["a"]);
  });

  it("releaseAll frees only accounts still held", () => {
    const freed = [];
    const r = createLaneRelease({ lanes: [lane("a"), lane("b"), lane("c")], realIdOf, release: (id) => freed.push(id) });
    r.laneFinished("b");
    r.releaseAll(["a", "b", "c"]);
    assert.deepEqual(freed.sort(), ["a", "b", "c"]);
    assert.equal(freed.filter((id) => id === "b").length, 1);
  });

  it("ignores a lane it does not track", () => {
    const freed = [];
    const r = createLaneRelease({ lanes: [lane("a")], realIdOf, release: (id) => freed.push(id) });
    assert.equal(r.laneFinished("zzz"), null);
    assert.deepEqual(freed, []);
  });
});

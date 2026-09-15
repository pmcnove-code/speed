import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partitionClipsForLanes } from "./partition.mjs";

function clips(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `C${String(i + 1).padStart(2, "0")}` }));
}

describe("partitionClipsForLanes", () => {
  it("splits evenly when clips divide evenly across lanes", () => {
    const lanes = partitionClipsForLanes(clips(6), 2);
    assert.equal(lanes.length, 2);
    assert.deepEqual(lanes.map((l) => l.map((c) => c.id)), [
      ["C01", "C02", "C03"],
      ["C04", "C05", "C06"],
    ]);
  });

  it("distributes the remainder to the earliest lanes", () => {
    const lanes = partitionClipsForLanes(clips(7), 2);
    assert.deepEqual(lanes.map((l) => l.length), [4, 3]);
    assert.equal(lanes[0][0].id, "C01");
    assert.equal(lanes[1][0].id, "C05");
  });

  it("keeps clips in original order within each lane", () => {
    const lanes = partitionClipsForLanes(clips(10), 3);
    const flattened = lanes.flat().map((c) => c.id);
    assert.deepEqual(flattened, clips(10).map((c) => c.id));
  });

  it("never creates more lanes than clips", () => {
    const lanes = partitionClipsForLanes(clips(2), 5);
    assert.equal(lanes.length, 2);
    assert.deepEqual(lanes.map((l) => l.length), [1, 1]);
  });

  it("returns a single lane when laneCount is 1", () => {
    const lanes = partitionClipsForLanes(clips(4), 1);
    assert.equal(lanes.length, 1);
    assert.equal(lanes[0].length, 4);
  });

  it("returns an empty list for an empty clip list", () => {
    assert.deepEqual(partitionClipsForLanes([], 3), []);
  });

  it("treats a non-positive or fractional laneCount as 1", () => {
    assert.equal(partitionClipsForLanes(clips(3), 0).length, 1);
    assert.equal(partitionClipsForLanes(clips(3), -2).length, 1);
    assert.equal(partitionClipsForLanes(clips(4), 1.9).length, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mouseClickBox, pauseMs, pointInBox, pollPauseMs } from "./human.mjs";

describe("deterministic Playwright helpers", () => {
  it("uses explicit fixed waits", () => {
    assert.equal(pauseMs(250), 250);
    assert.equal(pollPauseMs(), 1_000);
  });

  it("targets the stable center of a box", () => {
    const box = { x: 100, y: 50, width: 80, height: 40 };
    assert.deepEqual(pointInBox(box), { x: 140, y: 70 });
  });

  it("clicks sidebar points without passing NaN coordinates to Chrome", async () => {
    const events = [];
    const page = { mouse: {
      move: async (x, y) => events.push(["move", x, y]),
      click: async (x, y) => events.push(["click", x, y]),
    } };
    assert.equal(await mouseClickBox(page, { x: 48, y: 210 }), true);
    assert.deepEqual(events, [["move", 48, 210], ["click", 48, 210]]);
    events.length = 0;
    assert.equal(await mouseClickBox(page, { x: 100, y: 50, width: 80, height: 40 }), true);
    assert.deepEqual(events, [["move", 112, 60], ["click", 112, 60]]);
    events.length = 0;
    for (const box of [null, { x: NaN, y: 5 }, { x: 5, y: 5, width: NaN }]) {
      assert.equal(await mouseClickBox(page, box), false);
    }
    assert.deepEqual(events, []);
  });
});

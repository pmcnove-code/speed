import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clickPointFromPlayBadge, isGridClipTile, newClipTitles, scoreAutoTitle } from "./tiles.mjs";

describe("isGridClipTile", () => {
  it("accepts the current 141x250 Flow tiles", () => {
    assert.equal(isGridClipTile({ width: 141, height: 250, left: 248, top: 76 }), true);
  });

  it("rejects chrome avatars and wide banners", () => {
    assert.equal(isGridClipTile({ width: 42, height: 42, left: 1358, top: 17 }), false);
    assert.equal(isGridClipTile({ width: 800, height: 200, left: 200, top: 80 }), false);
  });
});

describe("scoreAutoTitle", () => {
  it("scores Flow auto-titles against the spoken line", () => {
    assert.ok(
      scoreAutoTitle(
        "Character speaking morning alarm…",
        "Your 5 AM alarm isn't discipline. It's your body running on fumes.",
      ) >= 1,
    );
    assert.ok(
      scoreAutoTitle(
        "Doctor prescribing testosterone …",
        "Before the sun, already drained. Coffee was my breakfast. The doctor named it: low T.",
      ) >= 1,
    );
    assert.equal(
      scoreAutoTitle(
        "Elder speaking about fat health",
        "Your 5 AM alarm isn't discipline. It's your body running on fumes.",
      ),
      0,
    );
  });

  it("picks titles that appeared after the last generate", () => {
    const before = ["Elder speaking about fat health", "Man speaking about health and fat"];
    const after = [...before, "Person discussing morning alarm …"];
    assert.deepEqual(newClipTitles(before, after), ["Person discussing morning alarm …"]);
  });
});

describe("clickPointFromPlayBadge", () => {
  it("clicks up into the thumbnail for Flow's short play/title strip", () => {
    const pt = clickPointFromPlayBadge({ x: 260, y: 296, width: 184, height: 18 });
    assert.deepEqual(pt, { x: 352, y: 206 });
  });

  it("clicks inside a large play overlay instead of below it", () => {
    const pt = clickPointFromPlayBadge({ x: 248, y: 76, width: 444, height: 250 });
    assert.ok(pt);
    assert.ok(pt.y > 76 && pt.y < 200);
    assert.ok(pt.x > 248 && pt.x < 248 + 444);
  });
});

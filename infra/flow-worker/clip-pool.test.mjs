import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { createClipPool } from "./clip-pool.mjs";
import { generateReelConcurrent } from "./flow.mjs";
import { localSplitClips } from "./clips.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createClipPool", () => {
  it("hands out each clip exactly once, in order", () => {
    const pool = createClipPool(["C01", "C02", "C03"]);
    assert.deepEqual([pool.claim("a"), pool.claim("b"), pool.claim("a"), pool.claim("b")], ["C01", "C02", "C03", null]);
  });

  it("reserves a distinct first clip per lane and returns it on the first claim", () => {
    const pool = createClipPool(["C01", "C02", "C03", "C04"]);
    assert.equal(pool.reserve("a"), "C01");
    assert.equal(pool.reserve("b"), "C02");
    assert.equal(pool.reserve("a"), "C01");
    assert.equal(pool.claim("b"), "C02");
    assert.equal(pool.claim("a"), "C01");
    assert.equal(pool.claim("a"), "C03");
    assert.equal(pool.claim("b"), "C04");
  });

  it("never re-queues a failed clip", () => {
    const pool = createClipPool(["C01", "C02"]);
    const id = pool.claim("a");
    pool.fail(id);
    assert.equal(pool.claim("b"), "C02");
    assert.equal(pool.claim("a"), null);
    assert.deepEqual(pool.counts(), { pending: 0, reserved: 0, active: 1, done: 0, failed: 1 });
  });

  it("returns a checkpointed clip only to the lane that owns it", () => {
    const pool = createClipPool(["C01", "C02", "C03"], { owned: { b: ["C02"] } });
    assert.equal(pool.claim("a"), "C01");
    assert.equal(pool.claim("a"), "C03");
    assert.equal(pool.claim("a"), null);
    assert.equal(pool.claim("b"), "C02");
  });

  it("gives an owner its own clips before unowned ones", () => {
    const pool = createClipPool(["C01", "C02", "C03"], { owned: { b: ["C03"] } });
    assert.equal(pool.claim("b"), "C03");
    assert.equal(pool.claim("b"), "C01");
  });

  it("ignores ownership of unknown clip ids and reports done ids", () => {
    const pool = createClipPool(["C01"], { owned: { a: ["C99"] } });
    const id = pool.claim("a");
    pool.done(id);
    assert.deepEqual(pool.doneIds(), ["C01"]);
    assert.equal(pool.isDone("C01"), true);
    assert.equal(pool.claim("a"), null);
  });

  it("lets a faster lane take more clips when lanes run concurrently", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);
    const pool = createClipPool(ids);
    const counts = { slow: 0, fast: 0 };
    async function lane(name, ms) {
      for (let id = pool.claim(name); id; id = pool.claim(name)) {
        await sleep(ms);
        counts[name]++;
        pool.done(id);
      }
    }
    await Promise.all([lane("slow", 40), lane("fast", 4)]);
    assert.equal(pool.doneIds().length, 12);
    assert.ok(counts.fast > counts.slow, `fast ${counts.fast} vs slow ${counts.slow}`);
  });
});

const SCRIPT = [
  "Your gut is not lazy. It is inflamed from seed oils and late nights.",
  "Fix the plate first. Then energy follows. Meat and fat rebuild you.",
  "Stop eating the lie. Skip the cereal aisle entirely. Butter is not the enemy here.",
  "Eggs and steak carry everything you need. Salt your food and sleep deeply.",
  "Cook simple food every morning. Stop counting calories and start counting protein.",
  "Your grandmother ate real food. She never worried about a label.",
  "Try thirty days without sugar. Watch your energy climb every single week.",
  "Hunger is a signal, not a threat. Eat until you are satisfied and stop.",
  "Water and salt fix more than you think. Walk after every meal you eat.",
  "Sunlight in the morning matters. So does a dark room at night.",
  "Cut the snacks between meals. Your body needs a break from insulin.",
  "Ribeye, butter, salt, water. That is the whole secret to feeling better.",
].join(" ");

function baseInput(extra = {}) {
  return { personaName: "Farm Woman", voiceName: "Farm Woman", hook: "Your gut is not lazy.", script: SCRIPT, clips: [], ...extra };
}

function clipIds() {
  return localSplitClips({ hook: "Your gut is not lazy.", script: SCRIPT, characterName: "Farm Woman", voiceName: "Farm Woman" }).map((c) => c.id);
}

function lanesOf(...names) {
  return names.map((n) => ({ accountId: n, accountLabel: n, storageState: {}, resumeProjectUrl: "" }));
}

/** Fake lane runner that speaks the same contract as generateReel for pooled lanes. */
function fakeRunner({ msByLane = {}, failOn = {}, seen = {} } = {}) {
  return async (accountId, _state, input) => {
    seen[accountId] = { input, claimed: [] };
    const pool = input.__clipPool;
    if (!pool) {
      seen[accountId].claimed = [...input.__laneClipIds];
      return { laneDone: true, laneClipIds: [...input.__laneClipIds], credits: null, email: null };
    }
    let id;
    while ((id = pool.claim(accountId))) {
      seen[accountId].claimed.push(id);
      await sleep(msByLane[accountId] ?? 2);
      if (failOn[accountId] === id) {
        pool.fail(id);
        throw new Error(`simulated failure on ${id}`);
      }
      pool.done(id);
    }
    return { laneDone: true, laneClipIds: seen[accountId].claimed.filter((c) => pool.isDone(c)), credits: null, email: null };
  };
}

describe("generateReelConcurrent shared pool", () => {
  const savedPool = process.env.FLOW_CLIP_POOL;
  afterEach(() => {
    if (savedPool === undefined) delete process.env.FLOW_CLIP_POOL;
    else process.env.FLOW_CLIP_POOL = savedPool;
  });

  it("has enough clips to exercise the pool", () => {
    assert.ok(clipIds().length >= 6, `only ${clipIds().length} clips`);
  });

  it("finishes every clip exactly once and lets a fast lane absorb a slow lane's work", async () => {
    const ids = clipIds();
    const seen = {};
    const result = await generateReelConcurrent(lanesOf("slow", "fast1", "fast2"), baseInput({ recoveryTargetIds: ids }), {
      downloadDir: "unused",
      laneRunner: fakeRunner({ msByLane: { slow: 60, fast1: 3, fast2: 3 }, seen }),
    });
    const claimed = Object.values(seen).flatMap((s) => s.claimed);
    assert.equal(new Set(claimed).size, claimed.length, "a clip was handed out twice");
    assert.deepEqual([...claimed].sort(), [...ids].sort());
    assert.equal(result.clips, ids.length);
    assert.ok(seen.slow.claimed.length < Math.ceil(ids.length / 3), `slow lane still took ${seen.slow.claimed.length}`);
  });

  it("keeps a failed clip failed, keeps finished clips, and lets other lanes carry on", async () => {
    const ids = clipIds();
    const seen = {};
    const failing = ids[1];
    const result = await generateReelConcurrent(lanesOf("a", "b", "c"), baseInput({ recoveryTargetIds: ids }), {
      downloadDir: "unused",
      laneRunner: fakeRunner({ msByLane: { a: 5, b: 5, c: 5 }, failOn: { b: failing }, seen }),
    });
    const claimed = Object.values(seen).flatMap((s) => s.claimed);
    assert.equal(claimed.filter((id) => id === failing).length, 1, "failed clip was dispatched again");
    assert.equal(result.partialClips, true);
    assert.equal(result.clips, ids.length - 1);
    assert.equal(result.laneErrors.length, 1);
  });

  it("returns a checkpointed clip only to the lane that owns it", async () => {
    const ids = clipIds();
    const owned = ids[2];
    const lanes = lanesOf("a", "b", "c");
    lanes[1].ownedClipIds = [owned];
    const seen = {};
    await generateReelConcurrent(
      lanes,
      baseInput({ recoveryTargetIds: ids, resume: { clips: { [owned]: { clipState: { phase: "acquiring", costCommitted: true } } } } }),
      { downloadDir: "unused", laneRunner: fakeRunner({ seen }) },
    );
    assert.ok(seen.b.claimed.includes(owned));
    assert.ok(!seen.a.claimed.includes(owned) && !seen.c.claimed.includes(owned));
    assert.deepEqual(Object.keys(seen.a.input.resume.clips), []);
    assert.deepEqual(Object.keys(seen.b.input.resume.clips), [owned]);
  });

  it("falls back to fixed slices when a resumed clip has no known owner", async () => {
    const ids = clipIds();
    const seen = {};
    await generateReelConcurrent(
      lanesOf("a", "b"),
      baseInput({ recoveryTargetIds: ids, resume: { clips: { [ids[0]]: { clipState: { phase: "acquiring", costCommitted: true } } } } }),
      { downloadDir: "unused", laneRunner: fakeRunner({ seen }) },
    );
    assert.equal(seen.a.input.__clipPool, undefined);
    assert.ok(Array.isArray(seen.a.input.__laneClipIds));
  });

  it("honours the FLOW_CLIP_POOL=0 kill switch", async () => {
    process.env.FLOW_CLIP_POOL = "0";
    const ids = clipIds();
    const seen = {};
    await generateReelConcurrent(lanesOf("a", "b"), baseInput({ recoveryTargetIds: ids }), {
      downloadDir: "unused",
      laneRunner: fakeRunner({ seen }),
    });
    assert.equal(seen.a.input.__clipPool, undefined);
    assert.deepEqual([...seen.a.claimed, ...seen.b.claimed].sort(), [...ids].sort());
  });

  for (const mode of ["shared pool", "fixed slices"]) {
    it(`reports each lane as it settles, with its error, in ${mode} mode`, async () => {
      if (mode === "fixed slices") process.env.FLOW_CLIP_POOL = "0";
      const ids = clipIds();
      const finished = [];
      const failing = ids[1];
      await generateReelConcurrent(lanesOf("a", "b", "c"), baseInput({ recoveryTargetIds: ids }), {
        downloadDir: "unused",
        laneRunner: fakeRunner({ msByLane: { a: 4, b: 4, c: 4 }, failOn: { b: failing } }),
        onLaneFinished: (lane, error) => finished.push({ id: lane.accountId, failed: Boolean(error) }),
      }).catch(() => undefined);
      assert.deepEqual(finished.map((f) => f.id).sort(), ["a", "b", "c"]);
      assert.equal(finished.filter((f) => f.failed).length, mode === "shared pool" ? 1 : 0);
    });
  }

  it("still finishes the video if the lane-finished callback throws", async () => {
    const ids = clipIds();
    const result = await generateReelConcurrent(lanesOf("a", "b"), baseInput({ recoveryTargetIds: ids }), {
      downloadDir: "unused",
      laneRunner: fakeRunner({}),
      onLaneFinished: () => {
        throw new Error("callback exploded");
      },
    });
    assert.equal(result.clips, ids.length);
  });

  it("does not use the pool for a single lane", async () => {
    const ids = clipIds();
    const seen = {};
    await generateReelConcurrent(lanesOf("only"), baseInput({ recoveryTargetIds: ids }), {
      downloadDir: "unused",
      laneRunner: fakeRunner({ seen }),
    });
    assert.equal(seen.only.input.__clipPool, undefined);
  });
});

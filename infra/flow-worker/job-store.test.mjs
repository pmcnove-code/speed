import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("atomic worker job store", () => {
  it("round-trips checkpoints without persisting API keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "flow-job-store-"));
    process.env.FLOW_DATA_DIR = dir;
    const store = await import(`./job-store.mjs?test=${Date.now()}`);
    try {
      await store.savePersistedJob({
        id: "job-1",
        idempotencyKey: "reel-7",
        inputHash: "abc",
        status: "done",
        clipsReady: true,
        recoveryRequests: ["request-0001"],
        queuedAt: "2026-09-12T03:00:00.000Z",
        videoPath: null,
        stage: "clips",
        stageDetail: "C01 rendering",
        log: ["C01 rendering"],
        payload: {
          script: "Sacred copy.",
          deepgramKey: "must-not-persist",
          nested: { geminiKey: "also-secret" },
        },
        checkpoint: {
          projectUrl: "https://flow.google.com/project/project-1",
          clips: { C01: { clipState: { phase: "rendering", costCommitted: true } } },
        },
      });
      const [restored] = await store.loadPersistedJobs();
      assert.equal(restored.id, "job-1");
      assert.equal(restored.clipsReady, true);
      assert.equal(restored.videoPath, null);
      const freshStore = await import(`./job-store.mjs?fresh=${Date.now()}`);
      const [afterRestart] = await freshStore.loadPersistedJobs();
      assert.equal(afterRestart.clipsReady, true);
      assert.deepEqual(afterRestart.recoveryRequests,["request-0001"]);
      assert.equal(afterRestart.queuedAt,"2026-09-12T03:00:00.000Z");
      assert.equal(afterRestart.status, "done");
      assert.equal(restored.checkpoint.clips.C01.clipState.costCommitted, true);
      assert.equal(restored.payload.deepgramKey, undefined);
      assert.equal(restored.payload.nested.geminiKey, undefined);
      const disk = await readFile(join(dir, "jobs", "state", "job-1.json"), "utf8");
      assert.doesNotMatch(disk, /must-not-persist|also-secret/);
      assert.doesNotThrow(() => JSON.parse(disk));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

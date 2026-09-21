// Stand-in for flow.mjs used by server-concurrency.test.mjs. Each job's `hook`
// is a JSON array of lane durations in ms; lanes sleep that long instead of
// driving a browser. Every lane start/end is appended to timeline.jsonl.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const realId = (laneId) => (laneId.includes("::w") ? laneId.slice(0, laneId.indexOf("::w")) : laneId);

async function log(entry) {
  await appendFile(join(process.env.FLOW_DATA_DIR, "timeline.jsonl"), JSON.stringify({ t: Date.now(), ...entry }) + "\n");
}

function durations(body) {
  try {
    const list = JSON.parse(body.hook);
    return Array.isArray(list) && list.length ? list.map(Number) : [100];
  } catch {
    return [100];
  }
}

export async function generateReelConcurrent(lanes, body, { onLaneFinished } = {}) {
  const job = body.script;
  const ms = durations(body);
  await log({ event: "start", job, lanes: lanes.map((l) => l.accountId) });
  await Promise.all(
    lanes.map(async (lane, i) => {
      await sleep(ms[i % ms.length]);
      await log({ event: "laneEnd", job, lane: lane.accountId, account: realId(lane.accountId) });
      if (!process.env.FAKE_ENGINE_SKIP_LANE_HOOK) await onLaneFinished?.(lane, null);
    }),
  );
  await log({ event: "end", job });
  return { videoPath: null, clipsReady: true, clips: 8, credits: null, email: null };
}

export async function generateReel(accountId, _state, body) {
  const job = body.script;
  await log({ event: "single", job, account: accountId });
  await sleep(durations(body).reduce((a, b) => a + b, 0));
  await log({ event: "end", job });
  return { videoPath: null, clipsReady: true, clips: 8, credits: null, email: null };
}

export async function probeAccount() {
  return {};
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const SECRET = "test-worker-secret";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(dataDir, port) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      FLOW_TEST_ENGINE_MODULE: new URL("./test-support/fake-engine.mjs", import.meta.url).href,
      FLOW_DATA_DIR: dataDir,
      FLOW_WORKER_PORT: String(port),
      FLOW_WORKER_SECRET: SECRET,
      FLOW_HEADLESS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  return { child, output: () => output };
}

async function stopServer(server) {
  if (server.child.exitCode != null) return;
  server.child.kill("SIGTERM");
  await Promise.race([new Promise((r) => server.child.once("exit", r)), sleep(3000)]);
  if (server.child.exitCode == null) server.child.kill("SIGKILL");
}

async function waitHealthy(base, server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode != null) throw new Error(`worker exited early:\n${server.output()}`);
    if ((await fetch(`${base}/health`).catch(() => null))?.ok) return;
    await sleep(100);
  }
  throw new Error(`worker did not become healthy:\n${server.output()}`);
}

async function submit(base, name, laneMs) {
  const response = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-flow-secret": SECRET, "x-idempotency-key": `key-${name}` },
    body: JSON.stringify({ reelJobId: Math.floor(Math.random() * 1e6), hook: JSON.stringify(laneMs), script: name }),
  });
  assert.equal(response.status, 200, await response.text());
}

async function timeline(dataDir) {
  const raw = await readFile(join(dataDir, "timeline.jsonl"), "utf8").catch(() => "");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

describe("worker account sharing across videos (real server, fake render engine)", () => {
  it(
    "frees an account when its lane ends, lets a waiting video start on it, never double-books an account, and keeps the generating flag accurate",
    { timeout: 60_000 },
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "flow-concurrency-test-"));
      process.env.FLOW_DATA_DIR = dataDir;
      const store = await import("./store.mjs");
      const a = await store.createAccount("Account A");
      const b = await store.createAccount("Account B");
      await store.saveSession(a.id, { cookies: [], origins: [] });
      await store.saveSession(b.id, { cookies: [], origins: [] });

      const port = 39_000 + (process.pid % 900);
      const base = `http://127.0.0.1:${port}`;
      const server = startServer(dataDir, port);
      try {
        await waitHealthy(base, server);
        // V1: account lane ends fast (150 ms), the other lasts 6 s. V2 and V3 arrive while both accounts are held.
        await submit(base, "V1", [150, 6000]);
        await sleep(300);
        await submit(base, "V2", [2500, 2500, 2500]);
        await submit(base, "V3", [2500, 2500, 2500]);

        // While V2/V3 still run after V1 is done, the worker must still report generating.
        let generatingAfterV1 = null;
        const deadline = Date.now() + 40_000;
        let events = [];
        while (Date.now() < deadline) {
          events = await timeline(dataDir);
          const ended = new Set(events.filter((e) => e.event === "end").map((e) => e.job));
          if (ended.has("V1") && ended.size < 3 && generatingAfterV1 === null) {
            const health = await (await fetch(`${base}/health`, { headers: { "x-flow-secret": SECRET } })).json();
            generatingAfterV1 = health.generating;
          }
          if (ended.size === 3) break;
          await sleep(200);
        }
        const ended = new Set(events.filter((e) => e.event === "end").map((e) => e.job));
        assert.equal(ended.size, 3, `not every video finished:\n${server.output()}`);

        const at = (job, event) => events.find((e) => e.job === job && e.event === event)?.t;
        // 1. The video that had to wait (V2 and V3 both need an account) started before V1 finished:
        //    the account another video freed was shared instead of held to the end.
        const waiter = at("V2", "start") > at("V3", "start") ? "V2" : "V3";
        assert.ok(at(waiter, "start") < at("V1", "end"), `${waiter} only started after V1 ended - accounts were held to the end`);

        // 2. It used a single freed account through same-account windows, not the account V1 still held.
        const early = events.find((e) => e.job === waiter && e.event === "start");
        const accountsUsed = new Set(early.lanes.map((l) => l.split("::w")[0]));
        assert.equal(accountsUsed.size, 1);
        assert.ok(early.lanes.every((l) => l.includes("::w")));

        // 3. No account is ever used by two videos at once.
        const intervals = {};
        for (const job of ["V1", "V2", "V3"]) {
          const start = events.find((e) => e.job === job && e.event === "start");
          for (const laneId of start.lanes) {
            const acct = laneId.split("::w")[0];
            const laneEnds = events.filter((e) => e.job === job && e.event === "laneEnd" && e.account === acct).map((e) => e.t);
            (intervals[acct] ||= []).push({ job, from: start.t, to: Math.max(...laneEnds) });
          }
        }
        for (const [acct, list] of Object.entries(intervals)) {
          const merged = Object.values(Object.groupBy(list, (i) => i.job)).map((g) => ({ job: g[0].job, from: g[0].from, to: Math.max(...g.map((i) => i.to)) })).sort((x, y) => x.from - y.from);
          for (let i = 1; i < merged.length; i++) {
            assert.ok(merged[i].from >= merged[i - 1].to - 50, `account ${acct} used by ${merged[i - 1].job} and ${merged[i].job} at the same time`);
          }
        }

        // 4. The generating flag stayed true while other videos were still running.
        const t0 = events[0].t;
        const summary = events.map((e) => `${((e.t - t0) / 1000).toFixed(1)}s ${e.job} ${e.event} ${(e.lanes || [e.lane]).filter(Boolean).map((l) => l.slice(0, 4) + (l.includes("::w") ? l.slice(-3) : "")).join(",")}`).join("\n");
        assert.equal(generatingAfterV1, true, `worker reported not generating while V2/V3 were still running (observed: ${generatingAfterV1})\n${summary}`);
      } finally {
        await stopServer(server);
        await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );
});

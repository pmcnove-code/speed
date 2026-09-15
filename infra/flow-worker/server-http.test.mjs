import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const SECRET = "test-worker-secret";

function startServer(dataDir, port) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      FLOW_DATA_DIR: dataDir,
      FLOW_WORKER_PORT: String(port),
      FLOW_WORKER_SECRET: SECRET,
      FLOW_HEADLESS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return { child, output: () => output };
}

async function stopServer(server) {
  if (server.child.exitCode != null) return;
  server.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (server.child.exitCode == null) server.child.kill("SIGKILL");
}

async function waitHealthy(base, server) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode != null) {
      throw new Error(`worker exited early:\n${server.output()}`);
    }
    const response = await fetch(`${base}/health`).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`worker did not become healthy:\n${server.output()}`);
}

async function submit(base, key, script, characterGender) {
  return fetch(`${base}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flow-secret": SECRET,
      "x-idempotency-key": key,
    },
    body: JSON.stringify({
      reelJobId: 42,
      ...(characterGender === undefined ? {} : {characterGender}),
      hook: script,
      script,
      deepgramKey: "must-never-reach-disk",
    }),
  });
}

describe("worker HTTP durability", () => {
  it(
    "deduplicates POST /jobs and keeps the same worker ID after restart",
    { timeout: 30_000 },
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "flow-http-test-"));
      const port = 38_000 + (process.pid % 1_000);
      const base = `http://127.0.0.1:${port}`;
      let server = startServer(dataDir, port);
      try {
        await waitHealthy(base, server);
        const firstResponse = await submit(base, "reel:42:hash", "Sacred copy.");
        assert.equal(firstResponse.status, 200);
        const first = await firstResponse.json();

        const duplicateResponse = await submit(base, "reel:42:hash", "Sacred copy.");
        assert.equal(duplicateResponse.status, 200);
        const duplicate = await duplicateResponse.json();
        assert.equal(duplicate.job.id, first.job.id);
        assert.equal(duplicate.idempotent, true);

        const conflict = await submit(base, "reel:42:hash", "Different copy.");
        assert.equal(conflict.status, 409);

        const femaleResponse=await submit(base,"reel:43:female","Exact dialogue.","female");
        assert.equal(femaleResponse.status,200);
        const female=await femaleResponse.json();
        assert.equal((await submit(base,"reel:43:female","Exact dialogue.","male")).status,409);
        assert.equal((await submit(base,"invalid-gender","Exact dialogue.","invalid")).status,400);
        await stopServer(server);
        server = startServer(dataDir, port);
        await waitHealthy(base, server);
        const afterRestart = await submit(base, "reel:42:hash", "Sacred copy.");
        assert.equal(afterRestart.status, 200);
        assert.equal((await afterRestart.json()).job.id, first.job.id);

        const femaleAgain=await submit(base,"reel:43:female","Exact dialogue.","female");
        assert.equal((await femaleAgain.json()).job.id,female.job.id);
        const stateNames = (await readdir(join(dataDir, "jobs", "state"))).filter(name => name.endsWith(".json"));
        const disk = await Promise.all(
          stateNames.map((name) => readFile(join(dataDir, "jobs", "state", name), "utf8")),
        );
        const femaleState=disk.map(JSON.parse).find(job=>job.id===female.job.id);
        assert.equal(femaleState.payload.characterGender,"female");
        assert.doesNotMatch(disk.join("\n"), /must-never-reach-disk/);
      } finally {
        await stopServer(server);
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  );
});

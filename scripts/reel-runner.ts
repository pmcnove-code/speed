import "dotenv/config";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { runReelJob } from "../src/lib/experimental/reel";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://copy:copy@localhost:5432/copystudio";
const CONCURRENCY = Math.max(1, Number(process.env.REEL_RUNNER_CONCURRENCY) || 6);
const LEASE_SECONDS = 90;
const HEARTBEAT_MS = 20_000;
const IDLE_MS = 2_000;
const owner = `${hostname()}:${process.pid}:${randomUUID()}`;
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: CONCURRENCY + 2,
});
let stopping = false;
let lastServiceHeartbeat = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSingleton(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    "select pg_try_advisory_lock(hashtext('copy-studio-reel-runner')) as locked",
  );
  return Boolean(result.rows[0]?.locked);
}

async function claimNext(client: PoolClient): Promise<number | null> {
  const result = await client.query<{ id: number }>(
    `
      with leased as (
        update "reel_jobs"
        set lease_owner = $1, lease_expires_at = now() + interval '${LEASE_SECONDS} seconds'
        where id = (
          select id from "reel_jobs"
          where status = 'queued' and (lease_owner is null or lease_expires_at < now())
          order by queued_at asc
          limit 1
          for update skip locked
        )
        returning id
      )
      select id from leased
    `,
    [owner],
  );
  return result.rows[0]?.id ?? null;
}

async function heartbeat(client: PoolClient, id: number) {
  await client.query(
    `
      update "reel_jobs"
      set worker_heartbeat_at = now()
      where id = $1 and lease_owner = $2
    `,
    [id, owner],
  );
}

async function releaseLease(client: PoolClient, id: number) {
  await client.query(
    `
      update "reel_jobs"
      set lease_owner = null, lease_expires_at = null, updated_at = now()
      where id = $1 and lease_owner = $2
    `,
    [id, owner],
  );
}

async function heartbeatService(client: PoolClient) {
  const now = Date.now();
  if (now - lastServiceHeartbeat < 10_000) return;
  lastServiceHeartbeat = now;
  await client.query(
    `
      insert into app_settings ("key", "value")
      values ('reel_runner_heartbeat', $1)
      on conflict ("key") do update set "value" = excluded."value"
    `,
    [JSON.stringify({ owner, at: new Date(now).toISOString() })],
  );
}

async function runClaimed(id: number): Promise<void> {
  const client = await pool.connect();
  console.log(`[reel-runner] claimed reel ${id}`);
  const timer = setInterval(() => {
    heartbeat(client, id)
      .then(() => heartbeatService(client))
      .catch((error) => {
        console.error(`[reel-runner] heartbeat ${id} failed: ${error instanceof Error ? error.message : error}`);
      });
  }, HEARTBEAT_MS);
  timer.unref();
  try {
    await heartbeat(client, id);
    await runReelJob(id);
  } finally {
    clearInterval(timer);
    await releaseLease(client, id);
    client.release();
  }
}

async function main() {
  const lockClient = await pool.connect();
  try {
    while (!stopping && !(await acquireSingleton(lockClient))) {
      console.log("[reel-runner] another singleton owns the queue; waiting");
      await sleep(10_000);
    }
    if (stopping) return;
    console.log(`[reel-runner] ready as ${owner} (concurrency ${CONCURRENCY})`);
    const inFlight = new Map<number, Promise<void>>();
    while (!stopping) {
      await heartbeatService(lockClient);
      // Claim up to CONCURRENCY jobs in parallel
      while (inFlight.size < CONCURRENCY && !stopping) {
        const id = await claimNext(lockClient);
        if (!id) break;
        const job = runClaimed(id)
          .catch((error) => {
            console.error(
              `[reel-runner] reel ${id} crashed: ${error instanceof Error ? error.stack : error}`,
            );
          })
          .finally(() => {
            inFlight.delete(id);
          });
        inFlight.set(id, job);
      }
      // Wait for a job to finish or timeout before claiming more
      if (!inFlight.size) {
        await sleep(IDLE_MS);
      } else {
        await Promise.race([...inFlight.values(), sleep(IDLE_MS)]);
      }
    }
    // On shutdown, wait for in-flight jobs to finish
    if (inFlight.size > 0) {
      console.log(`[reel-runner] waiting for ${inFlight.size} in-flight jobs`);
      await Promise.allSettled([...inFlight.values()]);
    }
  } finally {
    lockClient.release();
    await pool.end();
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main().catch((error) => {
  console.error(`[reel-runner] fatal: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});

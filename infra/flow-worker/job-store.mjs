import { chmod, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "./store.mjs";

const JOBS_DIR = join(DATA_DIR, "jobs");
const JOB_STATE_DIR = join(JOBS_DIR, "state");
const LEGACY_JOBS_PATH = join(JOBS_DIR, "index.json");

let chain = Promise.resolve();
let loaded = false;
const records = new Map();

function locked(fn) {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:brainKey|deepgramKey|geminiKey|apiKey|secret|token|password|storageState)$/i.test(key)) {
      continue;
    }
    out[key] = withoutSecrets(item);
  }
  return out;
}

function serializableJob(job) {
  return {
    id: job.id,
    idempotencyKey: job.idempotencyKey || null,
    inputHash: job.inputHash || null,
    status: job.status,
    stage: job.stage,
    stageDetail: job.stageDetail || "",
    log: Array.isArray(job.log) ? job.log : [],
    error: job.error || null,
    accountId: job.accountId || null,
    accountLabel: job.accountLabel || null,
    videoPath: job.videoPath || null,
    clipsReady: Boolean(job.clipsReady),
    payload: withoutSecrets(job.payload || {}),
    checkpoint: job.checkpoint || {},
    queuedAt:job.queuedAt || null,
    createdAt: job.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    heartbeatAt: job.heartbeatAt || null,
    resumeAttempts: Number(job.resumeAttempts || 0),
    partialClips:Boolean(job.partialClips),
    recoveryTargetIds:job.recoveryTargetIds || null,
    recoverySelections:job.recoverySelections || {},
    recoveryRequests: job.recoveryRequests || [],
  };
}

async function loadRaw() {
  const rows = [];
  try {
    for (const name of await readdir(JOB_STATE_DIR)) {
      if (!name.endsWith(".json")) continue;
      try {
        rows.push(JSON.parse(await readFile(join(JOB_STATE_DIR, name), "utf8")));
      } catch {
        // Ignore an individually corrupt record; other jobs remain recoverable.
      }
    }
  } catch {
    // State directory is created on first save.
  }
  if (rows.length) return rows;
  try {
    const parsed = JSON.parse(await readFile(LEGACY_JOBS_PATH, "utf8"));
    return Array.isArray(parsed?.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

function jobPath(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(JOB_STATE_DIR, `${safe}.json`);
}

async function writeRaw(row) {
  await mkdir(JOB_STATE_DIR, { recursive: true, mode: 0o700 });
  const path = jobPath(row.id);
  const temp = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(row, null, 2);
  await writeFile(temp, body, { mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600).catch(() => undefined);
}

export async function loadPersistedJobs() {
  return locked(async () => {
    if (!loaded) {
      for (const row of await loadRaw()) {
        if (row?.id) records.set(String(row.id), row);
      }
      loaded = true;
    }
    return [...records.values()].map((row) => structuredClone(row));
  });
}

export async function savePersistedJob(job) {
  return locked(async () => {
    if (!loaded) {
      for (const row of await loadRaw()) {
        if (row?.id) records.set(String(row.id), row);
      }
      loaded = true;
    }
    const row = serializableJob(job);
    records.set(row.id, row);
    await writeRaw(row);
    return structuredClone(row);
  });
}

export async function prunePersistedJobs({ before, keep = 250 } = {}) {
  return locked(async () => {
    if (!loaded) {
      for (const row of await loadRaw()) {
        if (row?.id) records.set(String(row.id), row);
      }
      loaded = true;
    }
    const terminal = [...records.values()]
      .filter((row) => row.status === "done" || row.status === "error")
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const remove = terminal.slice(Math.max(0, Number(keep) || 0));
    const cutoff = before ? new Date(before).getTime() : 0;
    for (const row of terminal) {
      if (cutoff && new Date(row.updatedAt || 0).getTime() < cutoff) remove.push(row);
    }
    for (const row of new Set(remove)) {
      records.delete(row.id);
      await unlink(jobPath(row.id)).catch(() => undefined);
      await rm(join(JOBS_DIR, row.id), { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

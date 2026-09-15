import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, unlink, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isAccountEmail } from "./identity.mjs";

const DATA_DIR = process.env.FLOW_DATA_DIR || "/data/flow-sessions";
const INDEX_PATH = join(DATA_DIR, "index.json");

let chain = Promise.resolve();

function lock(fn) {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function accountDir(id) {
  return join(DATA_DIR, id);
}

export function profileDir(id) {
  return join(DATA_DIR, id, "chrome");
}

function sessionPath(id) {
  return join(DATA_DIR, `${id}.json`);
}

function readyPath(id) {
  return join(DATA_DIR, id, "ready.json");
}

function publicEmail(email) {
  return isAccountEmail(email) ? email.trim() : null;
}

function publicAccount(row, connected) {
  return {
    id: row.id,
    label: row.label,
    email: publicEmail(row.email),
    connected,
    status: row.status || (connected ? "unknown" : "unknown"),
    creditsRemaining: row.creditsRemaining ?? null,
    lastUsed: row.lastUsed ?? null,
    lastError: row.lastError ?? null,
    lastChecked: row.lastChecked ?? null,
    restingUntil: row.restingUntil ?? null,
  };
}

async function readIndexRaw() {
  try {
    const raw = await readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      lastPickedId: parsed.lastPickedId ?? null,
    };
  } catch {
    return { accounts: [], lastPickedId: null };
  }
}

async function writeIndexRaw(data) {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${INDEX_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(tmp, INDEX_PATH);
  await chmod(INDEX_PATH, 0o600).catch(() => undefined);
}

async function sessionExists(id) {
  try {
    await readFile(sessionPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function hasChromeProfile(id) {
  try {
    const info = await stat(profileDir(id));
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function unlockProfile(id) {
  const dir = profileDir(id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await unlink(join(dir, name)).catch(() => undefined);
  }
}

export async function readReady(id) {
  try {
    return JSON.parse(await readFile(readyPath(id), "utf8"));
  } catch {
    return { characters: {} };
  }
}

export async function writeReady(id, character, voiceName, extra = {}) {
  const current = await readReady(id);
  current.characters = current.characters || {};
  current.characters[character] = {
    ...(current.characters[character] || {}),
    voiceName,
    ...extra,
    at: new Date().toISOString(),
  };
  await mkdir(accountDir(id), { recursive: true, mode: 0o700 });
  await writeFile(readyPath(id), JSON.stringify(current, null, 2), { mode: 0o600 });
}

export async function listAccounts() {
  return lock(async () => {
    const index = await readIndexRaw();
    const accounts = [];
    let dirty = false;
    for (const row of index.accounts) {
      if (row.email && !isAccountEmail(row.email)) {
        row.email = null;
        dirty = true;
      }
      const connected = await sessionExists(row.id);
      let status = row.status || "unknown";
      if (!connected) status = "unknown";
      accounts.push(publicAccount({ ...row, status }, connected));
    }
    if (dirty) await writeIndexRaw(index);
    return { accounts, lastPickedId: index.lastPickedId };
  });
}

export async function createAccount(label) {
  const trimmed = String(label || "").trim().slice(0, 80);
  if (!trimmed) throw new Error("Account label is required.");
  return lock(async () => {
    const index = await readIndexRaw();
    const row = {
      id: randomUUID(),
      label: trimmed,
      email: null,
      status: "unknown",
      creditsRemaining: null,
      lastUsed: null,
      lastError: null,
      lastChecked: null,
      restingUntil: null,
    };
    index.accounts.push(row);
    await writeIndexRaw(index);
    return publicAccount(row, false);
  });
}

export async function updateAccount(id, patch) {
  return lock(async () => {
    const index = await readIndexRaw();
    const row = index.accounts.find((a) => a.id === id);
    if (!row) throw new Error("Account not found.");
    if (typeof patch.label === "string" && patch.label.trim()) row.label = patch.label.trim().slice(0, 80);
    if (patch.status) row.status = patch.status;
    if ("creditsRemaining" in patch) row.creditsRemaining = patch.creditsRemaining;
    if ("lastUsed" in patch) row.lastUsed = patch.lastUsed;
    if ("lastError" in patch) row.lastError = patch.lastError;
    if ("lastChecked" in patch) row.lastChecked = patch.lastChecked;
    if ("restingUntil" in patch) row.restingUntil = patch.restingUntil;
    if ("email" in patch) {
      row.email = publicEmail(patch.email);
    }
    await writeIndexRaw(index);
    return publicAccount(row, await sessionExists(id));
  });
}

export async function removeAccount(id) {
  return lock(async () => {
    const index = await readIndexRaw();
    index.accounts = index.accounts.filter((a) => a.id !== id);
    if (index.lastPickedId === id) index.lastPickedId = null;
    await writeIndexRaw(index);
    await unlink(sessionPath(id)).catch(() => undefined);
    await rm(accountDir(id), { recursive: true, force: true }).catch(() => undefined);
  });
}

export async function saveSession(id, state) {
  return lock(async () => {
    const index = await readIndexRaw();
    const row = index.accounts.find((a) => a.id === id);
    if (!row) throw new Error("Account not found.");
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    const path = sessionPath(id);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await rename(tmp, path);
    await chmod(path, 0o600).catch(() => undefined);
    row.status = "connected";
    row.lastError = null;
    row.restingUntil = null;
    row.lastChecked = new Date().toISOString();
    await writeIndexRaw(index);
    return publicAccount(row, true);
  });
}

export async function clearSession(id) {
  return lock(async () => {
    const index = await readIndexRaw();
    const row = index.accounts.find((a) => a.id === id);
    if (!row) throw new Error("Account not found.");
    await unlink(sessionPath(id)).catch(() => undefined);
    await rm(accountDir(id), { recursive: true, force: true }).catch(() => undefined);
    row.status = "unknown";
    row.creditsRemaining = null;
    row.email = null;
    row.lastError = null;
    await writeIndexRaw(index);
    return publicAccount(row, false);
  });
}

export async function readSession(id) {
  const raw = await readFile(sessionPath(id), "utf8");
  return JSON.parse(raw);
}

export async function tryReadSession(id) {
  try {
    return await readSession(id);
  } catch {
    return null;
  }
}

export async function markLastPicked(id) {
  return lock(async () => {
    const index = await readIndexRaw();
    index.lastPickedId = id;
    const row = index.accounts.find((a) => a.id === id);
    if (row) row.lastUsed = new Date().toISOString();
    await writeIndexRaw(index);
  });
}

export { DATA_DIR };

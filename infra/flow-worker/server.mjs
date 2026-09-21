import {createClipRecovery} from "./clip-recovery.mjs";
import { appendJobLog as recordJobProgress } from "./job-progress.mjs";
import { resultClips, resultClipFile } from "./result-clips.mjs";
import { createEditService } from "./edit-api.mjs";
import { normalizeCharacterGender } from "../../shared/flow/gender.mjs";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyFlowFailure, orderAccountsForRotate } from "./rotate.mjs";
import { queueAhead, queueLine, compareQueue, queueTime } from "./queue.mjs";
import { createLaneRelease } from "./lane-release.mjs";
import {
  clearSession,
  createAccount,
  DATA_DIR,
  hasChromeProfile,
  listAccounts,
  markLastPicked,
  removeAccount,
  saveSession,
  tryReadSession,
  updateAccount,
} from "./store.mjs";
import { restoreManualLogin, captureFrame, confirmLogin, getLogin, sendInput, startLogin, stopLogin } from "./login.mjs";
import {
  loadPersistedJobs,
  prunePersistedJobs,
  savePersistedJob,
} from "./job-store.mjs";

const PORT = Number(process.env.FLOW_WORKER_PORT || 8787);
const SECRET = (process.env.FLOW_WORKER_SECRET || "").trim();

const jobs = new Map();
const edits = createEditService({root:join(DATA_DIR,"edits"),getJob:id=>jobs.get(id)});
const recoverClips=createClipRecovery({getJob:id=>jobs.get(id),root:join(DATA_DIR,"jobs"),persist:savePersistedJob,enqueue:enqueueGenerate,hasActiveEdit:id=>edits.list(id).some(e=>["queued","running"].includes(e.status))});
const busyAccounts = new Set();

function claimAccount(accountId) {
  if (busyAccounts.has(accountId)) return false;
  busyAccounts.add(accountId);
  return true;
}

function releaseAccount(accountId) {
  busyAccounts.delete(accountId);
}
let generatingJobs = 0;
let jobsLoaded = false;
const persistTimers = new Map();
let flowEngine;

async function loadFlowEngine() {
  // Tests may swap in a fake render engine; ignored outside NODE_ENV=test.
  flowEngine ||= import(
    process.env.NODE_ENV === "test" && process.env.FLOW_TEST_ENGINE_MODULE ? process.env.FLOW_TEST_ENGINE_MODULE : "./flow.mjs"
  );
  return flowEngine;
}

function schedulePersist(job) {
  if (!job?.id || persistTimers.has(job.id)) return;
  const timer = setTimeout(() => {
    persistTimers.delete(job.id);
    savePersistedJob(job).catch((error) => {
      console.error(`[flow ${job.id}] could not persist job: ${error.message || error}`);
    });
  }, 150);
  timer.unref?.();
  persistTimers.set(job.id, timer);
}

async function persistNow(job) {
  const timer = persistTimers.get(job.id);
  if (timer) clearTimeout(timer);
  persistTimers.delete(job.id);
  job.updatedAt = new Date().toISOString();
  await savePersistedJob(job);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function unauthorized(res) {
  return json(res, 401, { error: "unauthorized" });
}

async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body too large"),{status:413});
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    stageDetail: job.stageDetail,
    error: job.error,
    errorCode: job.errorCode || null,
    accountId: job.accountId,
    accountLabel: job.accountLabel,
    clipsReady: Boolean(job.clipsReady),
    partialClips:Boolean(job.partialClips),
    queuedAt:queueTime(job),
    recoveryRevision: (job.recoveryRequests||[]).length,
    hasVideo: Boolean(job.videoPath) && job.status === "done",
    queueAhead: job.status === "queued" ? queueAhead(jobs, job.id) : 0,
    inputHash: job.inputHash || null,
    heartbeatAt: job.heartbeatAt || null,
    projectUrl: job.checkpoint?.projectUrl || null,
    clipId: job.checkpoint?.clipId || null,
    clipState: job.checkpoint?.clipState || null,
  };
}

function structuredJobEvent(job, event, fields = {}) {
  const clipState = fields.clipState || job.checkpoint?.clipState || {};
  const clip =
    fields.clip ||
    fields.clipId ||
    job.checkpoint?.clipId ||
    String(fields.detail || "").match(/\bC\d{2}\b/)?.[0] ||
    null;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      reelJobId: job.payload?.reelJobId ?? null,
      workerJobId: job.id,
      clip,
      phase: fields.phase || clipState.phase || null,
      assetId: fields.assetId || clipState.assetId || null,
      dispatchCount: fields.dispatchCount ?? clipState.dispatchCount ?? 0,
      elapsedMs: Date.now() - new Date(job.createdAt || Date.now()).getTime(),
      ...fields,
      clipState: undefined,
    }),
  );
}

function notifyQueued() {
  for (const job of jobs.values()) {
    if (job.status !== "queued") continue;
    appendJobLog(job, queueLine(jobs, job.id));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBrowserFree(job) {
  if (!getLogin().active) return;
  job.status = "queued";
    job.errorCode = null;
  job.stage = "setup";
  let last = 0;
  while (getLogin().active) {
    const now = Date.now();
    if (now - last >= 15_000) {
      appendJobLog(job, "Flow: queued — waiting for Sign in to Flow to finish");
      last = now;
    }
    await sleep(2000);
  }
}

function appendJobLog(job, detail, accountLabel) {
  recordJobProgress(job, detail, accountLabel, schedulePersist);
}

function jobPayload(body) {
  return {
    reelJobId: Number(body.reelJobId) || null,
    ...(body.characterGender ? {characterGender:normalizeCharacterGender(body.characterGender)} : {}),
    hook: String(body.hook || ""),
    script: String(body.script || ""),
    captions: Array.isArray(body.captions) ? body.captions.map(String) : [],
    onScreenText: Array.isArray(body.onScreenText) ? body.onScreenText.map(String) : [],
    cta: String(body.cta || ""),
    videoBrief: String(body.videoBrief || ""),
    ...(body.sceneDirection ? { sceneDirection: body.sceneDirection } : {}),
    personaId: body.personaId ?? null,
    personaName: body.personaName ? String(body.personaName) : "",
    personaHandle: body.personaHandle ? String(body.personaHandle) : "",
    voiceName: body.voiceName ? String(body.voiceName) : "",
    avatarUrl: body.avatarUrl ? String(body.avatarUrl) : "",
    brainKey: body.brainKey ? String(body.brainKey) : "",
    brainProject: body.brainProject ? String(body.brainProject) : "",
    brainModel: body.brainModel ? String(body.brainModel) : "",
    deepgramKey: body.deepgramKey ? String(body.deepgramKey) : "",
    deepgramModel: body.deepgramModel ? String(body.deepgramModel) : "",
    geminiKey: body.geminiKey ? String(body.geminiKey) : "",
    geminiModel: body.geminiModel ? String(body.geminiModel) : "",
    clips: Array.isArray(body.clips) ? body.clips : null,
    projectUrl: body.projectUrl ? String(body.projectUrl) : "",
    resume: body.resume && typeof body.resume === "object" ? body.resume : {},
  };
}

function persistedPayload(payload) {
  const {
    brainKey: _brainKey,
    deepgramKey: _deepgramKey,
    geminiKey: _geminiKey,
    ...safe
  } = payload;
  return safe;
}

function runtimeSecrets(payload) {
  return {
    brainKey: payload.brainKey || "",
    deepgramKey: payload.deepgramKey || "",
    geminiKey: payload.geminiKey || "",
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function resumedPayload(job) {
  return {
    ...(job.payload || {}),
    ...(job.runtimeSecrets || {}),
    ...(job.checkpoint?.projectUrl ? { projectUrl: job.checkpoint.projectUrl } : {}),
    generationStartedAt:job.startedAt || new Date().toISOString(),
    recoveryTargetIds:job.recoveryTargetIds,
    resume: {
      ...(job.payload?.resume || {}),
      clips: job.checkpoint?.clips || {},
    },
  };
}


/** Per-clip live phase map for the UI, derived from the streaming checkpoint.
 * Lanes run in parallel; this is the truth the single progress log cannot show. */
function clipPhasesOf(job) {
  const clips = job?.checkpoint?.clips || {};
  const out = {};
  for (const [id, c] of Object.entries(clips)) {
    out[id] = {
      phase: c.phase || null,
      attempts: (Number(c.generationRetries) || 0) + 1,
      updatedAt: c.updatedAt || null,
    };
  }
  return out;
}

const MAX_CONCURRENT_LANES = 8;
const MAX_SAME_ACCOUNT_LANES = 3;

/** Extracts the real account id from a lane id, which is either a bare
 * account id (one lane per distinct account) or `${accountId}::w${n}`
 * (multiple windows sharing one account). */
function laneRealAccountId(laneId) {
  const i = laneId.indexOf("::w");
  return i === -1 ? laneId : laneId.slice(0, i);
}

const RATE_LIMIT_COOLDOWN_MS = 20 * 60 * 1000;

/**
 * Classifies a Flow failure and returns the account patch to apply. Most
 * kinds are last-seen hints (a live attempt is always the real arbiter —
 * see isUsableAccount), except PROJECT_CREDITS_WARNING: we've directly
 * observed that error recur on a fresh project's very first clip seconds
 * after a previous success, proving immediate retry is pointless. That one
 * gets a time-boxed `restingUntil` cooldown instead of a permanent status
 * flip, since the account itself isn't actually broken.
 */
function accountPatchForFailure(err, message) {
  const lastChecked = new Date().toISOString();
  if (err?.code === "CREDITS") return { kind: "credits", patch: { status: "no_credits", creditsRemaining: 0, lastError: message.slice(0, 400), lastChecked } };
  if (err?.code === "EXPIRED") return { kind: "expired", patch: { status: "expired", lastError: message.slice(0, 400), lastChecked } };
  if (err?.code === "BLOCKED") return { kind: "blocked", patch: { status: "blocked", lastError: message.slice(0, 400), lastChecked } };
  if (err?.code === "PROJECT_CREDITS_WARNING") {
    return {
      kind: "resting",
      patch: { lastError: message.slice(0, 400), lastChecked, restingUntil: new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS).toISOString() },
    };
  }
  if (err?.code === "UI") return { kind: "ui", patch: { lastError: message.slice(0, 400), lastChecked } };
  const kind = classifyFlowFailure(message);
  if (kind === "credits") return { kind, patch: { status: "no_credits", creditsRemaining: 0, lastError: message.slice(0, 400), lastChecked } };
  if (kind === "expired") return { kind, patch: { status: "expired", lastError: message.slice(0, 400), lastChecked } };
  if (kind === "blocked") return { kind, patch: { status: "blocked", lastError: message.slice(0, 400), lastChecked } };
  return { kind, patch: { lastError: message.slice(0, 400), lastChecked } };
}

/**
 * Attempts to generate a job's clips across multiple Flow browser sessions
 * at once, one contiguous slice of clips per lane, so the job finishes in
 * roughly the slowest lane's time instead of the sum of every clip.
 *
 * A lane is either a distinct Flow account (preferred — fully isolated,
 * lowest risk) or, when only one account is free, multiple windows on that
 * same account's session (each an isolated browser context and its own
 * fresh Flow project, but sharing one Google session — a real Flow-side
 * rate-limit/abuse-detection risk that a second account would avoid).
 * Same-account fan-out only applies to plain-session accounts; a persistent
 * Chrome profile is single-instance-locked and cannot run two windows at
 * once, so those are left on the single-account path untouched.
 *
 * Returns true if it fully handled the job (done or cleanly errored);
 * returns false to let the caller fall back to the existing single-lane
 * path (nothing free right now, or every lane failed before any real work
 * happened).
 */
async function runConcurrentGeneration(job, body, candidates) {
  const login = getLogin();
  const loginBlocked = (a) => login.active && login.accountId === a.id;
  const previousLanes = job.checkpoint?.lanes || null;

  let laneSpecs; // [{ laneId, realAccountId, label }]
  if (previousLanes && Object.keys(previousLanes).length) {
    // Resuming a concurrent job: stick to the same lanes it already used.
    laneSpecs = Object.entries(previousLanes)
      .map(([laneId, info]) => {
        const realId = laneRealAccountId(laneId);
        const account = candidates.find((a) => a.id === realId);
        return account ? { laneId, realAccountId: realId, label: info.accountLabel || account.label } : null;
      })
      .filter(Boolean);
    if (laneSpecs.length < 2) return false;
  } else {
    const ready = candidates.filter((a) => !loginBlocked(a) && !busyAccounts.has(a.id));
    if (!ready.length) return false;
    if (ready.length >= 2) {
      laneSpecs = ready
        .slice(0, MAX_CONCURRENT_LANES)
        .map((a) => ({ laneId: a.id, realAccountId: a.id, label: a.label }));
    } else {
      const a = ready[0];
      // Same-account fan-out runs each window as an isolated plain context from
      // the session snapshot saved at login; only a profile-locked account with
      // no snapshot has to stay on the single-lane path.
      if (!(await tryReadSession(a.id))) return false;
      laneSpecs = Array.from({ length: MAX_SAME_ACCOUNT_LANES }, (_, i) => ({
        laneId: `${a.id}::w${i}`,
        realAccountId: a.id,
        label: `${a.label} (window ${i + 1})`,
      }));
    }
  }

  const realIdsNeeded = [...new Set(laneSpecs.map((l) => l.realAccountId))];
  const claimedRealIds = [];
  for (const id of realIdsNeeded) {
    if (claimAccount(id)) claimedRealIds.push(id);
  }
  const usableLanes = laneSpecs.filter((l) => claimedRealIds.includes(l.realAccountId));
  if (usableLanes.length < 2 || claimedRealIds.length < realIdsNeeded.length) {
    for (const id of claimedRealIds) releaseAccount(id);
    return false;
  }

  let leases = null;
  try {
    const sessionByRealId = new Map();
    const lanes = [];
    for (const spec of usableLanes) {
      if (!sessionByRealId.has(spec.realAccountId)) {
        const storageState = await tryReadSession(spec.realAccountId);
        if (!storageState && !(await hasChromeProfile(spec.realAccountId))) {
          throw Object.assign(new Error(`${spec.label}: Flow session expired — reconnect.`), {
            code: "EXPIRED",
            accountId: spec.realAccountId,
          });
        }
        sessionByRealId.set(spec.realAccountId, storageState);
      }
      lanes.push({
        accountId: spec.laneId,
        accountLabel: spec.label,
        storageState: sessionByRealId.get(spec.realAccountId),
        resumeProjectUrl: previousLanes?.[spec.laneId]?.projectUrl || "",
        ownedClipIds: previousLanes?.[spec.laneId]?.clipIds || [],
      });
    }
    job.accountId = null;
    job.accountLabel = [...new Set(lanes.map((l) => l.accountLabel))].join(" + ");
    appendJobLog(job, `Flow: setup… (${job.accountLabel})`);
    for (const id of claimedRealIds) await markLastPicked(id);

    const downloadDir = join(DATA_DIR, "jobs", job.id);
    await mkdir(downloadDir, { recursive: true, mode: 0o700 });
    const { generateReelConcurrent } = await loadFlowEngine();
    leases = createLaneRelease({ lanes, realIdOf: laneRealAccountId, release: releaseAccount });
    const result = await generateReelConcurrent(lanes, body, {
      downloadDir,
      // Free each account as soon as its lane is done so a waiting video can use it.
      onLaneFinished: async (lane, error) => {
        if (error) {
          const laneMessage = error instanceof Error ? error.message : String(error);
          await updateAccount(laneRealAccountId(lane.accountId), accountPatchForFailure(error, laneMessage).patch);
        }
        if (leases.laneFinished(lane.accountId)) {
          appendJobLog(job, `Flow: [concurrent] ${lane.accountLabel} finished its clips — account released for other videos`);
        }
      },
      onProgress: (detail, accountLabel) => {
        appendJobLog(job, detail, accountLabel);
        structuredJobEvent(job, "flow.progress", {
          detail: String(detail || "").slice(0, 280),
          accountLabel,
        });
      },
      onCheckpoint: async (checkpoint) => {
        job.checkpoint = job.checkpoint || { clips: {}, lanes: {} };
        job.checkpoint.lanes = job.checkpoint.lanes || {};
        if (checkpoint.accountId) {
          const spec = lanes.find((l) => l.accountId === checkpoint.accountId);
          job.checkpoint.lanes[checkpoint.accountId] = {
            ...(job.checkpoint.lanes[checkpoint.accountId] || {}),
            accountLabel: spec?.accountLabel || job.checkpoint.lanes[checkpoint.accountId]?.accountLabel,
          };
          if (checkpoint.projectUrl) job.checkpoint.lanes[checkpoint.accountId].projectUrl = checkpoint.projectUrl;
        }
        if (checkpoint.clipId) {
          job.checkpoint.clips = job.checkpoint.clips || {};
          job.checkpoint.clips[checkpoint.clipId] = {
            ...(job.checkpoint.clips[checkpoint.clipId] || {}),
            ...checkpoint,
            updatedAt: new Date().toISOString(),
          };
          if (checkpoint.accountId && job.checkpoint.lanes[checkpoint.accountId]) {
            const lane = job.checkpoint.lanes[checkpoint.accountId];
            lane.clipIds = [...new Set([...(lane.clipIds || []), checkpoint.clipId])];
          }
        }
        job.heartbeatAt = new Date().toISOString();
        await persistNow(job);
        structuredJobEvent(job, "flow.checkpoint", {
          clipId: checkpoint.clipId,
          clipState: checkpoint.clipState,
          projectUrl: checkpoint.projectUrl || null,
          accountId: checkpoint.accountId || null,
        });
      },
    });
    job.videoPath = result.videoPath;
    job.clipsReady = Boolean(result.clipsReady);
    job.partialClips = Boolean(result.partialClips);
    job.status = "done";
    job.errorCode = null;
    job.stage = result.clipsReady || result.partialClips ? "clips" : "stitch";
    job.finishedAt = new Date().toISOString();
    appendJobLog(
      job,
      `Flow: [ok] ${result.clips} clips ${result.partialClips ? "saved — selected clip regeneration complete; other clips still need attention" : result.clipsReady ? "ready — automatic editing follows" : "stitched"}`,
      job.accountLabel,
    );
    for (const id of claimedRealIds) {
      await updateAccount(id, {
        status: "connected",
        lastError: null,
        lastChecked: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      });
    }
    for (const laneErr of result.laneErrors || []) {
      const realId = laneRealAccountId(laneErr.accountId);
      const laneMessage = laneErr.error instanceof Error ? laneErr.error.message : String(laneErr.error);
      const { patch } = accountPatchForFailure(laneErr.error, laneMessage);
      await updateAccount(realId, patch);
    }
    await persistNow(job);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendJobLog(job, `Flow: [concurrent] ${message} — falling back to single-account generation`);
    if (Array.isArray(err?.laneErrors) && err.laneErrors.length) {
      for (const laneErr of err.laneErrors) {
        const realId = laneRealAccountId(laneErr.accountId);
        const laneMessage = laneErr.error instanceof Error ? laneErr.error.message : String(laneErr.error);
        const { patch } = accountPatchForFailure(laneErr.error, laneMessage);
        await updateAccount(realId, patch);
      }
    } else if (err?.accountId) {
      const { patch } = accountPatchForFailure(err, message);
      await updateAccount(err.accountId, patch);
    }
    return false;
  } finally {
    // Only release what is still held; early-released accounts may already belong to another video.
    if (leases) leases.releaseAll(claimedRealIds);
    else for (const id of claimedRealIds) releaseAccount(id);
  }
}

async function runGenerateJob(job) {
  const body = resumedPayload(job);
  await waitForBrowserFree(job);
  job.status = "running";
  job.errorCode = null;
  job.stage = "setup";
  job.startedAt = job.startedAt || new Date().toISOString();
  appendJobLog(job, "Flow: setup…");
  await persistNow(job);
  generatingJobs += 1;
  try {
  const listed = await listAccounts();
  const ordered = orderAccountsForRotate(listed.accounts, listed.lastPickedId);
  const candidates = job.checkpoint?.projectUrl && job.accountId ? ordered.filter(account=>account.id===job.accountId) : ordered;
  if (!candidates.length) {
    throw new Error("No Flow account is signed in with credits. Use Sign in to Flow in Settings.");
  }

  if (candidates.length >= 1) {
    if (await runConcurrentGeneration(job, body, candidates)) return;
  }

  const login = getLogin();
  const failures = [];
  const tried = new Set();
  let notifiedWaiting = false;
  let waitedForCapacity = false;

  while (tried.size < candidates.length) {
    const loginBlocked = (a) => login.active && login.accountId === a.id;
    for (const a of candidates) {
      if (!tried.has(a.id) && loginBlocked(a)) {
        tried.add(a.id);
        failures.push(`${a.label}: sign-in is still open — finish or cancel it first.`);
      }
    }
    if (tried.size >= candidates.length) break;

    const readyNow = candidates.filter((a) => !tried.has(a.id) && !loginBlocked(a) && !busyAccounts.has(a.id));
    if (!readyNow.length) {
      if (!notifiedWaiting) {
        appendJobLog(job, "Flow: waiting for an available account (busy generating other videos)…");
        notifiedWaiting = true;
      }
      waitedForCapacity = true;
      await sleep(Number(process.env.FLOW_QUEUE_POLL_MS) || 4000);
      continue;
    }

    if (waitedForCapacity) {
      waitedForCapacity = false;
      // Capacity freed up while this video waited: try the multi-lane path again rather than
      // dropping to one account that renders a single clip at a time.
      const relisted = await listAccounts();
      const fresh = orderAccountsForRotate(relisted.accounts, relisted.lastPickedId);
      const freshCandidates = job.checkpoint?.projectUrl && job.accountId ? fresh.filter((a) => a.id === job.accountId) : fresh;
      if (freshCandidates.length && (await runConcurrentGeneration(job, body, freshCandidates))) return;
    }

    const account = readyNow[0];
    if (!claimAccount(account.id)) continue;
    notifiedWaiting = false;
    tried.add(account.id);
    job.accountId = account.id;
    job.accountLabel = account.label;
    appendJobLog(job, "Flow: setup…", account.label);
    await markLastPicked(account.id);
    try {
      const storageState = await tryReadSession(account.id);
      if (!storageState && !(await hasChromeProfile(account.id))) {
        throw Object.assign(new Error("Flow session expired — reconnect."), { code: "EXPIRED" });
      }
      const downloadDir = join(DATA_DIR, "jobs", job.id);
      await mkdir(downloadDir, { recursive: true, mode: 0o700 });
      const { generateReel } = await loadFlowEngine();
      const result = await generateReel(account.id, storageState, body, {
        downloadDir,
        onProgress: (detail) => {
          appendJobLog(job, detail, account.label);
          structuredJobEvent(job, "flow.progress", {
            detail: String(detail || "").slice(0, 280),
            accountLabel: account.label,
          });
        },
        onCheckpoint: async (checkpoint) => {
          job.checkpoint = job.checkpoint || { clips: {} };
          if (checkpoint.projectUrl) job.checkpoint.projectUrl = checkpoint.projectUrl;
          if (checkpoint.clipId) {
            job.checkpoint.clipId = checkpoint.clipId;
            job.checkpoint.clipState = checkpoint.clipState || null;
            job.checkpoint.clips = job.checkpoint.clips || {};
            job.checkpoint.clips[checkpoint.clipId] = {
              ...(job.checkpoint.clips[checkpoint.clipId] || {}),
              ...checkpoint,
              updatedAt: new Date().toISOString(),
            };
          }
          job.heartbeatAt = new Date().toISOString();
          await persistNow(job);
          structuredJobEvent(job, "flow.checkpoint", {
            clipId: checkpoint.clipId,
            clipState: checkpoint.clipState,
            projectUrl: checkpoint.projectUrl || job.checkpoint.projectUrl || null,
          });
        },
      });
      job.videoPath = result.videoPath;
      job.clipsReady = Boolean(result.clipsReady);
      job.partialClips = Boolean(result.partialClips);
      job.status = "done";
      job.errorCode = null;
      job.stage = result.clipsReady || result.partialClips ? "clips" : "stitch";
      job.finishedAt = new Date().toISOString();
      appendJobLog(job, `Flow: [ok] ${result.clips} clips ${result.partialClips ? "saved — selected clip regeneration complete; other clips still need attention" : result.clipsReady ? "ready — automatic editing follows" : "stitched"}`, account.label);
      await updateAccount(account.id, {
        status: result.credits === 0 ? "no_credits" : "connected",
        creditsRemaining: result.credits,
        email: result.email,
        lastError: null,
        lastChecked: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      });
      await persistNow(job);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { kind, patch } = accountPatchForFailure(err, message);
      const dispatched = Boolean(err && typeof err === "object" && err.dispatched);
      failures.push(`${account.label}: ${message}`);
      await updateAccount(account.id, patch);
      if (kind === "ui") {
        appendJobLog(job, `Flow: [recover] ${account.label}: ${message} — trying another path`);
      }
      if (dispatched) throw err;
      if (["credits", "expired", "blocked", "resting", "ui"].includes(kind)) continue;
    } finally {
      releaseAccount(account.id);
    }
  }
  throw new Error(failures.length ? `All Flow accounts failed.\n${failures.join("\n")}` : "No Flow account could generate.");
  } finally {
    generatingJobs = Math.max(0, generatingJobs - 1);
  }
}

function enqueueGenerate(job) {
  if (job.enqueued) return;
  job.enqueued = true;
  (async () => {
    job.enqueued = false;
    try {
      await runGenerateJob(job);
      structuredJobEvent(job, "flow.done", { status: job.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err?.code === "BROWSER_CLOSED" && err?.dispatched && Number(job.resumeAttempts || 0) < 2) {
        job.resumeAttempts = Number(job.resumeAttempts || 0) + 1;
        job.queuedAt=new Date().toISOString();
        job.status = "queued";
        job.error = null;
        job.errorCode = null;
        appendJobLog(
          job,
          `Flow: [recover] browser session closed — resuming submitted clip (${job.resumeAttempts}/2)`,
        );
        await persistNow(job);
        structuredJobEvent(job, "flow.resume", {
          code: err.code,
          resumeAttempt: job.resumeAttempts,
        });
        setTimeout(() => enqueueGenerate(job), 1_000).unref?.();
      } else {
        job.status = "error";
        job.error = message.slice(0, 1200);
        job.errorCode = err?.code || classifyFlowFailure(message) || null;
        job.finishedAt = new Date().toISOString();
        appendJobLog(job, `Flow: [error] ${job.error}`);
        await persistNow(job);
        structuredJobEvent(job, "flow.error", {
          code: err?.code || null,
          error: job.error,
        });
      }
    } finally {
      notifyQueued();
    }
  })();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, jobsLoaded ? 200 : 503, {
        ok: jobsLoaded,
        ready: jobsLoaded,
        generating: generatingJobs > 0,
        jobs: jobs.size,
      });
    }

    const secret = String(req.headers["x-flow-secret"] || "");
    if (!SECRET || secret !== SECRET) return unauthorized(res);

    const loginFrame = url.pathname.match(/^\/accounts\/([^/]+)\/login\/frame$/);
    if (loginFrame && req.method === "GET") {
      const id = decodeURIComponent(loginFrame[1]);
      const login = getLogin(id);
      if (!login.active) {
        res.writeHead(204);
        res.end();
        return;
      }
      const bytes = await captureFrame();
      if (!bytes) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "content-length": bytes.length,
      });
      res.end(bytes);
      return;
    }

    const loginInput = url.pathname.match(/^\/accounts\/([^/]+)\/login\/input$/);
    if (loginInput && req.method === "POST") {
      const id = decodeURIComponent(loginInput[1]);
      if (!getLogin(id).active) return json(res, 400, { error: "Sign-in is not open." });
      await sendInput(await readBody(req));
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/accounts") {
      return json(res, 200, await listAccounts());
    }

    if (req.method === "POST" && url.pathname === "/accounts") {
      const body = await readBody(req);
      const account = await createAccount(body.label);
      const listed = await listAccounts();
      return json(res, 200, { account, ...listed });
    }

    const accountMatch = url.pathname.match(/^\/accounts\/([^/]+)(?:\/(session|probe|login))?$/);
    if (accountMatch) {
      const id = decodeURIComponent(accountMatch[1]);
      const extra = accountMatch[2];
      if (req.method === "PATCH" && !extra) {
        const body = await readBody(req);
        return json(res, 200, { account: await updateAccount(id, body) });
      }
      if (req.method === "DELETE" && !extra) {
        if (getLogin(id).active) await stopLogin();
        await removeAccount(id);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && extra === "session") {
        const body = await readBody(req);
        return json(res, 200, { account: await saveSession(id, body) });
      }
      if (req.method === "DELETE" && extra === "session") {
        if (getLogin(id).active) await stopLogin();
        return json(res, 200, { account: await clearSession(id) });
      }
      if (req.method === "GET" && extra === "login") {
        return json(res, 200, { login: getLogin(id) });
      }
      if (req.method === "POST" && extra === "login") {
        const body = await readBody(req);
        if (body.action === "confirm") {
          const login = await confirmLogin(id);
          return json(res, 200, { login });
        }
        if (generatingJobs > 0) {
          return json(res, 409, {
            error: "A reel is generating on the logged-in account. Wait until it finishes before signing in.",
          });
        }
        const login = await startLogin(id);
        return json(res, 200, { login });
      }
      if (req.method === "DELETE" && extra === "login") {
        await stopLogin();
        return json(res, 200, { login: { active: false } });
      }
      if (req.method === "POST" && extra === "probe") {
        const storageState = await tryReadSession(id);
        if (!storageState && !(await hasChromeProfile(id))) {
          return json(res, 400, { error: "Sign in to Flow first." });
        }
        try {
          const { probeAccount } = await loadFlowEngine();
          const result = await Promise.race([
            probeAccount(storageState, id),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Credit check timed out.")), 35_000);
            }),
          ]);
          const account = await updateAccount(id, {
            status: result.status,
            creditsRemaining: result.credits,
            ...(result.email ? { email: result.email } : {}),
            lastError: null,
            lastChecked: new Date().toISOString(),
          });
          return json(res, 200, { account });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = err.code || classifyFlowFailure(message);
          const status =
            kind === "credits" || kind === "CREDITS"
              ? "no_credits"
              : kind === "expired" || kind === "EXPIRED"
                ? "expired"
                : kind === "blocked" || kind === "BLOCKED"
                  ? "blocked"
                  : "unknown";
          const account = await updateAccount(id, {
            status,
            creditsRemaining: status === "no_credits" ? 0 : null,
            lastError: message.slice(0, 400),
            lastChecked: new Date().toISOString(),
          });
          return json(res, 200, { account, error: message });
        }
      }
    }

    if (req.method === "POST" && url.pathname === "/jobs") {
      const body = await readBody(req);
      try { normalizeCharacterGender(body.characterGender); } catch(error) { return json(res,400,{error:error.message}); }
      const fullPayload = jobPayload(body);
      const payload = persistedPayload(fullPayload);
      const inputHash = hashPayload(payload);
      const idempotencyKey = String(
        req.headers["x-idempotency-key"] || body.idempotencyKey || "",
      )
        .trim()
        .slice(0, 180);
      if (idempotencyKey) {
        const existing = [...jobs.values()].find(
          (candidate) => candidate.idempotencyKey === idempotencyKey,
        );
        if (existing) {
          if (existing.inputHash !== inputHash) {
            return json(res, 409, {
              error: "Idempotency key already belongs to different reel input.",
            });
          }
          return json(res, 200, { job: publicJob(existing), idempotent: true });
        }
      }
      const job = {
        id: randomUUID(),
        idempotencyKey: idempotencyKey || null,
        inputHash,
        status: "queued",
        stage: "setup",
        stageDetail: "Flow: queued",
        log: ["Flow: queued"],
        error: null,
        accountId: null,
        accountLabel: null,
        videoPath: null,
        payload,
        runtimeSecrets: runtimeSecrets(fullPayload),
        checkpoint: { clips: {} },
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        heartbeatAt: new Date().toISOString(),
        resumeAttempts: 0,
      };
      jobs.set(job.id, job);
      await persistNow(job);
      notifyQueued();
      enqueueGenerate(job);
      return json(res, 200, { job: publicJob(job) });
    }

    const recoveryMatch=url.pathname.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/clips\/regenerate$/);
    if(recoveryMatch && req.method==='POST') {
      try {
        const body=await readBody(req);
        if(Object.keys(body).some(key=>!['requestId','clipId'].includes(key))) return json(res,400,{error:'Only requestId is accepted'});
        return json(res,200,{job:publicJob(await recoverClips(recoveryMatch[1],body.requestId,body.clipId))});
      }catch(error){return json(res,error.status||500,{error:error.status?error.message:'Could not queue clip recovery'});}
    }

    const clipsMatch=url.pathname.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/clips(?:\/(C\d{2,3})\/video)?$/);
    if(clipsMatch && req.method==="GET") {
      try {
        const job=jobs.get(clipsMatch[1]);
        if(!clipsMatch[2]) return json(res,200,{...(await resultClips(job,join(DATA_DIR,"jobs"))),processing:["queued","running"].includes(job.status),status:job.status,queueAhead:queueAhead(jobs,job.id),error:job.error,detail:job.stageDetail,clipPhases:clipPhasesOf(job)});
        const path=await resultClipFile(job,join(DATA_DIR,"jobs"),clipsMatch[2]);
        const bytes=await readFile(path);
        res.writeHead(200,{"content-type":"video/mp4","content-length":bytes.length});
        return res.end(bytes);
      } catch(error) {return json(res,error.status || 500,{error:error.message});}
    }

    const editMatch = url.pathname.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/edits(?:\/([a-f0-9]{64})(\/video)?)?$/);
    if (editMatch) {
      const [, sourceId, editId, video] = editMatch;
      try {
        if (req.method === "POST" && !editId) return json(res,202,{edit:await edits.submit(sourceId,await readBody(req,16384))});
        if (req.method === "GET" && video) {
          const bytes = await readFile(edits.video(sourceId,editId));
          res.writeHead(200,{"content-type":"video/mp4","content-length":bytes.length});
          return res.end(bytes);
        }
        if (req.method === "GET") return json(res,200,editId ? {edit:edits.get(sourceId,editId)} : {edits:edits.list(sourceId)});
        return json(res,405,{error:"Method not allowed"});
      } catch(error) { return json(res,error.status || (error instanceof SyntaxError ? 400 : 500),{error:String(error.message).slice(-1200)}); }
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([^/]+)(?:\/(video))?$/);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: "job not found" });
      if (jobMatch[2] === "video") {
        if (!job.videoPath) return json(res, 404, { error: "video not ready" });
        const bytes = await readFile(job.videoPath);
        res.writeHead(200, {
          "content-type": "video/mp4",
          "content-length": bytes.length,
        });
        res.end(bytes);
        return;
      }
      return json(res, 200, { job: publicJob(job) });
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, 500, { error: message.slice(0, 400) });
  }
});

async function bootstrap() {
  const persisted = await loadPersistedJobs();
  for (const row of persisted.sort(compareQueue)) {
    const job = {
      ...row,
      payload: row.payload || {},
      runtimeSecrets: {},
      checkpoint: row.checkpoint || { clips: {} },
      enqueued: false,
      queuedAt:queueTime(row),
    };
    if (job.status === "running") {
      job.status = "queued";
      job.error = null;
        job.errorCode = null;
      appendJobLog(job, "Flow: [recover] worker restarted — resuming from the saved clip checkpoint");
    }
    if (job.status === "done" && job.videoPath) {
      const exists = await stat(job.videoPath).then(() => true).catch(() => false);
      if (!exists) {
        job.status = "error";
        job.errorCode = "VIDEO_MISSING";
        job.error = "Persisted Flow video is missing.";
        job.finishedAt = new Date().toISOString();
      }
    }
    if (job.status === "done" && !job.partialClips && !job.videoPath && job.stage === "clips") {
      const saved = await resultClips(job, join(DATA_DIR, "jobs"));
      job.clipsReady = saved.canStitch;
      if (!saved.canStitch) {
        job.status = "error";
        job.errorCode = "CLIPS_INCOMPLETE";
        job.error = "Saved source clips are incomplete or unavailable.";
      }
    }
    jobs.set(job.id, job);
    await persistNow(job);
  }
  await restoreManualLogin();
  await edits.restore();
  jobsLoaded = true;
  await prunePersistedJobs({
    before: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    keep: 250,
  }).catch(() => undefined);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`flow-worker listening on ${PORT}; restored ${persisted.length} job(s)`);
  });
  for (const job of jobs.values()) {
    if (job.status === "queued") enqueueGenerate(job);
  }
}

bootstrap().catch((error) => {
  console.error(`flow-worker failed to start: ${error.stack || error}`);
  process.exitCode = 1;
});

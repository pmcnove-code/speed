import { automaticallyEditClips } from "./auto-edit";
import { lockGenderProfile, assetGender } from "../../../shared/flow/gender.mjs";
import { and, eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSetting } from "@/lib/config";
import { probeMp4Duration } from "./ffmpeg";
import { downloadFlowVideo, getFlowJob, submitFlowJob } from "./flow-worker";
import { flowWaitTimedOut, flowWaitTimeoutMessage } from "./flow-queue";
import { splitFlowClips } from "./clip-split";
import { resolveFlowVoice, FLOW_VOICE_PROFILES } from "./flow-voices";
import { selectAvailableReference } from "./reference-selection";
import { flowDispatchInputHash, flowIdempotencyKey } from "./reel-dispatch";
import type { ReelCopy } from "./storyboard";
import { geminiKey } from "@/lib/gemini/client";
import type { ReelJob, ReelShot } from "@/db/schema";

async function setStage(
  id: number,
  stage: string,
  detail: string,
  status: "queued" | "running" = "running",
) {
  await db
    .update(t.reelJobs)
    .set({ status, stage, stageDetail: detail, updatedAt: new Date() })
    .where(eq(t.reelJobs.id, id));
}


/** The persona's chosen subtitle style config, or undefined for worker defaults. */
async function selectedSubtitleStyle(personaId: number | null): Promise<unknown | undefined> {
  if (!personaId) return undefined;
  const [row] = await db.select({ config: t.subtitleStyles.config }).from(t.subtitleStyles)
    .where(and(eq(t.subtitleStyles.personaId, personaId), eq(t.subtitleStyles.selected, true))).limit(1);
  return row?.config ?? undefined;
}

async function loadPersonaForJob(job: ReelJob) {
  if (job.referencePersonaId) {
    const [locked] = await db.select().from(t.personas).where(eq(t.personas.id, job.referencePersonaId));
    const genderOk = !job.characterGender || (locked && assetGender(`${locked.name} ${locked.handle}`, FLOW_VOICE_PROFILES) === job.characterGender);
    if (locked?.photo?.length && genderOk) return locked;
    // Saved reference unusable (photo removed or gender mismatch) — fall through to fallback selection.
  }
  let requested = null;
  if (job.postId) {
    const [post] = await db.select({ personaId: t.posts.personaId }).from(t.posts).where(eq(t.posts.id, job.postId));
    if (post?.personaId) {
      const [persona] = await db.select().from(t.personas).where(eq(t.personas.id, post.personaId));
      requested = persona || null;
    }
  }
  // Already-dispatched jobs retain their original input and asset checkpoints.
  if (job.workerJobId) {
    if (!job.characterGender) return requested;
    return requested && assetGender(`${requested.name} ${requested.handle}`, FLOW_VOICE_PROFILES) === job.characterGender
      ? {...requested, photo:null, photoMime:null} : null;
  }
  const available = !job.characterGender && requested?.photo?.length ? [] : await db.select().from(t.personas)
    .where(sql`octet_length(${t.personas.photo}) > 0`).orderBy(t.personas.id);
  let selected = selectAvailableReference(requested, available, job.characterGender, job.sceneDirection?.characterDescription);
  // Fallback: if no character matched by description, use first available
  if (!selected) {
    selected = available.length > 0 ? available[0] : requested;
  }
  if (!selected) return null; // No personas with photos at all; worker may have a matching saved character
  const character = resolveFlowVoice({ name: selected.name, handle: selected.handle }).character;
  await db.update(t.reelJobs).set({ referencePersonaId: selected.id, referenceCharacter: character }).where(eq(t.reelJobs.id, job.id));
  job.referencePersonaId = selected.id;
  job.referenceCharacter = character;
  return selected;
}

function photoDataUrl(photo: Buffer | null | undefined, mime: string | null | undefined): string | undefined {
  if (!photo) return undefined;
  const buf = Buffer.isBuffer(photo) ? photo : Buffer.from(photo);
  if (!buf.length) return undefined;
  return `data:${mime || "image/jpeg"};base64,${buf.toString("base64")}`;
}

async function runFlowReel(id: number, copy: ReelCopy, job: ReelJob): Promise<void> {
  await setStage(id, "setup", "Flow: splitting clips…", "queued");
  const persona = await loadPersonaForJob(job);
  const voice = lockGenderProfile(resolveFlowVoice({
    name: persona?.name,
    handle: persona?.handle,
    voiceName: persona?.voiceId || undefined,
  }), job.characterGender, FLOW_VOICE_PROFILES);
  const split = await splitFlowClips({
    hook: copy.hook,
    script: copy.script,
    characterName: voice.character,
    voiceName: voice.voiceName,
    onScreenText: copy.onScreenText,
    cta: copy.cta,
    videoBrief: copy.videoBrief,
    sceneDirection: job.sceneDirection,
  });
  const shots: ReelShot[] = split.clips.map((c, i) => ({
    index: i + 1,
    durationSec: c.durationSec,
    spoken: c.spoken,
    onScreen: c.onScreen || "",
    visual: c.prompt,
  }));
  await db.update(t.reelJobs).set({ storyboard: shots }).where(eq(t.reelJobs.id, id));
  const targetSec = split.clips.reduce((sum, clip) => sum + clip.durationSec, 0);
  await setStage(
    id,
    "setup",
    `Flow: ${split.clips.length} clips · ${targetSec}s · v3.3${split.junctions.length ? ` · ${split.junctions.join(" · ")}` : ""} · ${voice.character}…`,
    "queued",
  );

  const dispatchInput = {
    reelJobId: id,
    ...(job.characterGender ? {characterGender:job.characterGender} : {}),
    hook: copy.hook,
    script: copy.script,
    captions: split.clips.map((c) => c.onScreen || "").filter(Boolean),
    onScreenText: copy.onScreenText,
    cta: copy.cta,
    videoBrief: copy.videoBrief,
    personaId: persona?.id,
    personaName: persona?.name ?? voice.character,
    personaHandle: persona?.handle,
    voiceName: voice.voiceName,
    avatarUrl: photoDataUrl(persona?.photo, persona?.photoMime),
    clips: split.clips,
    ...(job.sceneDirection ? { sceneDirection: job.sceneDirection } : {}),
  };
  const inputHash = flowDispatchInputHash(dispatchInput);
  if (job.inputHash && job.inputHash !== inputHash) {
    throw Object.assign(
      new Error("Saved Flow dispatch input no longer matches this reel. Refusing a second paid submission."),
      { code: "FLOW_TERMINAL" },
    );
  }

  let current: Awaited<ReturnType<typeof getFlowJob>>;
  if (job.workerJobId) {
    current = await getFlowJob(job.workerJobId).catch((error) => {
      throw Object.assign(
        new Error(
          `Saved Flow worker job ${job.workerJobId} is unavailable; refusing to submit it again. ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        { code: "FLOW_TERMINAL" },
      );
    });
  } else {
    await db
      .update(t.reelJobs)
      .set({
        inputHash,
        dispatchState: "dispatching",
        dispatchStartedAt: job.dispatchStartedAt ?? new Date(),
        partial: false,
        errorCode: null,
        runnerAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(t.reelJobs.id, id));

    current = await submitFlowJob({
      ...dispatchInput,
      idempotencyKey: flowIdempotencyKey(id, inputHash),
      deepgramKey: (await getSetting("DEEPGRAM_API_KEY")).trim(),
      deepgramModel: (await getSetting("DEEPGRAM_MODEL")).trim() || "nova-3",
      geminiKey: await geminiKey(),
    });
    await db
      .update(t.reelJobs)
      .set({
        workerJobId: current.id,
        inputHash,
        dispatchState: "dispatched",
        dispatchedAt: job.dispatchedAt ?? new Date(),
        workerHeartbeatAt: current.heartbeatAt ? new Date(current.heartbeatAt) : new Date(),
        flowProjectUrl: current.projectUrl ?? null,
        clipCheckpoint: current.clipState ?? {},
        partial: false,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(t.reelJobs.id, id));
  }

  const remoteId = current.id;

  const queuedAt = Date.now();
  let runningAt: number | null = current.status === "running" ? queuedAt : null;
  while (current.status === "queued" || current.status === "running") {
    if (current.status === "running" && runningAt == null) runningAt = Date.now();
    if (flowWaitTimedOut({ status: current.status, now: Date.now(), queuedAt, runningAt })) {
      throw new Error(flowWaitTimeoutMessage(current.status));
    }
    const queued = current.status === "queued";
    await setStage(
      id,
      queued ? "setup" : current.stage || "clips",
      current.stageDetail || (queued ? "Flow: queued — waiting for Chrome" : "Flow: generating…"),
      queued ? "queued" : "running",
    );
    await db
      .update(t.reelJobs)
      .set({
        workerHeartbeatAt: current.heartbeatAt ? new Date(current.heartbeatAt) : new Date(),
        flowProjectUrl: current.projectUrl ?? undefined,
        clipCheckpoint: {
          clipId: current.clipId ?? null,
          clipState: current.clipState ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(t.reelJobs.id, id));
    await new Promise((r) => setTimeout(r, 2500));
    current = await getFlowJob(remoteId);
  }
  if(current.status==='done' && current.partialClips){
    await db.update(t.reelJobs).set({status:'done',stage:'clips',stageDetail:current.stageDetail,error:null,partial:true,errorCode:null,finishedAt:new Date(),updatedAt:new Date()}).where(eq(t.reelJobs.id,id));
    return;
  }
  if (current.status === "error" || (!current.clipsReady && !current.hasVideo)) {
    throw Object.assign(new Error(current.error || "Flow worker finished without saved clips or a video."), {code:current.errorCode || "FLOW_TERMINAL"});
  }
  const bytes = current.clipsReady
    ? await automaticallyEditClips(current.id, id, detail => setStage(id, "stitch", `${current.stageDetail || ""}\n${detail}`), {revision:current.recoveryRevision, subtitleStyle: await selectedSubtitleStyle(job.referencePersonaId)})
    : await downloadFlowVideo(current.id);
  if (!bytes.length) throw new Error("Flow worker returned an empty video.");
  const durationMs = await probeMp4Duration(bytes);
  const plannedMs = split.clips.reduce((s, c) => s + c.durationSec * 1000, 0);
  const minMs = Math.max(4_000, Math.round(plannedMs * 0.7));
  if (!durationMs || durationMs < minMs) {
    throw Object.assign(
      new Error(
        `Flow reel is ${durationMs ? `${(durationMs / 1000).toFixed(2)}s` : "unreadable"} (${bytes.length} bytes) — shorter than the ${Math.round(plannedMs / 1000)}s plan. Clips were preview frames, not finished videos.`,
      ),
      { code: "FLOW_TERMINAL" },
    );
  }
  const used = current.accountLabel
    ? `flow/omni-flash (${current.accountLabel})`
    : "flow/omni-flash";
  const seconds = (durationMs / 1000).toFixed(1);
  await db
    .update(t.reelJobs)
    .set({
      status: "done",
      stage: "stitch",
      stageDetail: `Final reel · ${seconds}s 9:16 MP4 · ${voice.character}${current.accountLabel ? ` · ${current.accountLabel}` : ""}`,
      video: bytes,
      videoMime: "video/mp4",
      durationMs,
      model: used.slice(0, 80),
      dispatchState: "completed",
      workerHeartbeatAt: new Date(),
      error: null,
      partial: false,
      errorCode: null,
      updatedAt: new Date(),
      finishedAt: new Date(),
    })
    .where(eq(t.reelJobs.id, id));
}

export async function runReelJob(id: number): Promise<void> {
  const [job] = await db.select().from(t.reelJobs).where(eq(t.reelJobs.id, id));
  if (!job) return;

  try {
    const copy: ReelCopy = {
      hook: job.hook,
      script: job.script,
      onScreenText: job.onScreenText ?? [],
      cta: job.cta ?? "",
      videoBrief: job.videoBrief ?? "",
    };
    if (!copy.hook.trim() && !copy.script.trim()) {
      throw new Error("Need a hook or script to build a reel.");
    }

    await runFlowReel(id, copy, job);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [latest] = await db
      .select({
        stageDetail: t.reelJobs.stageDetail,
        workerJobId: t.reelJobs.workerJobId,
        dispatchState: t.reelJobs.dispatchState,
        runnerAttempts: t.reelJobs.runnerAttempts,
      })
      .from(t.reelJobs)
      .where(eq(t.reelJobs.id, id));
    const prior = latest?.stageDetail || "";
    const keepLog = /(^|\n)Flow:/.test(prior);
    const recoverableFlow =
      (Boolean(latest?.workerJobId) || latest?.dispatchState === "dispatching") &&
      (err as { code?: string } | null)?.code !== "FLOW_TERMINAL" &&
      Number(latest?.runnerAttempts || 0) < 8;
    if (recoverableFlow) {
      const flowCode = (err as { code?: string } | null)?.code ?? null;
      if (flowCode === "PROJECT_CREDITS_WARNING" || flowCode === "CREDITS" || flowCode === "BLOCKED") {
        // Flow-side hold (cost warning / rate limit): pace the retry instead of
        // burning the whole recovery budget in seconds against a resting account.
        await new Promise((resolve) => setTimeout(resolve, 5 * 60_000));
      }
      await db
        .update(t.reelJobs)
        .set({
          status: "queued",
          error: null,
          stageDetail: `${prior}\nFlow: [recover] runner interrupted (${message}) — resuming saved worker job`.slice(-8000),
          leaseOwner: null,
          leaseExpiresAt: null,
          partial: false,
          errorCode: null,
          runnerAttempts: Number(latest?.runnerAttempts || 0) + 1,
          updatedAt: new Date(),
          finishedAt: null,
        })
        .where(eq(t.reelJobs.id, id));
      return;
    }
    const code = (err as { code?: string } | null)?.code ?? null;
    const exhausted = code !== "FLOW_TERMINAL" && Number(latest?.runnerAttempts || 0) >= 8 && latest?.workerJobId;
    const finalMessage = exhausted
      ? `Automatic recovery gave up after 8 attempts. Last error: ${message}`.slice(0,1200)
      : message.slice(0, 1200);
    await db
      .update(t.reelJobs)
      .set({
        status: "error",
        error: finalMessage,
        errorCode: code === "FLOW_TERMINAL" ? null : code,
        stageDetail: keepLog ? `${prior}\nFlow: [error] ${finalMessage}`.slice(-8000) : finalMessage.slice(0, 240),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(t.reelJobs.id, id));
  }
}

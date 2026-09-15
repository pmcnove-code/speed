import { sql } from "drizzle-orm";
import { reelJobs, reelJobPublicColumns, type ReelShot } from "@/db/schema";

export const reelHasVideo = sql<boolean>`(${reelJobs.video} is not null)`.mapWith(
  (value) => value === true || value === "t" || value === 1,
);

export type PublicReelJob = {
  id: number;
  status: string;
  stage: string;
  stageDetail: string;
  error: string | null;
  errorCode?: string | null;
  partial?: boolean;
  hasVideo: boolean;
  durationMs?: number | null;
  model?: string | null;
  path?: "omni" | "stills" | "flow" | null;
  hook?: string;
  script?: string;
  createdBy?: string | null;
  personaName?: string | null;
  referenceCharacter?: string | null;
  characterGender?: "male" | "female" | null;
  storyboard?: ReelShot[] | null;
  queuedAt?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  postId?: number | null;
  batchId?: number | null;
};

export function toPublicReelJob(
  job: {
    id: number;
    status: string;
    stage?: string;
    stageDetail?: string;
    error?: string | null;
    errorCode?: string | null;
    partial?: boolean;
    durationMs?: number | null;
    model?: string | null;
    hook?: string;
    script?: string;
    createdBy?: string | null;
    personaName?: string | null;
    referenceCharacter?: string | null;
  characterGender?: "male" | "female" | null;
    storyboard?: ReelShot[] | null;
    queuedAt?: Date | string | null;
    createdAt?: Date | string | null;
    finishedAt?: Date | string | null;
    hasVideo?: boolean | null;
    postId?: number | null;
    batchId?: number | null;
  },
  hasVideo?: boolean,
): PublicReelJob {
  const video = hasVideo ?? Boolean(job.hasVideo);
  const stills = Boolean(job.model?.startsWith("stills") || job.model?.startsWith("external"));
  const flow = Boolean(
    job.model?.startsWith("flow") || /(^|\n)Flow:/.test(job.stageDetail ?? ""),
  );
  const iso = (value: Date | string | null | undefined) =>
    value instanceof Date ? value.toISOString() : (value ?? null);
  return {
    id: job.id,
    status: job.status,
    stage: job.stage ?? "",
    stageDetail: job.stageDetail ?? "",
    error: job.error ?? null,
    errorCode: job.errorCode ?? null,
    partial: job.partial ?? false,
    hasVideo: video,
    durationMs: job.durationMs ?? null,
    model: job.model ?? null,
    hook: job.hook,
    script: job.script,
    createdBy: job.createdBy ?? null,
    personaName: job.personaName ?? null,
    referenceCharacter: job.referenceCharacter ?? null,
    characterGender: job.characterGender ?? null,
    storyboard: job.storyboard ?? null,
    path:
      job.status === "done"
        ? flow
          ? "flow"
          : stills
            ? "stills"
            : "omni"
        : flow
          ? "flow"
          : null,
    queuedAt: iso(job.queuedAt),
    createdAt: iso(job.createdAt),
    finishedAt: iso(job.finishedAt),
    postId: job.postId ?? null,
    batchId: job.batchId ?? null,
  };
}

export function reelJobSelect() {
  return {
    ...reelJobPublicColumns(),
    hasVideo: reelHasVideo,
  };
}

export function reelHistorySelect() {
  return {
    id: reelJobs.id,
    status: reelJobs.status,
    stage: reelJobs.stage,
    error: reelJobs.error,
    errorCode: reelJobs.errorCode,
    partial: reelJobs.partial,
    durationMs: reelJobs.durationMs,
    model: reelJobs.model,
    hook: reelJobs.hook,
    script: reelJobs.script,
    createdBy: reelJobs.createdBy,
    createdAt: reelJobs.createdAt,
    finishedAt: reelJobs.finishedAt,
    hasVideo: reelHasVideo,
  };
}

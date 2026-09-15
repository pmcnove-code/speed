/**
 * Batch creation of reel jobs (videos) from posts.
 * For MVP, assigns sequential video numbers per persona within the batch.
 */

import { db, t } from "@/db";
import { reelJobPublicColumns } from "@/db/schema";
import { formatVideoLabel } from "./video-label";
import type { Post } from "@/db/schema";

interface CreateReelJobsInput {
  personaNames: Record<number, string>; // personaId -> name
  createdBy: string;
  flowReady: boolean;
}

/**
 * Creates reel jobs for a batch of posts.
 * Assigns video labels based on persona name and sequential index within this batch.
 */
export async function createBatchReelJobs(
  posts: Post[],
  input: CreateReelJobsInput,
): Promise<Array<{ id: number; postId: number | null; videoLabel: string | null; status: string }>> {
  if (posts.length === 0) {
    return [];
  }

  // Track sequential counter per persona within this batch
  const personaCounters: Record<number, number> = {};

  const values = posts.map((post) => {
    const personaId = post.personaId;
    const personaName = input.personaNames[personaId] ?? `Persona ${personaId}`;
    const nextIndex = (personaCounters[personaId] ?? 0) + 1;
    personaCounters[personaId] = nextIndex;

    const videoLabel = formatVideoLabel(personaName, new Date(), nextIndex);

    return {
      status: "queued",
      stage: input.flowReady ? "setup" : "script",
      stageDetail: input.flowReady ? "Flow: queued — waiting for Chrome" : "Queued",
      postId: post.id,
      hook: post.hook,
      script: post.script,
      onScreenText: post.onScreenText,
      cta: post.cta,
      videoBrief: post.videoBrief,
      videoLabel,
      createdBy: input.createdBy,
    };
  });

  const jobs = await db
    .insert(t.reelJobs)
    .values(values)
    .returning(reelJobPublicColumns());

  return jobs.map((job) => ({
    id: job.id,
    postId: job.postId,
    videoLabel: job.videoLabel,
    status: job.status,
  }));
}

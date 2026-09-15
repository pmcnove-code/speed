import { NextResponse } from "next/server";
import { eq, asc, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const batchId = Number((await params).id);

    const postRows = await db
      .select()
      .from(t.posts)
      .where(eq(t.posts.batchId, batchId))
      .orderBy(asc(t.posts.id));

    const personaRows = await db.select(personaPublicColumns()).from(t.personas);
    const personaById = Object.fromEntries(personaRows.map((p) => [p.id, p]));

    const postIds = postRows.map((p) => p.id);
    const latestJobByPost = new Map<
      number,
      { id: number; status: string; stage: string; stageDetail: string; error: string | null; finishedAt: string | null }
    >();
    if (postIds.length) {
      const jobRows = await db
        .select({
          id: t.reelJobs.id,
          postId: t.reelJobs.postId,
          status: t.reelJobs.status,
          stage: t.reelJobs.stage,
          stageDetail: t.reelJobs.stageDetail,
          error: t.reelJobs.error,
          finishedAt: t.reelJobs.finishedAt,
        })
        .from(t.reelJobs)
        .where(inArray(t.reelJobs.postId, postIds))
        .orderBy(asc(t.reelJobs.id));
      for (const job of jobRows) {
        if (job.postId == null) continue;
        // Rows arrive in ascending id order, so the last write per post is the latest attempt.
        latestJobByPost.set(job.postId, {
          id: job.id,
          status: job.status,
          stage: job.stage,
          stageDetail: job.stageDetail,
          error: job.error,
          finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
        });
      }
    }

    const posts = postRows.map((p) => ({
      ...p,
      persona: personaById[p.personaId] ?? null,
      reelJob: latestJobByPost.get(p.id) ?? null,
    }));

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching batch posts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

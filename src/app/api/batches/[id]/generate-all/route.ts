import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { isFlowReady } from "@/lib/experimental/flow-worker";
import { createBatchReelJobs } from "@/lib/experimental/reel-create";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const batchId = Number(id);
  if (!batchId) return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });

  try {
    const flowReady = await isFlowReady();

    // Get batch and its posts
    const batch = await db.select().from(t.batches).where(eq(t.batches.id, batchId)).limit(1);
    if (!batch[0]) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

    const posts = await db
      .select()
      .from(t.posts)
      .where(eq(t.posts.batchId, batchId));

    if (posts.length === 0) {
      return NextResponse.json({ error: "No posts in this batch" }, { status: 400 });
    }

    // Get persona names for labeling
    const personaIds = [...new Set(posts.map((p) => p.personaId))];
    const personas = await db
      .select()
      .from(t.personas)
      .where(inArray(t.personas.id, personaIds));

    const personaMap: Record<number, string> = {};
    for (const persona of personas) {
      personaMap[persona.id] = persona.name;
    }

    // Create reel jobs for all posts
    const jobs = await createBatchReelJobs(posts, {
      personaNames: personaMap,
      createdBy: session.label,
      flowReady,
    });

    // Update batch status
    await db
      .update(t.batches)
      .set({ status: "running" })
      .where(eq(t.batches.id, batchId));

    return NextResponse.json({
      ok: true,
      batch: { id: batchId, status: "running" },
      jobsCreated: jobs.length,
      jobs,
    });
  } catch (error) {
    console.error(`[generate-all] batch ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate videos" },
      { status: 500 },
    );
  }
}

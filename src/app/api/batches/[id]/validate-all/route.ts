import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";
import { appendGroupedPosts, groupPostsForAirtable } from "@/lib/airtable";

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

    const postIds = posts.map((p) => p.id);

    // Mark all videos for this batch as validated
    const now = new Date();
    const validated = await db
      .update(t.reelJobs)
      .set({
        validated: true,
        validatedAt: now,
      })
      .where(inArray(t.reelJobs.postId, postIds))
      .returning();

    // Update batch status
    await db
      .update(t.batches)
      .set({ status: "done", finishedAt: now })
      .where(eq(t.batches.id, batchId));

    // Automatically send the batch's copy to Airtable once validated.
    const personaIds = [...new Set(posts.map((p) => p.personaId))];
    const personas = personaIds.length
      ? await db.select(personaPublicColumns()).from(t.personas).where(inArray(t.personas.id, personaIds))
      : [];
    const personaById = Object.fromEntries(personas.map((p) => [p.id, p]));

    const groups = groupPostsForAirtable(
      posts
        .sort((a, b) => a.id - b.id)
        .map((p) => {
          const persona = personaById[p.personaId];
          return {
            batchId: p.batchId,
            hook: p.hook,
            script: p.script,
            onScreenText: p.onScreenText,
            cta: p.cta,
            personaName: persona?.name ?? "",
            personaHandle: persona?.handle ?? "",
            model: batch[0].model,
            batchOutputTokens: batch[0].usage?.output_tokens ?? 0,
          };
        }),
    );
    const airtableResult = await appendGroupedPosts(groups);
    if (!airtableResult.error) {
      await db.update(t.batches).set({ airtableSentAt: now }).where(eq(t.batches.id, batchId));
    }

    return NextResponse.json({
      ok: true,
      batch: { id: batchId, status: "done" },
      videosValidated: validated.length,
      airtable: { rows: airtableResult.rows, error: airtableResult.error },
    });
  } catch (error) {
    console.error(`[validate-all] batch ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate videos" },
      { status: 500 },
    );
  }
}

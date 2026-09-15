import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";
import { appendGroupedPosts, groupPostsForAirtable } from "@/lib/airtable";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batchId = Number(body.batchId) || 0;
  const singleId = Number(body.postId) || 0;
  const postIds = Array.isArray(body.postIds)
    ? body.postIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
    : singleId
      ? [singleId]
      : [];

  if (!batchId && !postIds.length) {
    return NextResponse.json({ error: "postId, postIds, or batchId required" }, { status: 400 });
  }

  const postRows = postIds.length
    ? await db.select().from(t.posts).where(inArray(t.posts.id, postIds)).orderBy(asc(t.posts.id))
    : await db.select().from(t.posts).where(eq(t.posts.batchId, batchId)).orderBy(asc(t.posts.id));

  if (!postRows.length) return NextResponse.json({ rows: 0, error: "No posts to send." });

  const batchIds = [...new Set(postRows.map((p) => p.batchId))];
  const batches = await db.select().from(t.batches).where(inArray(t.batches.id, batchIds));
  const batchById = Object.fromEntries(batches.map((b) => [b.id, b]));

  const personaIds = [...new Set(postRows.map((p) => p.personaId))];
  const personas = personaIds.length
    ? await db.select(personaPublicColumns()).from(t.personas).where(inArray(t.personas.id, personaIds))
    : [];
  const personaById = Object.fromEntries(personas.map((p) => [p.id, p]));

  const groups = groupPostsForAirtable(
    postRows.map((p) => {
      const batch = batchById[p.batchId];
      const persona = personaById[p.personaId];
      return {
        batchId: p.batchId,
        hook: p.hook,
        script: p.script,
        onScreenText: p.onScreenText,
        cta: p.cta,
        personaName: persona?.name ?? "",
        personaHandle: persona?.handle ?? "",
        model: batch?.model ?? "",
        batchOutputTokens: batch?.usage?.output_tokens ?? 0,
      };
    }),
  );

  const written = await appendGroupedPosts(groups);
  return NextResponse.json({ rows: written.rows, error: written.error });
}

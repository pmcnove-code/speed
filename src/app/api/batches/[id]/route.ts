import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const batchId = Number((await params).id);

  const [batch] = await db.select().from(t.batches).where(eq(t.batches.id, batchId));
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });

  const postRows = await db.select().from(t.posts).where(eq(t.posts.batchId, batchId)).orderBy(asc(t.posts.id));
  const personaRows = await db.select(personaPublicColumns()).from(t.personas);
  const personaById = Object.fromEntries(personaRows.map((p) => [p.id, p]));

  return NextResponse.json({
    batch,
    posts: postRows.map((p) => ({ ...p, persona: personaById[p.personaId] ?? null })),
    keptCount: postRows.length,
    droppedCount: 0,
  });
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { BODY_MAX, distillBody } from "@/lib/engine/knowledge";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const [row] = await db.select().from(t.knowledgeBase).where(eq(t.knowledgeBase.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    entry: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const id = Number((await params).id);
  const [existing] = await db.select().from(t.knowledgeBase).where(eq(t.knowledgeBase.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const patch: {
    title?: string;
    body?: string;
    digest?: string;
    sourceUrl?: string | null;
    active?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (typeof b.title === "string") {
    const title = b.title.trim().slice(0, 160);
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    patch.title = title;
  }
  if (typeof b.sourceUrl === "string") {
    patch.sourceUrl = b.sourceUrl.trim() ? b.sourceUrl.trim().slice(0, 500) : null;
  }
  if (typeof b.active === "boolean") patch.active = b.active;

  const nextTitle = patch.title ?? existing.title;
  let nextBody = existing.body;
  if (typeof b.body === "string") {
    const body = b.body.trim();
    if (!body) return NextResponse.json({ error: "paste a transcript or notes" }, { status: 400 });
    if (body.length > BODY_MAX) {
      return NextResponse.json({ error: `entry is too long (max ${BODY_MAX.toLocaleString()} characters)` }, { status: 400 });
    }
    patch.body = body;
    nextBody = body;
  }

  const bodyChanged = typeof patch.body === "string" && patch.body !== existing.body;
  if (bodyChanged || b.redistill === true) {
    patch.digest = await distillBody(nextTitle, nextBody);
  }

  const [row] = await db.update(t.knowledgeBase).set(patch).where(eq(t.knowledgeBase.id, id)).returning();
  return NextResponse.json({
    entry: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const id = Number((await params).id);
  await db.delete(t.knowledgeBase).where(eq(t.knowledgeBase.id, id));
  return NextResponse.json({ ok: true });
}

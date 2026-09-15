import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { BODY_MAX, distillBody } from "@/lib/engine/knowledge";

function listRow(r: {
  id: number;
  title: string;
  digest: string;
  sourceUrl: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  bodyChars: number;
}) {
  return {
    id: r.id,
    title: r.title,
    digest: r.digest,
    sourceUrl: r.sourceUrl,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    bodyChars: r.bodyChars,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: t.knowledgeBase.id,
      title: t.knowledgeBase.title,
      digest: t.knowledgeBase.digest,
      sourceUrl: t.knowledgeBase.sourceUrl,
      active: t.knowledgeBase.active,
      createdAt: t.knowledgeBase.createdAt,
      updatedAt: t.knowledgeBase.updatedAt,
      bodyChars: sql<number>`length(${t.knowledgeBase.body})`.mapWith(Number),
    })
    .from(t.knowledgeBase)
    .orderBy(desc(t.knowledgeBase.updatedAt));
  return NextResponse.json({ entries: rows.map(listRow) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 160) : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  const sourceUrl = typeof b.sourceUrl === "string" && b.sourceUrl.trim() ? b.sourceUrl.trim().slice(0, 500) : null;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "paste a transcript or notes" }, { status: 400 });
  if (body.length > BODY_MAX) {
    return NextResponse.json({ error: `entry is too long (max ${BODY_MAX.toLocaleString()} characters)` }, { status: 400 });
  }

  const digest = await distillBody(title, body);
  const [row] = await db
    .insert(t.knowledgeBase)
    .values({
      title,
      body,
      digest,
      sourceUrl,
      active: b.active !== false,
    })
    .returning();
  return NextResponse.json({
    entry: {
      ...listRow({ ...row, bodyChars: body.length }),
      body: row.body,
    },
  });
}

import { NextResponse } from "next/server";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { BODY_MAX, distillBody } from "@/lib/engine/knowledge";
import { transcribeYouTube } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return NextResponse.json({ error: "YouTube URL required" }, { status: 400 });

  try {
    const result = await transcribeYouTube(url);
    const title =
      typeof b.title === "string" && b.title.trim()
        ? b.title.trim().slice(0, 160)
        : result.title.slice(0, 160);
    let body = result.transcript;
    if (body.length > BODY_MAX) body = body.slice(0, BODY_MAX);
    const digest = await distillBody(title, body);
    const [row] = await db
      .insert(t.knowledgeBase)
      .values({
        title,
        body,
        digest,
        sourceUrl: result.url.slice(0, 500),
        active: b.active !== false,
      })
      .returning();
    return NextResponse.json({
      entry: {
        id: row.id,
        title: row.title,
        digest: row.digest,
        sourceUrl: row.sourceUrl,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        bodyChars: body.length,
        via: result.via,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("youtube transcribe failed", msg);
    return NextResponse.json({ error: msg.slice(0, 400) }, { status: 502 });
  }
}

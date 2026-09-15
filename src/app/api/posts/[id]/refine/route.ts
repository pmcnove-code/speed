import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";
import { refinePost } from "@/lib/engine/refine";
import { scoreBatch } from "@/lib/engine/score";
import { loadKnowledgeBank } from "@/lib/engine/knowledge";
import type { ProviderId } from "@/lib/llm/provider";
import type { GeneratedPost } from "@/lib/engine/prompts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "refine prompt required" }, { status: 400 });
  if (prompt.length > 1500) return NextResponse.json({ error: "prompt too long" }, { status: 400 });

  try {
    const [post] = await db.select().from(t.posts).where(eq(t.posts.id, id));
    if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [persona] = await db.select(personaPublicColumns()).from(t.personas).where(eq(t.personas.id, post.personaId));
    if (!persona) return NextResponse.json({ error: "persona missing" }, { status: 404 });
    const [batch] = await db.select().from(t.batches).where(eq(t.batches.id, post.batchId));
    if (!batch) return NextResponse.json({ error: "batch missing" }, { status: 404 });
    const [format] = await db.select().from(t.formats).where(eq(t.formats.id, batch.formatId));
    if (!format) return NextResponse.json({ error: "format missing" }, { status: 404 });

    const knowledgeRows = await db
      .select({ note: t.personaKnowledge.note })
      .from(t.personaKnowledge)
      .where(eq(t.personaKnowledge.personaId, persona.id))
      .orderBy(desc(t.personaKnowledge.id))
      .limit(40);

    const original: GeneratedPost = {
      hook: post.hook,
      script: post.script,
      on_screen_text: post.onScreenText,
      cta: post.cta,
      video_brief: post.videoBrief,
      angle_tag: post.angleTag,
    };

    const { post: refined } = await refinePost(
      batch.provider as ProviderId,
      persona,
      format,
      original,
      prompt,
      knowledgeRows.map((r) => r.note),
      await loadKnowledgeBank(),
    );

    const { scores } = await scoreBatch(batch.provider as ProviderId, persona, [refined]);
    const alignScore = scores[0] ?? null;

    await db.insert(t.personaKnowledge).values({
      personaId: persona.id,
      note: prompt,
      sourcePostId: post.id,
    });

    const [updated] = await db
      .update(t.posts)
      .set({
        hook: refined.hook,
        script: refined.script,
        onScreenText: refined.on_screen_text,
        cta: refined.cta,
        videoBrief: refined.video_brief,
        angleTag: refined.angle_tag,
        alignScore,
      })
      .where(eq(t.posts.id, id))
      .returning();

    return NextResponse.json({ post: { ...updated, persona } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("refine failed", msg);
    return NextResponse.json({ error: msg.slice(0, 280) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const postId = Number((await params).id);
    const [post] = await db.select().from(t.posts).where(eq(t.posts.id, postId));

    if (!post) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const postId = Number((await params).id);
    const body = await req.json();

    // Build update object from allowed fields
    const updateData: Record<string, unknown> = {};
    if ("hook" in body) updateData.hook = String(body.hook).trim();
    if ("script" in body) updateData.script = String(body.script).trim();
    if ("cta" in body) updateData.cta = String(body.cta).trim();
    if ("videoBrief" in body) updateData.videoBrief = String(body.videoBrief).trim();
    if ("onScreenText" in body && Array.isArray(body.onScreenText)) updateData.onScreenText = body.onScreenText;
    if ("angleTag" in body) updateData.angleTag = String(body.angleTag).trim();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(t.posts)
      .set(updateData)
      .where(eq(t.posts.id, postId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update post" },
      { status: 500 }
    );
  }
}

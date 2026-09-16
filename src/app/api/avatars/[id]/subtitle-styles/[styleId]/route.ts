import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { normalizeSubtitleStyle } from "../../../../../../../shared/flow/subtitle-style.mjs";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; styleId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, styleId } = await params;
  const personaId = Number(id);
  const subtitleStyleId = Number(styleId);

  if (!Number.isSafeInteger(personaId) || personaId <= 0 || !Number.isSafeInteger(subtitleStyleId) || subtitleStyleId <= 0) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 1 || name.length > 80) {
        return NextResponse.json({ error: "Name must be 1-80 characters" }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.config !== undefined) {
      updates.config = normalizeSubtitleStyle(body.config);
    }

    if (body.selected === true) {
      // Unselect all other styles for this persona
      await db
        .update(t.subtitleStyles)
        .set({ selected: false })
        .where(sql`${t.subtitleStyles.personaId} = ${personaId} AND ${t.subtitleStyles.id} != ${subtitleStyleId}`);
      updates.selected = true;
    } else if (body.selected === false) {
      updates.selected = false;
    }

    updates.updatedAt = new Date();

    const result = await db
      .update(t.subtitleStyles)
      .set(updates)
      .where(and(eq(t.subtitleStyles.id, subtitleStyleId), eq(t.subtitleStyles.personaId, personaId)))
      .returning({ id: t.subtitleStyles.id });

    if (!result.length) {
      return NextResponse.json({ error: "Subtitle style not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating subtitle style:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update subtitle style" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; styleId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, styleId } = await params;
  const personaId = Number(id);
  const subtitleStyleId = Number(styleId);

  if (!Number.isSafeInteger(personaId) || personaId <= 0 || !Number.isSafeInteger(subtitleStyleId) || subtitleStyleId <= 0) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  try {
    // Get the style to check if it was selected
    const [toDelete] = await db
      .select({
        id: t.subtitleStyles.id,
        selected: t.subtitleStyles.selected,
      })
      .from(t.subtitleStyles)
      .where(and(eq(t.subtitleStyles.id, subtitleStyleId), eq(t.subtitleStyles.personaId, personaId)));

    if (!toDelete) {
      return NextResponse.json({ error: "Subtitle style not found" }, { status: 404 });
    }

    // Delete the style
    await db
      .delete(t.subtitleStyles)
      .where(eq(t.subtitleStyles.id, subtitleStyleId));

    // If it was selected, promote the oldest remaining style
    if (toDelete.selected) {
      const [oldest] = await db
        .select({ id: t.subtitleStyles.id })
        .from(t.subtitleStyles)
        .where(eq(t.subtitleStyles.personaId, personaId))
        .orderBy(t.subtitleStyles.createdAt)
        .limit(1);

      if (oldest) {
        await db
          .update(t.subtitleStyles)
          .set({ selected: true })
          .where(eq(t.subtitleStyles.id, oldest.id));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting subtitle style:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete subtitle style" },
      { status: 500 }
    );
  }
}

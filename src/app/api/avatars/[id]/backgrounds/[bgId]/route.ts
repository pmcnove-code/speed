import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; bgId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, bgId } = await params;
  const personaId = Number(id);
  const backgroundId = Number(bgId);

  if (!Number.isSafeInteger(personaId) || personaId <= 0 || !Number.isSafeInteger(backgroundId) || backgroundId <= 0) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.label !== undefined) {
      const label = String(body.label).trim();
      if (label.length < 1 || label.length > 80) {
        return NextResponse.json({ error: "Label must be 1-80 characters" }, { status: 400 });
      }
      updates.label = label;
    }

    if (body.selected === true) {
      // Unselect all other backgrounds for this persona
      await db
        .update(t.personaBackgrounds)
        .set({ selected: false })
        .where(sql`${t.personaBackgrounds.personaId} = ${personaId} AND ${t.personaBackgrounds.id} != ${backgroundId}`);
      updates.selected = true;
    } else if (body.selected === false) {
      updates.selected = false;
    }

    const result = await db
      .update(t.personaBackgrounds)
      .set(updates)
      .where(and(eq(t.personaBackgrounds.id, backgroundId), eq(t.personaBackgrounds.personaId, personaId)))
      .returning({ id: t.personaBackgrounds.id });

    if (!result.length) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating background:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update background" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; bgId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, bgId } = await params;
  const personaId = Number(id);
  const backgroundId = Number(bgId);

  if (!Number.isSafeInteger(personaId) || personaId <= 0 || !Number.isSafeInteger(backgroundId) || backgroundId <= 0) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  try {
    // Get the background to check if it was selected
    const [toDelete] = await db
      .select({
        id: t.personaBackgrounds.id,
        selected: t.personaBackgrounds.selected,
      })
      .from(t.personaBackgrounds)
      .where(and(eq(t.personaBackgrounds.id, backgroundId), eq(t.personaBackgrounds.personaId, personaId)));

    if (!toDelete) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    // Delete the background
    await db
      .delete(t.personaBackgrounds)
      .where(eq(t.personaBackgrounds.id, backgroundId));

    // If it was selected, promote the oldest remaining background
    if (toDelete.selected) {
      const [oldest] = await db
        .select({ id: t.personaBackgrounds.id })
        .from(t.personaBackgrounds)
        .where(eq(t.personaBackgrounds.personaId, personaId))
        .orderBy(t.personaBackgrounds.createdAt)
        .limit(1);

      if (oldest) {
        await db
          .update(t.personaBackgrounds)
          .set({ selected: true })
          .where(eq(t.personaBackgrounds.id, oldest.id));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting background:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete background" },
      { status: 500 }
    );
  }
}

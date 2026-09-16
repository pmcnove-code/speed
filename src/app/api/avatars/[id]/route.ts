import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const personaId = Number(id);
  if (!Number.isSafeInteger(personaId) || personaId <= 0) {
    return NextResponse.json({ error: "Invalid persona ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 1 || name.length > 160) {
        return NextResponse.json({ error: "Name must be 1-160 characters" }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const result = await db
      .update(t.personas)
      .set(updates)
      .where(eq(t.personas.id, personaId))
      .returning({ id: t.personas.id });

    if (!result.length) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating avatar:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update avatar" },
      { status: 500 }
    );
  }
}

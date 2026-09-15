import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const personaId = Number(id);
  if (!personaId) return NextResponse.json({ error: "Invalid persona ID" }, { status: 400 });

  try {
    const personas = await db
      .select()
      .from(t.personas)
      .where(eq(t.personas.id, personaId))
      .limit(1);

    if (!personas[0]) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ persona: personas[0] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch persona" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const personaId = Number(id);
  if (!personaId) return NextResponse.json({ error: "Invalid persona ID" }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : null;

    // Update persona voice ID
    const updated = await db
      .update(t.personas)
      .set({ voiceId })
      .where(eq(t.personas.id, personaId))
      .returning();

    if (!updated[0]) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, persona: updated[0] });
  } catch (error) {
    console.error(`[persona-patch] id ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update persona" },
      { status: 500 },
    );
  }
}

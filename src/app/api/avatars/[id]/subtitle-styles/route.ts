import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { normalizeSubtitleStyle } from "../../../../../../shared/flow/subtitle-style.mjs";

export const runtime = "nodejs";

export async function POST(
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

    const name = String(body.name || "").trim();
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json({ error: "Name must be 1-80 characters" }, { status: 400 });
    }

    const config = normalizeSubtitleStyle(body.config);

    // Check that persona exists
    const [persona] = await db
      .select({ id: t.personas.id })
      .from(t.personas)
      .where(eq(t.personas.id, personaId));
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    // Check if this is the first subtitle style
    const [existingStyle] = await db
      .select({ id: t.subtitleStyles.id })
      .from(t.subtitleStyles)
      .where(sql`${t.subtitleStyles.personaId} = ${personaId}`)
      .limit(1);

    const isFirst = !existingStyle;

    const [newStyle] = await db
      .insert(t.subtitleStyles)
      .values({
        personaId,
        name,
        config,
        selected: isFirst,
      })
      .returning({
        id: t.subtitleStyles.id,
        name: t.subtitleStyles.name,
        selected: t.subtitleStyles.selected,
        config: t.subtitleStyles.config,
      });

    return NextResponse.json({ style: newStyle });
  } catch (error) {
    console.error("Error creating subtitle style:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create subtitle style" },
      { status: 500 }
    );
  }
}

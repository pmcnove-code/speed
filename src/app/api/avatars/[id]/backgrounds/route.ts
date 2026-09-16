import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 6 * 1024 * 1024; // 6MB

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, mime, b64] = match;
    if (!ALLOWED_MIMES.includes(mime)) return null;
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > MAX_BYTES) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

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

    const label = String(body.label || "").trim();
    if (label.length < 1 || label.length > 80) {
      return NextResponse.json({ error: "Label must be 1-80 characters" }, { status: 400 });
    }

    const dataUrl = String(body.dataUrl || "");
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid or oversized image" }, { status: 413 });
    }

    // Check that persona exists
    const [persona] = await db
      .select({ id: t.personas.id })
      .from(t.personas)
      .where(eq(t.personas.id, personaId));
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    // Check if this is the first background
    const [existingBg] = await db
      .select({ id: t.personaBackgrounds.id })
      .from(t.personaBackgrounds)
      .where(sql`${t.personaBackgrounds.personaId} = ${personaId}`)
      .limit(1);

    const isFirst = !existingBg;

    const [newBg] = await db
      .insert(t.personaBackgrounds)
      .values({
        personaId,
        label,
        image: parsed.bytes,
        imageMime: parsed.mime,
        selected: isFirst,
      })
      .returning({
        id: t.personaBackgrounds.id,
        label: t.personaBackgrounds.label,
        selected: t.personaBackgrounds.selected,
      });

    return NextResponse.json({ background: newBg });
  } catch (error) {
    console.error("Error creating background:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create background" },
      { status: 500 }
    );
  }
}

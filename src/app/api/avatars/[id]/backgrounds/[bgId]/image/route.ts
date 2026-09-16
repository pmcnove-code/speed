import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
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
    const [row] = await db
      .select({
        image: t.personaBackgrounds.image,
        imageMime: t.personaBackgrounds.imageMime,
      })
      .from(t.personaBackgrounds)
      .where(and(eq(t.personaBackgrounds.id, backgroundId), eq(t.personaBackgrounds.personaId, personaId)));

    if (!row?.image) {
      return NextResponse.json({ error: "Background image not found" }, { status: 404 });
    }

    const bytes = Buffer.isBuffer(row.image) ? row.image : Buffer.from(row.image);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.imageMime || "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error fetching background image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch background image" },
      { status: 500 }
    );
  }
}

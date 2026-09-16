import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
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
    const [row] = await db
      .select({
        photo: t.personas.photo,
        photoMime: t.personas.photoMime,
      })
      .from(t.personas)
      .where(eq(t.personas.id, personaId));

    if (!row?.photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const bytes = Buffer.isBuffer(row.photo) ? row.photo : Buffer.from(row.photo);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.photoMime || "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error fetching photo:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch photo" },
      { status: 500 }
    );
  }
}

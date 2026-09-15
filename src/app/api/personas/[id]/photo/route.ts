import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!id) return new NextResponse("bad id", { status: 400 });

  const [row] = await db
    .select({ photo: t.personas.photo, photoMime: t.personas.photoMime })
    .from(t.personas)
    .where(eq(t.personas.id, id));
  if (!row?.photo) return new NextResponse("not found", { status: 404 });

  const body = Buffer.isBuffer(row.photo) ? row.photo : Buffer.from(row.photo);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": row.photoMime || "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "photo file required" }, { status: 400 });
  }
  const mime = ALLOWED[file.type];
  if (!mime) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, or GIF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo must be under 4 MB." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const [row] = await db
    .update(t.personas)
    .set({ photo: buf, photoMime: mime, photoUpdatedAt: new Date() })
    .where(eq(t.personas.id, id))
    .returning(personaPublicColumns());
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ persona: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const id = Number((await params).id);
  const [row] = await db
    .update(t.personas)
    .set({ photo: null, photoMime: null, photoUpdatedAt: null })
    .where(eq(t.personas.id, id))
    .returning(personaPublicColumns());
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ persona: row });
}

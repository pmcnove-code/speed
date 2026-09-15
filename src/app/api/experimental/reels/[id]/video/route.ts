import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { parseByteRange } from "@/lib/experimental/byte-range";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!id) return new NextResponse("bad id", { status: 400 });

  const [row] = await db
    .select({ video: t.reelJobs.video, videoMime: t.reelJobs.videoMime })
    .from(t.reelJobs)
    .where(eq(t.reelJobs.id, id));
  if (!row?.video) return new NextResponse("not found", { status: 404 });

  const body = Buffer.isBuffer(row.video) ? row.video : Buffer.from(row.video);
  const mime = row.videoMime || "video/mp4";
  const download = new URL(req.url).searchParams.get("download");
  const disposition = download ? `attachment; filename="reel-${id}.mp4"` : "inline";
  const range = parseByteRange(req.headers.get("range"), body.length);

  if (range && !download) {
    const slice = body.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(slice.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${body.length}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(body.length),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

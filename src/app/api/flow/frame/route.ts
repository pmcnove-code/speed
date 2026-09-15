import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchFlowLoginFrame } from "@/lib/experimental/flow-worker";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return new NextResponse(null, { status: 204 });
  try {
    const bytes = await fetchFlowLoginFrame(id);
    if (!bytes) return new NextResponse(null, { status: 204 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

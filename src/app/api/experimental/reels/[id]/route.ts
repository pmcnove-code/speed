import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { reelJobSelect, toPublicReelJob } from "@/lib/experimental/reel-public";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const [job] = await db.select(reelJobSelect()).from(t.reelJobs).where(eq(t.reelJobs.id, id));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ job: toPublicReelJob(job) });
}

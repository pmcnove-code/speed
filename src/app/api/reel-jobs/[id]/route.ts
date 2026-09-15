import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { reelJobSelect, toPublicReelJob } from "@/lib/experimental/reel-public";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const jobId = Number((await params).id);

    const [job] = await db
      .select({ ...reelJobSelect(), batchId: t.posts.batchId })
      .from(t.reelJobs)
      .leftJoin(t.posts, eq(t.reelJobs.postId, t.posts.id))
      .where(eq(t.reelJobs.id, jobId));

    if (!job) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json(toPublicReelJob(job));
  } catch (error) {
    console.error("Error fetching reel job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch reel job" },
      { status: 500 }
    );
  }
}

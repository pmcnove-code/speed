import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { reelJobSelect, toPublicReelJob } from "@/lib/experimental/reel-public";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select({ ...reelJobSelect(), batchId: t.posts.batchId })
      .from(t.reelJobs)
      .leftJoin(t.posts, eq(t.reelJobs.postId, t.posts.id))
      .orderBy(
        sql`case when ${t.reelJobs.status} in ('queued','running') then 0 else 1 end`,
        desc(t.reelJobs.queuedAt)
      )
      .limit(200);

    return NextResponse.json(rows.map((row) => toPublicReelJob(row)));
  } catch (error) {
    console.error("Error fetching reel jobs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch reel jobs" },
      { status: 500 }
    );
  }
}

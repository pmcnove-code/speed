import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { estimateUsd, totalSpendUsd, usageFrom } from "@/lib/cost";
import { HistoryView } from "@/components/history/history-view";
import { reelHistorySelect, toPublicReelJob } from "@/lib/experimental/reel-public";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const batches = await db.select().from(t.batches).orderBy(desc(t.batches.id));
  const totalSpend = totalSpendUsd(batches);
  const recent = batches.slice(0, 50);
  const reelRows = await db
    .select({
      ...reelHistorySelect(),
      personaName: t.personas.name,
    })
    .from(t.reelJobs)
    .leftJoin(t.posts, eq(t.reelJobs.postId, t.posts.id))
    .leftJoin(t.personas, eq(t.posts.personaId, t.personas.id))
    .orderBy(desc(t.reelJobs.id))
    .limit(500);
  const reels = reelRows.map((row) => toPublicReelJob(row));
  const playableCount = reels.filter((row) => row.hasVideo).length;

  return (
    <HistoryView
      batchCount={batches.length}
      reelCount={reels.length}
      playableCount={playableCount}
      totalSpend={totalSpend}
      copySpend={recent.reduce((s, b) => s + estimateUsd(b.provider, b.model, usageFrom(b.usage)), 0)}
      batches={recent.map((b) => {
        const usage = usageFrom(b.usage);
        return {
          id: b.id,
          provider: b.provider,
          model: b.model,
          countRequested: b.countRequested,
          personaCount: b.personaIds.length,
          status: b.status,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.total_tokens,
          spend: estimateUsd(b.provider, b.model, usage),
          createdBy: b.createdBy,
          createdAt: b.createdAt.toISOString(),
        };
      })}
      reels={reels}
    />
  );
}

import { count } from "drizzle-orm";
import { db, t } from "@/db";
import { buildCostReport } from "@/lib/cost-report";
import { CostsView } from "@/components/costs/costs-view";

export default async function CostsPage() {
  const [batches, postCounts, personas] = await Promise.all([
    db.select().from(t.batches),
    db
      .select({
        batchId: t.posts.batchId,
        personaId: t.posts.personaId,
        n: count(),
      })
      .from(t.posts)
      .groupBy(t.posts.batchId, t.posts.personaId),
    db.select({ id: t.personas.id, name: t.personas.name, handle: t.personas.handle }).from(t.personas),
  ]);

  const report = buildCostReport(
    batches.map((b) => ({
      id: b.id,
      provider: b.provider,
      model: b.model,
      status: b.status,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      personaIds: b.personaIds,
      countRequested: b.countRequested,
      usage: b.usage,
    })),
    postCounts.map((p) => ({ batchId: p.batchId, personaId: p.personaId, n: Number(p.n) || 0 })),
    personas,
  );

  return <CostsView report={report} />;
}

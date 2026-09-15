import { desc, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { KnowledgeView, type KnowledgeListItem } from "@/components/knowledge/knowledge-view";

export default async function KnowledgePage() {
  const session = await getSession();
  const rows = await db
    .select({
      id: t.knowledgeBase.id,
      title: t.knowledgeBase.title,
      digest: t.knowledgeBase.digest,
      sourceUrl: t.knowledgeBase.sourceUrl,
      active: t.knowledgeBase.active,
      createdAt: t.knowledgeBase.createdAt,
      updatedAt: t.knowledgeBase.updatedAt,
      bodyChars: sql<number>`length(${t.knowledgeBase.body})`.mapWith(Number),
    })
    .from(t.knowledgeBase)
    .orderBy(desc(t.knowledgeBase.updatedAt));

  const entries: KnowledgeListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    digest: r.digest,
    sourceUrl: r.sourceUrl,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    bodyChars: r.bodyChars,
  }));

  return <KnowledgeView entries={entries} isAdmin={session!.role === "admin"} />;
}

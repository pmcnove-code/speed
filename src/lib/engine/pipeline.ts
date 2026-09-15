/**
 * Batch pipeline: per-persona generate -> dedup -> align-score -> topup.
 * Posts scoring under 80% persona alignment are dropped and regenerated.
 * Near-duplicates (hook+script vs this batch and recent history) are dropped
 * when GEN_UNIQUE_DROP is on (default); we never keep a similar post just to
 * hit the requested count. When off, similar copies are kept.
 */
import { eq, desc, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { personaPublicColumns } from "@/db/schema";
import type { ProviderId } from "@/lib/llm/provider";
import { generateParallel, emptyUsage, addUsage } from "./generate";
import { dedupe, HISTORY_WINDOW, type DedupRef } from "./dedup";
import { ALIGN_THRESHOLD, scoreBatch } from "./score";
import { loadKnowledgeBank } from "./knowledge";
import { uniqueDropEnabled } from "@/lib/config";
import type { GeneratedPost, OutputCfg } from "./prompts";

const MAX_TOPUP_ROUNDS = 4;
const OVERGEN_BUFFER = 3;

async function emit(batchId: number, stage: string, detail: Record<string, unknown> = {}) {
  await db.insert(t.jobEvents).values({ batchId, stage, detail });
}

async function recentCopy(limit = HISTORY_WINDOW): Promise<DedupRef[]> {
  const rows = await db
    .select({
      hook: t.posts.hook,
      script: t.posts.script,
      onScreenText: t.posts.onScreenText,
    })
    .from(t.posts)
    .orderBy(desc(t.posts.id))
    .limit(limit);
  return rows.map((r) => ({
    hook: r.hook,
    script: r.script,
    on_screen_text: r.onScreenText ?? [],
  }));
}

async function loadKnowledge(personaId: number): Promise<string[]> {
  const rows = await db
    .select({ note: t.personaKnowledge.note })
    .from(t.personaKnowledge)
    .where(eq(t.personaKnowledge.personaId, personaId))
    .orderBy(desc(t.personaKnowledge.id))
    .limit(40);
  return rows.map((r) => r.note);
}

export async function runBatch(batchId: number): Promise<void> {
  const [batch] = await db.select().from(t.batches).where(eq(t.batches.id, batchId));
  if (!batch) return;

  const provider = batch.provider as ProviderId;
  const usageTotal = emptyUsage();

  try {
    const personaRows = batch.personaIds.length
      ? await db.select(personaPublicColumns()).from(t.personas).where(inArray(t.personas.id, batch.personaIds))
      : [];
    const [format] = await db.select().from(t.formats).where(eq(t.formats.id, batch.formatId));
    if (!personaRows.length || !format) throw new Error("personas or format missing");

    const bank = await loadKnowledgeBank();
    const uniqueDrop = await uniqueDropEnabled();
    await db.update(t.batches).set({ status: "running" }).where(eq(t.batches.id, batchId));
    await emit(batchId, "started", { provider, model: batch.model, knowledge: bank.length, uniqueDrop });

    let totalKept = 0;
    let totalSimilarDropped = 0;
    const history = await recentCopy();
    const batchSeen: DedupRef[] = [];

    for (const persona of personaRows) {
      await emit(batchId, "generating", { persona: persona.handle, name: persona.name, emoji: persona.emoji });

      const knowledge = await loadKnowledge(persona.id);
      const kept: Array<GeneratedPost & { alignScore: number }> = [];
      let similarDropped = 0;

      for (let round = 0; round < MAX_TOPUP_ROUNDS && kept.length < batch.countRequested; round++) {
        const need = batch.countRequested - kept.length;
        const avoid = [...history, ...batchSeen, ...kept];
        const { posts, usage } = await generateParallel(
          provider,
          persona,
          format,
          need + OVERGEN_BUFFER,
          avoid,
          batch.situation ?? "",
          undefined as OutputCfg | undefined,
          knowledge,
          bank,
        );
        addUsage(usageTotal, usage);

        const { kept: fresh, rejected } = dedupe(posts, avoid, uniqueDrop);
        similarDropped += rejected.length;
        await emit(batchId, "dedup", { persona: persona.handle, raw: posts.length, dropped: rejected.length });

        await emit(batchId, "align", { persona: persona.handle, reviewing: fresh.length });
        const { scores, failedOpen, usage: scoreUsage } = await scoreBatch(provider, persona, fresh);
        addUsage(usageTotal, scoreUsage);
        if (failedOpen) await emit(batchId, "align-failed-open", { persona: persona.handle });

        const dropped = fresh.filter((_, i) => (scores[i] ?? 0) < ALIGN_THRESHOLD).length;
        if (dropped) await emit(batchId, "align-retry", { persona: persona.handle, dropped });

        for (const [i, post] of fresh.entries()) {
          const score = scores[i] ?? 0;
          if (score < ALIGN_THRESHOLD) continue;
          if (kept.length >= batch.countRequested) continue;
          await db.insert(t.posts).values({
            batchId,
            personaId: persona.id,
            hook: post.hook,
            script: post.script,
            onScreenText: post.on_screen_text,
            cta: post.cta,
            videoBrief: post.video_brief,
            angleTag: post.angle_tag,
            alignScore: score,
          });
          kept.push({ ...post, alignScore: score });
        }
      }

      totalKept += kept.length;
      totalSimilarDropped += similarDropped;
      batchSeen.push(...kept);
      await emit(batchId, "persona-done", {
        persona: persona.handle,
        kept: kept.length,
        droppedSimilar: similarDropped,
      });
    }

    await db
      .update(t.batches)
      .set({ status: "ready", usage: usageTotal, finishedAt: new Date() })
      .where(eq(t.batches.id, batchId));
    await emit(batchId, "done", {
      kept: totalKept,
      droppedSimilar: totalSimilarDropped,
      usage: usageTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(t.batches)
      .set({ status: "error", error: msg.slice(0, 500), usage: usageTotal, finishedAt: new Date() })
      .where(eq(t.batches.id, batchId));
    await emit(batchId, "error", { message: msg.slice(0, 300) });
  }
}


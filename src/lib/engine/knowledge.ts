/**
 * Global knowledge bank — YouTube transcripts, articles, notes.
 * Long entries are distilled into a compact "copy fuel" brief; generation
 * prompts receive the digest, not the raw 20k-word dump.
 */
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { converse, providerAvailable, type ProviderId } from "@/lib/llm/provider";

export const BANK_CHAR_BUDGET = 48_000;
export const DIGEST_MAX = 2_400;
export const DIGEST_MIN = 180;
export const SHORT_BODY = 2_400;
export const DISTILL_INPUT_MAX = 24_000;
export const BODY_MAX = 400_000;

export type KnowledgeCard = { title: string; digest: string };

export function clipText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

export function knowledgeBankBlock(cards: KnowledgeCard[]): string {
  const usable = cards
    .map((c) => ({ title: (c.title || "Untitled").trim(), digest: (c.digest || "").trim() }))
    .filter((c) => c.digest);
  if (!usable.length) return "";

  const titleOverhead = usable.reduce((n, c) => n + c.title.length + 10, 0);
  const room = Math.max(usable.length * DIGEST_MIN, BANK_CHAR_BUDGET - 700 - titleOverhead);
  const per = Math.max(DIGEST_MIN, Math.min(DIGEST_MAX, Math.floor(room / usable.length)));
  const parts = usable.map((c) => `### ${c.title}\n${clipText(c.digest, per)}`);

  return `\
KNOWLEDGE BANK — ${usable.length} owner sources. Scan ALL of them. Pull facts, numbers, food names, mechanisms, stories, and phrases from several briefs — not just the first.
Use this as FUEL for specificity.
Do NOT quote long passages. Do NOT summarize the source. Do NOT sound like a recap of a video.
Stay in THIS persona's voice. If a fact wouldn't come out of this avatar's mouth, skip it.

${parts.join("\n\n")}`;
}

export async function loadKnowledgeBank(): Promise<KnowledgeCard[]> {
  try {
    const rows = await db
      .select({
        title: t.knowledgeBase.title,
        digest: t.knowledgeBase.digest,
        body: t.knowledgeBase.body,
      })
      .from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.active, true))
      .orderBy(desc(t.knowledgeBase.updatedAt));
    return rows.map((r) => ({
      title: r.title,
      digest: (r.digest || clipText(r.body, DIGEST_MAX)).trim(),
    }));
  } catch {
    return [];
  }
}

const DISTILL_SYSTEM = `You extract copy fuel from source material for short-form carnivore / animal-based social scripts.
Return a compact brief (max 450 words) with these headings:
KEY CLAIMS
STORIES / MOMENTS
LANGUAGE TO STEAL
MYTHS THEY KNOCK DOWN
Use short bullets. Stay faithful to the source — do not invent facts, numbers, or stories.
Do not write scripts, hooks, or CTAs. Do not add medical disclaimers.`;

export async function distillBody(title: string, body: string): Promise<string> {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.length <= SHORT_BODY) return trimmed;

  let provider: ProviderId | null = null;
  if (await providerAvailable("deepseek")) provider = "deepseek";
  else if (await providerAvailable("grok")) provider = "grok";
  else if (await providerAvailable("venice")) provider = "venice";
  if (!provider) return clipText(trimmed, DIGEST_MAX);

  try {
    const { text } = await converse(
      provider,
      DISTILL_SYSTEM,
      `TITLE: ${title}\n\nSOURCE:\n${clipText(trimmed, DISTILL_INPUT_MAX)}`,
      { maxTokens: 1400, temperature: 0.2 },
    );
    const digest = text.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
    return clipText(digest, DIGEST_MAX) || clipText(trimmed, DIGEST_MAX);
  } catch {
    return clipText(trimmed, DIGEST_MAX);
  }
}

/**
 * Parallel chunked generation — port of v1 generate.py.
 * Fires several small calls concurrently and merges; cross-chunk near-duplicates
 * are handled by the caller's dedup pass.
 */
import { converse, type ProviderId, type Usage } from "@/lib/llm/provider";
import { genOptions } from "@/lib/config";
import { buildSystemPrompt, buildUserPrompt, parsePosts, type AvoidRef, type GeneratedPost, type OutputCfg } from "./prompts";
import type { KnowledgeCard } from "./knowledge";
import type { Persona, Format } from "@/db/schema";

export const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
export const addUsage = (a: Usage, b: Usage): void => {
  a.input_tokens += b.input_tokens;
  a.output_tokens += b.output_tokens;
  a.total_tokens += b.total_tokens;
};

export async function generatePosts(
  provider: ProviderId,
  persona: Persona,
  format: Format,
  count: number,
  avoid: Array<string | AvoidRef> = [],
  situation = "",
  outputCfg?: OutputCfg,
  knowledge: string[] = [],
  bank: KnowledgeCard[] = [],
): Promise<{ posts: GeneratedPost[]; usage: Usage }> {
  const system = buildSystemPrompt(persona, format, outputCfg, knowledge, bank);
  const user = buildUserPrompt(count, avoid, situation);
  const { maxTokens, temperature } = await genOptions();
  const { text, usage } = await converse(provider, system, user, { maxTokens, temperature });
  return { posts: parsePosts(text), usage };
}

export async function generateParallel(
  provider: ProviderId,
  persona: Persona,
  format: Format,
  count: number,
  avoid: Array<string | AvoidRef> = [],
  situation = "",
  outputCfg?: OutputCfg,
  knowledge: string[] = [],
  bank: KnowledgeCard[] = [],
): Promise<{ posts: GeneratedPost[]; usage: Usage }> {
  const { chunk } = await genOptions();
  const sizes: number[] = [];
  let remaining = Math.max(1, count);
  while (remaining > 0) {
    sizes.push(Math.min(chunk, remaining));
    remaining -= chunk;
  }

  const usage = emptyUsage();
  const results = await Promise.allSettled(
    sizes.map((s) => generatePosts(provider, persona, format, s, avoid, situation, outputCfg, knowledge, bank)),
  );
  const posts: GeneratedPost[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      posts.push(...r.value.posts);
      addUsage(usage, r.value.usage);
    }
    // one failed chunk shouldn't sink the batch
  }
  return { posts, usage };
}

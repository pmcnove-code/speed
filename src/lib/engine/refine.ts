import { converse, type ProviderId, type Usage } from "@/lib/llm/provider";
import type { Persona, Format } from "@/db/schema";
import { buildSystemPrompt, parsePosts, type GeneratedPost } from "./prompts";
import type { KnowledgeCard } from "./knowledge";

function refineUser(original: GeneratedPost, prompt: string, strict: boolean): string {
  const shape = strict
    ? `Return ONLY this JSON — a one-item array, no markdown, no prose:
[{"hook":"...","script":"...","on_screen_text":["..."],"cta":"...","video_brief":"...","angle_tag":"..."}]`
    : `Return a JSON array with exactly 1 post object. A single post object is also fine.`;
  return `Rewrite this ONE existing post using the owner's refine request.
Keep it a short-form reel script in this persona's voice.
${shape}

OWNER REFINE REQUEST:
${prompt.trim()}

CURRENT POST:
${JSON.stringify({
    hook: original.hook,
    script: original.script,
    on_screen_text: original.on_screen_text,
    cta: original.cta,
    video_brief: original.video_brief,
    angle_tag: original.angle_tag,
  })}`;
}

async function callRefine(
  provider: ProviderId,
  persona: Persona,
  format: Format,
  original: GeneratedPost,
  prompt: string,
  knowledge: string[],
  bank: KnowledgeCard[],
  strict: boolean,
): Promise<{ post: GeneratedPost; usage: Usage }> {
  const system = buildSystemPrompt(persona, format, undefined, knowledge, bank);
  const { text, usage } = await converse(provider, system, refineUser(original, prompt, strict), {
    maxTokens: 1400,
    temperature: strict ? 0.4 : 0.7,
  });
  const posts = parsePosts(text);
  if (!posts[0]) throw new Error(`refine returned no usable post: ${text.slice(0, 180)}`);
  return { post: posts[0], usage };
}

export async function refinePost(
  provider: ProviderId,
  persona: Persona,
  format: Format,
  original: GeneratedPost,
  prompt: string,
  knowledge: string[],
  bank: KnowledgeCard[] = [],
): Promise<{ post: GeneratedPost; usage: Usage }> {
  try {
    return await callRefine(provider, persona, format, original, prompt, knowledge, bank, false);
  } catch {
    return await callRefine(provider, persona, format, original, prompt, knowledge, bank, true);
  }
}

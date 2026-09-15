/**
 * Score generated copy 0–100 against the persona brief. Fail-open: if the model
 * call errors, posts are treated as passing so a scorer outage doesn't block batches.
 */
import { converse, type ProviderId, type Usage } from "@/lib/llm/provider";
import { emptyUsage } from "./generate";
import type { Persona } from "@/db/schema";
import type { GeneratedPost } from "./prompts";

export const ALIGN_THRESHOLD = 80;

const SCORE_SYSTEM = `You score short-form social copy for persona alignment.
Return ONLY a JSON array of {"i": <index>, "score": <0-100 integer>}.
Score how well the hook + script match THIS persona's identity, audience, tone, backstory, topics, and signature message.
100 = indistinguishable from this avatar. 50 = generic carnivore copy. 0 = wrong person/topic/tone.
Be strict: wrong age/gender/job, missing their core topic, or a tone that doesn't match should score below 80.`;

function extractArray(text: string): unknown[] {
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s === -1 || e === -1 || e <= s) throw new Error("scorer did not return a JSON array");
  const arr = JSON.parse(text.slice(s, e + 1));
  if (!Array.isArray(arr)) throw new Error("scorer verdicts not a list");
  return arr;
}

export async function scoreBatch(
  provider: ProviderId,
  persona: Persona,
  posts: GeneratedPost[],
): Promise<{ scores: number[]; failedOpen: boolean; usage: Usage }> {
  if (!posts.length) return { scores: [], failedOpen: false, usage: emptyUsage() };
  const items = posts.map((p, i) => ({ i, hook: p.hook, script: p.script }));
  const user = `Persona: ${persona.name}
Audience: ${persona.audience}
Tone: ${persona.tone}
Backstory: ${persona.backstory}
Angle: ${persona.angle}
Problem: ${persona.problem}
${persona.instructions ? `Instructions: ${persona.instructions}` : ""}

Score each post. Return {"i","score"} for every index.

${JSON.stringify(items)}`;
  try {
    const { text, usage } = await converse(provider, SCORE_SYSTEM, user, {
      maxTokens: 600,
      temperature: 0,
    });
    const arr = extractArray(text);
    const scores = posts.map(() => 0);
    for (const v of arr) {
      const rec = v as { i?: number; score?: number };
      if (typeof rec.i === "number" && rec.i >= 0 && rec.i < scores.length) {
        const n = Number(rec.score);
        scores[rec.i] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
      }
    }
    return { scores, failedOpen: false, usage };
  } catch {
    return { scores: posts.map(() => ALIGN_THRESHOLD), failedOpen: true, usage: emptyUsage() };
  }
}

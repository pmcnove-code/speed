/**
 * Prompt construction for the persona-driven short-form copy engine.
 */

import type { Persona, Format } from "@/db/schema";
import { knowledgeBankBlock, type KnowledgeCard } from "./knowledge";

export type OutputCfg = {
  script_length?: "short" | "medium" | "long";
  captions?: number;
  cta_style?: "follow" | "comment" | "save" | "dm" | "mix";
  include_brief?: boolean;
};

export type GeneratedPost = {
  hook: string;
  script: string;
  on_screen_text: string[];
  cta: string;
  video_brief: string;
  angle_tag: string;
};

const POST_SCHEMA: Record<string, string> = {
  hook: "1 line, <=12 words. The scroll-stopper / first spoken+on-screen line.",
  script:
    "The spoken voiceover written as SHORT PUNCHY BEATS separated by line breaks (one short spoken line per beat) — fast TikTok/Reels pace. Fragments welcome. NOT a flowing paragraph, NOT a story/memoir.",
  on_screen_text: "3-5 short on-screen captions (array of strings), punchy, no full sentences.",
  cta: "1 short call to action that fits the persona (follow / comment / save / DM).",
  video_brief: "2-4 lines telling an editor how to shoot/stitch it (b-roll ideas, pacing, tone).",
  angle_tag: "2-4 word slug naming the unique angle used, for dedup (e.g. 'morning-energy-story').",
};

const ORIGINALITY_RULES = `\
ORIGINALITY RULES (hard fail if broken — similar copy is thrown away):
- Every post must be a DISTINCT idea: different claim, different opening, different structure.
  A close paraphrase of another post is a fail, even if you swap synonyms.
- No two posts may share the same first beat, the same accusation, or the same payoff.
- Each post needs a DISTINCT closer. Do not reuse a last line, last sentence, or
  near-paraphrase closer from siblings or anything on the AVOID LIST.
- Do not reuse any sentence, punchline, or substantial phrase ANYWHERE in hook or script
  — not just the ending. A shared line in the middle is a fail. Similar wording anywhere
  (same words, same sentence, or a close cousin) is a fail.
- Do NOT reuse, restate, or lightly reword anything on the AVOID LIST (hooks OR scripts).
- Do NOT write siblings that a viewer would hear as "the same reel twice."
- Vary structure: mix story-openers, myth-flips, before/after moments, tiny how-tos,
  contrarian takes, day-in-the-life, question-hooks. Never the same template twice.
- Concrete and specific beats generic. Name a real moment, food, feeling, or time of day.`;

const CRAFT_RULES = `\
CRAFT — WRITE LIKE A REAL HUMAN WHO STOPS THE SCROLL (apply to every post):

THE HOOK (first line = the whole battle — win it in ~1.5 seconds):
- Open a curiosity gap or hit a nerve immediately. The first line should make them NEED the next one.
- Use a pattern interrupt: an unexpected admission, a contradiction, a raw confession, a
  "nobody tells you this" — NOT a summary of the topic.
- Name the exact feeling the viewer secretly carries (dismissed, exhausted, ashamed, quietly
  hopeful) so their gut says "wait… that's me."

VOICE (sound like a person, never a brand):
- Talk the way THIS persona actually talks — contractions, short punchy sentences, one real
  aside, a little imperfection. Read it in your head; if it sounds like an ad, rewrite it.
- ONE concrete moment beats any general statement: a specific time of day, a food, a place, a
  sensation, an exact thing someone said. Specific = believable = relatable.
- Micro-tension then release: build a small "and then…" and don't resolve it in sentence one.

FEEL (why they keep watching + relate):
- Emotion first, information second. Make them feel SEEN before you make a point.
- Use light open loops ("I'll tell you what changed in a sec") to hold attention to the end.
- Land on a payoff — a beat of recognition, relief, or an honest question — not a hard sell.

NEVER: hype words (game-changer, life-changing, insane, literally), generic advice, listy or
robotic phrasing, or anything that reads like marketing. Real, warm, specific, human.`;

const REEL_FORMAT = `\
FORMAT — THIS IS A SHORT-FORM VIDEO SCRIPT (TikTok / Instagram Reels). NOT a paragraph, NOT a memoir:
- Write the script as SHORT SPOKEN BEATS — ONE per line (use line breaks between them). Each beat
  is a line a creator says fast to camera, usually on its own cut.
- Punchy. Fast. Fragments are good and encouraged. NO wind-up, NO "let me tell you a story," NO
  slow biography build. Get in, hit, get out.
- Beat 1 IS the hook — front-load it. Then keep momentum: every beat hooks, turns, or pays off.
- Cut every word that isn't pulling weight. If a line doesn't earn a swipe-stop, delete it.
- Rhythm: hook → sharp setup → turn → payoff → CTA. Sound like a real creator on Reels, never an essay.
Example of the RIGHT shape (spoken beats, line-broken):
  "You're not lazy.
  You're just running on the wrong fuel.
  I ate 'healthy' for ten years and felt like garbage by 2pm.
  Switched to meat-first. Kept it stupid simple.
  Now? My afternoons don't disappear.
  Try it for one lunch. Tell me I'm wrong."`;

const INTENSITY: Record<string, string> = {
  calm: `\
VOICE INTENSITY — CALM: warm, been-there, steady. Quiet confidence over provocation.
Hooks intrigue rather than shock; the energy is a friend leveling with you.`,
  bold: `\
VOICE INTENSITY — BOLD: punchy, confident, contrarian. Take a side and don't hedge.
Spiky hooks and strong opinions welcome; swagger yes, yelling no.`,
  aggressive: `\
VOICE INTENSITY — AGGRESSIVE: provocative, polarizing, in-your-face. Hyperbolic
pattern-interrupt hooks are ENCOURAGED ("Plants can kill you." / "Your salad is not
your friend."). Hooks may hit the viewer in second person before the script pivots to
the creator's own experience. Pick fights with conventional diet wisdom, be dramatic,
never soften into corporate-safe mush.`,
};

function personaBlock(p: Persona): string {
  let block = `\
THE PERSONA YOU ARE WRITING AS:
- Name / handle: ${p.name}
- Who they're talking to: ${p.audience}
- Voice & tone: ${p.tone}
- Backstory / why they post: ${p.backstory}
- Core angle / worldview: ${p.angle}
- The one problem this page leans on: ${p.problem}`;
  if (p.instructions) block += `\n- Owner's standing instructions for this avatar (FOLLOW THEM): ${p.instructions}`;
  block += "\nStay 100% consistent with this persona in every line — vocabulary, energy, worldview.";
  return block;
}

function knowledgeBlock(notes: string[]): string {
  if (!notes.length) return "";
  return `\
LEARNED OWNER REFINES (standing knowledge — apply to EVERY post, same weight as the brief):
${notes.map((n) => `- ${n}`).join("\n")}
These came from the owner rewriting earlier copy. Follow them without being asked.`;
}

function formatBlock(f: Format): string {
  return `\
THE CONTENT FORMAT FOR THIS BATCH:
- Format name: ${f.name}
- Structure to follow: ${f.structure}
- Length / pacing: ${f.length}
- Notes: ${f.notes ?? "simple, no editing tricks; clips stitched one after another"}`;
}

const LEN: Record<string, string> = {
  short: "4-6 short beats, ~25-45 spoken words total (~10-15s)",
  medium: "6-8 short beats, ~45-70 spoken words total (~15-25s)",
  long: "8-11 short beats, ~70-100 spoken words total (~25-40s)",
};
const CTA: Record<string, string> = {
  follow: "a follow CTA",
  comment: "a comment-prompt CTA (ask viewers to comment a specific word)",
  save: "a 'save this' CTA",
  dm: "a 'DM me' CTA",
  mix: "the CTA that best fits each post (vary across the batch)",
};

function outputBlock(cfg?: OutputCfg): string {
  const length = LEN[cfg?.script_length ?? "medium"] ?? LEN.medium;
  const captions = Math.max(2, Math.min(cfg?.captions ?? 4, 6));
  const cta = CTA[cfg?.cta_style ?? "mix"] ?? CTA.mix;
  const brief =
    cfg?.include_brief === false
      ? "Set 'video_brief' to an empty string (the client skips briefs)."
      : "Include a useful 'video_brief'.";
  return `\
OUTPUT SETTINGS (follow exactly):
- Script length: ${length}.
- 'on_screen_text' must contain exactly ${captions} short captions.
- CTA: ${cta}.
- ${brief}`;
}

export function buildSystemPrompt(
  persona: Persona,
  format: Format,
  outputCfg?: OutputCfg,
  knowledge: string[] = [],
  bank: KnowledgeCard[] = [],
): string {
  const schemaLines = Object.entries(POST_SCHEMA)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
    .join("\n");
  const intensity = INTENSITY[persona.intensity] ?? INTENSITY.bold;
  const learned = knowledgeBlock(knowledge);
  const bankBlock = knowledgeBankBlock(bank);
  return `\
You are an elite short-form social copywriter for Instagram Reels / TikTok in the
animal-based / carnivore wellness niche. You write scripts a real creator films to
camera. Your job is ORIGINAL, high-quality, on-voice copy — the copy is the product.

${personaBlock(persona)}

${intensity}
${bankBlock ? `\n${bankBlock}\n` : ""}
${formatBlock(format)}

${outputBlock(outputCfg)}

${REEL_FORMAT}

${CRAFT_RULES}

${ORIGINALITY_RULES}
${learned ? `\n${learned}\n` : ""}
OUTPUT FORMAT:
Return ONLY a JSON array (no prose, no markdown fences) of post objects. Each object:
{
${schemaLines}
}
'on_screen_text' must be a JSON array of strings. Every other field is a string.
Return exactly the number of posts requested.`;
}

export type AvoidRef = { hook: string; script?: string };

const AVOID_PROMPT_LIMIT = 90;

function avoidLine(item: string | AvoidRef): string {
  if (typeof item === "string") return `- ${item}`;
  const snippet = (item.script ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  return snippet ? `- HOOK: ${item.hook} — ${snippet}` : `- HOOK: ${item.hook}`;
}

export function buildUserPrompt(count: number, avoid: Array<string | AvoidRef> = [], situation = ""): string {
  const avoidBlock = avoid.length
    ? `AVOID LIST — already-used hooks AND scripts. Do NOT repeat, rephrase, or write a close cousin of any of these:\n${avoid
        .slice(0, AVOID_PROMPT_LIMIT)
        .map(avoidLine)
        .join("\n")}`
    : "AVOID LIST: (none yet — this is a fresh page)";

  const sitBlock = situation.trim()
    ? `BASE THIS BATCH ON THIS REAL SITUATION / STORY — weave it in naturally and stay in the persona's voice; draw different angles from it, do NOT copy it verbatim:\n"${situation.trim()}"\n\n`
    : "";

  return `\
Write ${count} brand-new posts for this persona and format.
Each post must be a completely different idea, angle, opening, AND closer from the others
AND from the AVOID LIST. Close paraphrases, reused last lines, and any shared or
near-paraphrase sentence anywhere in the copy will be thrown away.

${sitBlock}${avoidBlock}

Return the JSON array of ${count} posts now.`;
}

function stripFences(rawText: string): string {
  let t = rawText.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^`+/, "").replace(/`+$/, "");
    const nl = t.indexOf("\n");
    if (nl !== -1) t = t.slice(nl + 1);
  }
  return t.trim();
}

function pick(p: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (p[k] != null && p[k] !== "") return p[k];
  }
  return undefined;
}

function normalizePost(p: Record<string, unknown>): GeneratedPost {
  let ost = pick(p, "on_screen_text", "onScreenText", "on-screen-text", "captions");
  if (typeof ost === "string") ost = ost.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(ost)) ost = [];
  return {
    hook: String(pick(p, "hook", "Hook", "HOOK") ?? ""),
    script: String(pick(p, "script", "Script", "SCRIPT") ?? ""),
    on_screen_text: (ost as unknown[]).map(String),
    cta: String(pick(p, "cta", "CTA", "Cta") ?? ""),
    video_brief: String(pick(p, "video_brief", "videoBrief", "brief") ?? ""),
    angle_tag: String(pick(p, "angle_tag", "angleTag", "angle") ?? ""),
  };
}

/** Tolerant parse: strip fences, accept a JSON array or a single post object. */
export function parsePosts(rawText: string): GeneratedPost[] {
  const t = stripFences(rawText);
  const startArr = t.indexOf("[");
  const endArr = t.lastIndexOf("]");
  const startObj = t.indexOf("{");
  const endObj = t.lastIndexOf("}");

  let parsed: unknown;
  if (startArr !== -1 && endArr > startArr && (startObj === -1 || startArr <= startObj)) {
    parsed = JSON.parse(t.slice(startArr, endArr + 1));
  } else if (startObj !== -1 && endObj > startObj) {
    parsed = [JSON.parse(t.slice(startObj, endObj + 1))];
  } else {
    throw new Error("model did not return JSON");
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && !Array.isArray(p))
    .map(normalizePost)
    .filter((p) => p.hook && p.script);
}

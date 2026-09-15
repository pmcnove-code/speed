/**
 * Near-duplicate filtering for generated reel copy.
 * Compares hook + script (+ on-screen text) and rejects even loose paraphrases,
 * reused sentences/phrases anywhere in the copy, and same/similar closers.
 */
import { distance } from "fastest-levenshtein";

export type DedupRef = {
  hook: string;
  script?: string;
  on_screen_text?: string[];
};

/** Recent DB posts the pipeline loads for uniqueness (all personas). */
export const HISTORY_WINDOW = 200;

/** Levenshtein ratio on hook or script that counts as a near-duplicate. */
export const FIELD_SIM_CUTOFF = 0.5;

/** Token Jaccard on hooks that counts as a near-duplicate. */
export const HOOK_JACCARD_CUTOFF = 0.48;

/** 3-gram overlap (overlap coefficient) on hook+script. */
export const SHINGLE_CUTOFF = 0.38;

/** A single spoken line/sentence is a reuse if Levenshtein is at least this. */
export const LINE_SIM_CUTOFF = 0.72;

/** Last-line / last-N-words closer similarity that counts as a fail. */
export const CLOSER_SIM_CUTOFF = 0.7;

const CLOSER_WORDS = 8;
const MIN_LINE_WORDS = 5;
const PHRASE_WORDS = 6;

const STOP = new Set([
  "the", "and", "you", "your", "that", "this", "with", "from", "have", "for",
  "are", "was", "were", "but", "just", "its", "can", "dont", "does", "did",
  "been", "being", "they", "them", "their", "what", "when", "how", "why",
  "who", "will", "would", "could", "should", "about", "into", "than", "then",
  "too", "very", "more", "most", "some", "any", "all", "our", "out", "get",
  "got", "now", "not",
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - distance(na, nb) / maxLen;
}

function tokens(s: string, minLen = 2): string[] {
  return normalize(s).split(" ").filter((w) => w.length >= minLen);
}

function contentTokens(s: string): string[] {
  return tokens(s, 3).filter((w) => !STOP.has(w));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function shingles(s: string, n = 3): string[] {
  const w = tokens(s, 1);
  if (w.length < n) return w.length ? [w.join(" ")] : [];
  const out: string[] = [];
  for (let i = 0; i <= w.length - n; i++) out.push(w.slice(i, i + n).join(" "));
  return out;
}

function overlapCoef(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

function spokenText(p: DedupRef): string {
  return [p.hook, p.script ?? ""].filter(Boolean).join("\n");
}

function bodyOf(p: DedupRef): string {
  const ost = Array.isArray(p.on_screen_text) ? p.on_screen_text.join(" ") : "";
  return [p.hook, p.script ?? "", ost].filter(Boolean).join("\n");
}

/** Spoken beats + sentence splits. Scripts are line-broken; last spoken line is the closer. */
function linesOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function lastWords(s: string, n = CLOSER_WORDS): string {
  return tokens(s).slice(-n).join(" ");
}

function substantial(s: string): boolean {
  return tokens(s).length >= MIN_LINE_WORDS;
}

/** Exact (normalized) or near-paraphrase match of one spoken line / sentence. */
function linesMatch(a: string, b: string): boolean {
  if (!substantial(a) || !substantial(b)) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (similarity(a, b) >= LINE_SIM_CUTOFF) return true;
  const wa = lastWords(a, 6);
  const wb = lastWords(b, 6);
  if (tokens(wa).length >= 5 && tokens(wb).length >= 5) {
    if (wa === wb || similarity(wa, wb) >= 0.82) return true;
  }
  if (jaccard(contentTokens(a), contentTokens(b)) >= 0.7) return true;
  return false;
}

function closerOf(p: DedupRef): string {
  const lines = linesOf(spokenText(p));
  for (let i = lines.length - 1; i >= 0; i--) {
    if (substantial(lines[i]) || normalize(lines[i]).length >= 16) return lines[i];
  }
  return lastWords(spokenText(p));
}

function closerCollision(a: DedupRef, b: DedupRef): boolean {
  const ca = closerOf(a);
  const cb = closerOf(b);
  if (!ca || !cb) return false;
  if (linesMatch(ca, cb)) return true;
  const wa = lastWords(ca);
  const wb = lastWords(cb);
  if (tokens(wa).length >= 5 && tokens(wb).length >= 5) {
    if (wa === wb || similarity(wa, wb) >= CLOSER_SIM_CUTOFF) return true;
  }
  return false;
}

/** Shared sentence, punchline, or 6-word phrase anywhere in hook/script/on-screen. */
function sharesLineOrPhrase(a: DedupRef, b: DedupRef): boolean {
  const linesA = linesOf(bodyOf(a)).filter(substantial);
  const linesB = linesOf(bodyOf(b)).filter(substantial);
  for (const la of linesA) {
    for (const lb of linesB) {
      if (linesMatch(la, lb)) return true;
    }
  }
  const shA = shingles(bodyOf(a), PHRASE_WORDS);
  const shB = new Set(shingles(bodyOf(b), PHRASE_WORDS));
  if (shA.length && shB.size) {
    for (const s of shA) if (shB.has(s)) return true;
  }
  return false;
}

function meaningful(s: string | undefined, min = 16): boolean {
  return normalize(s ?? "").length >= min;
}

function toRef(input: string | DedupRef): DedupRef {
  return typeof input === "string" ? { hook: input } : input;
}

/** True when two posts share a claim, opening, sentence, closer, or near-paraphrase. */
export function isNearDuplicate(a: DedupRef, b: DedupRef): boolean {
  if (closerCollision(a, b)) return true;
  if (sharesLineOrPhrase(a, b)) return true;

  if (similarity(a.hook, b.hook) >= FIELD_SIM_CUTOFF) return true;

  const hookA = tokens(a.hook);
  const hookB = tokens(b.hook);
  if (jaccard(hookA, hookB) >= HOOK_JACCARD_CUTOFF) return true;

  if (hookA.length >= 4 && hookB.length >= 4) {
    const openA = hookA.slice(0, 4).join(" ");
    const openB = hookB.slice(0, 4).join(" ");
    if (similarity(openA, openB) >= 0.8) return true;
  }

  if (meaningful(a.script) && meaningful(b.script)) {
    if (similarity(a.script ?? "", b.script ?? "") >= 0.48) return true;
    const scriptJac = jaccard(contentTokens(a.script ?? ""), contentTokens(b.script ?? ""));
    const hookJac = jaccard(contentTokens(a.hook), contentTokens(b.hook));
    if (scriptJac >= 0.45) return true;
    if (hookJac >= 0.28 && scriptJac >= 0.3) return true;
    if (overlapCoef(shingles(`${a.hook} ${a.script}`), shingles(`${b.hook} ${b.script}`)) >= SHINGLE_CUTOFF) {
      return true;
    }
  }

  const bodyA = bodyOf(a);
  const bodyB = bodyOf(b);
  if (meaningful(bodyA, 20) && meaningful(bodyB, 20) && similarity(bodyA, bodyB) >= 0.45) return true;

  return false;
}

export function dedupe<T extends DedupRef>(
  posts: T[],
  existing: Array<string | DedupRef> = [],
  enabled = true,
): { kept: T[]; rejected: T[] } {
  if (!enabled) return { kept: posts, rejected: [] };
  const kept: T[] = [];
  const rejected: T[] = [];
  const seen = existing.map(toRef);

  for (const p of posts) {
    const dup = seen.some((s) => isNearDuplicate(s, p));
    if (dup) {
      rejected.push(p);
    } else {
      kept.push(p);
      seen.push(p);
    }
  }
  return { kept, rejected };
}

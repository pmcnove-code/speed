/**
 * Verbatim copy-lock helpers.
 *
 * normalizeSpoken, canonicalSpokenSource, and validatePartition live in the
 * shared canonical module and are re-exported here for callers that imported
 * them from verbatim in the past.
 */
import {
  canonicalSpokenSource,
  normalizeSpoken as _normalize,
  validatePartition,
} from "./clip-v33";

export {
  normalizeSpoken,
  canonicalSpokenSource,
  validatePartition,
} from "./clip-v33";

export function copySpokenCorpus(opts: { hook?: string; script?: string; cta?: string }): string {
  return canonicalSpokenSource(opts);
}

export function isVerbatimFromCopy(spoken: string, corpus: string): boolean {
  const line = _normalize(spoken);
  if (!line) return true;
  return corpus.includes(line);
}

export function clipsMatchCopy(
  clips: { spoken?: string; hold?: boolean }[],
  opts: { hook?: string; script?: string; cta?: string },
): boolean {
  return validatePartition(clips, opts);
}

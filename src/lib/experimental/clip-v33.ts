/**
 * v3.3 clip contract — Next.js TypeScript entry-point.
 *
 * The canonical logic lives in the shared ESM module; this file re-exports
 * everything with full TypeScript types so the rest of the app imports from
 * here as before.
 */
export type {
  ClipDuration,
  V33Beat,
  ScriptUnitOpts,
  PartitionClip,
} from "../../../shared/flow/clip-v33.mjs";

export {
  MAX_SYLLABLES,
  CLIP_DURATIONS,
  FLOW_V33_PROMPT,
  wordsOf,
  countWordSyllables,
  countSyllables,
  pauseBufferSec,
  estimatedSpeakSec,
  clipFits,
  durationForClip,
  splitSentences,
  splitLongSentence,
  consolidateUnits,
  fixJunctionRepeats,
  normalizeSpoken,
  normalizeVerbatim,
  scriptUnits,
  breakdownScript,
  canonicalSpokenSource,
  canonicalVerbatimSource,
  validatePartition,
  buildV33Prompt,
  buildV33HoldPrompt,
} from "../../../shared/flow/clip-v33.mjs";

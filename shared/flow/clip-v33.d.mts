/**
 * TypeScript declarations for the canonical v3.3 clip contract.
 * Mirrors shared/flow/clip-v33.mjs exactly.
 */

export declare const MAX_SYLLABLES: 35;
export declare const CLIP_DURATIONS: readonly [4, 6, 8, 10];
export declare const FLOW_V33_PROMPT: string;

export type ClipDuration = 4 | 6 | 8 | 10;

export interface V33Beat {
  spoken: string;
  durationSec: ClipDuration;
  junction: boolean;
}

export interface ScriptUnitOpts {
  hook?: string;
  script?: string;
  cta?: string;
}

export interface PartitionClip {
  spoken?: string;
  hold?: boolean;
}

export declare function wordsOf(text: string): string[];
export declare function countWordSyllables(raw: string): number;
export declare function countSyllables(text: string): number;
export declare function pauseBufferSec(text: string): number;
export declare function estimatedSpeakSec(text: string): number;
export declare function clipFits(text: string): boolean;
export declare function durationForClip(text: string): ClipDuration;
export declare function splitSentences(text: string): string[];
export declare function splitLongSentence(sentence: string): string[];
export declare function consolidateUnits(units: string[]): string[];
export declare function fixJunctionRepeats(clips: string[]): string[];
export declare function normalizeSpoken(text: string): string;
export declare function normalizeVerbatim(text: string): string;
export declare function scriptUnits(opts?: ScriptUnitOpts): string[];
export declare function breakdownScript(opts?: ScriptUnitOpts): {
  beats: V33Beat[];
  junctions: string[];
};
export declare function canonicalSpokenSource(opts: ScriptUnitOpts): string;
export declare function canonicalVerbatimSource(opts: ScriptUnitOpts): string;
export declare function validatePartition(clips: PartitionClip[], opts: ScriptUnitOpts): boolean;
export declare function buildV33Prompt(spoken: string): string;
export declare function buildV33HoldPrompt(): string;

export declare function strictClipPrompt(clip: {id?:string;spoken:string;hold?:boolean;durationSec:number}): string;

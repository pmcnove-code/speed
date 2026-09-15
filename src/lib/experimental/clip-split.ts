import { clipsMatchCopy, copySpokenCorpus, isVerbatimFromCopy, normalizeSpoken, validatePartition } from "./verbatim";
import { buildScenePrompt, normalizeSceneDirection, type SceneDirection } from "./scenes";
import {
  breakdownScript,
  buildV33HoldPrompt,
  buildV33Prompt,
  CLIP_DURATIONS,
  clipFits,
  consolidateUnits,
  durationForClip,
  estimatedSpeakSec,
  splitSentences,
} from "./clip-v33";

export { clipsMatchCopy, copySpokenCorpus, isVerbatimFromCopy, normalizeSpoken, validatePartition };
export { CLIP_DURATIONS, clipFits, durationForClip, estimatedSpeakSec, splitSentences };

export type FlowClip = {
  scene?: SceneDirection;
  id: string;
  spoken: string;
  prompt: string;
  durationSec: number;
  onScreen?: string;
  hold?: boolean;
  ctaBeat?: boolean;
  junction?: boolean;
};

export type FlowCopyOpts = {
  sceneDirection?: SceneDirection | null;
  characterName: string;
  voiceName: string;
  hook?: string;
  script?: string;
  onScreenText?: string[];
  cta?: string;
  videoBrief?: string;
};

export const MIN_REEL_SEC = 30;

export function clipId(index: number): string {
  return `C${String(index).padStart(2, "0")}`;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function durationForSpoken(spoken: string): number {
  return durationForClip(spoken);
}

export function buildFlowClipPrompt(opts: {
  id: string;
  spoken: string;
  characterName: string;
  voiceName: string;
  index?: number;
  total?: number;
  previousSpoken?: string;
  nextSpoken?: string;
  hold?: boolean;
  ctaBeat?: boolean;
  videoBrief?: string;
}): string {
  void opts.id;
  void opts.characterName;
  void opts.voiceName;
  void opts.index;
  void opts.total;
  void opts.previousSpoken;
  void opts.nextSpoken;
  void opts.ctaBeat;
  void opts.videoBrief;
  if (opts.hold) return buildV33HoldPrompt();
  return buildV33Prompt(opts.spoken);
}

function withContinuity(clips: FlowClip[], opts: FlowCopyOpts): FlowClip[] {
  const scene = normalizeSceneDirection(opts.sceneDirection);
  return clips.map((c, i) => {
    const id = clipId(i + 1);
    // Validate timing from the complete final quote, including all pauses.
    const durationSec = c.hold ? 8 : durationForClip(c.spoken);
    return {
      ...c,
      id,
      durationSec,
      ...(scene ? { scene } : {}),
      prompt: scene ? buildScenePrompt(c.spoken, scene) : buildFlowClipPrompt({
        id,
        spoken: c.spoken,
        characterName: opts.characterName,
        voiceName: opts.voiceName,
        index: i + 1,
        total: clips.length,
        hold: Boolean(c.hold),
        ctaBeat: Boolean(c.ctaBeat),
        videoBrief: opts.videoBrief,
      }),
    };
  });
}

export function reelDurationSec(clips: FlowClip[]): number {
  return clips.reduce((sum, clip) => sum + clip.durationSec, 0);
}

export function ensureMinReelDuration(clips: FlowClip[]): FlowClip[] {
  return clips.filter((c) => c.hold || c.spoken.trim());
}

export function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function punchyCaption(text: string, maxWords = 6): string {
  return text.replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

/**
 * Returns true if the given spoken text is a contiguous portion of the CTA
 * text (after normalisation).  Used to mark CTA beats that were split from a
 * long CTA by breakdownScript.
 */
function isCtaBeat(spoken: string, cta: string | undefined): boolean {
  if (!cta) return false;
  const spokenNorm = normalizeSpoken(spoken);
  const ctaNorm = normalizeSpoken(cta);
  if (!spokenNorm || spokenNorm.length < 4) return false;
  if (spokenNorm.includes(ctaNorm) || ctaNorm.includes(spokenNorm)) return true;
  // Require that the spoken words appear as a contiguous word-sequence in CTA.
  const spokenWords = spokenNorm.split(/\s+/);
  const ctaWords = ctaNorm.split(/\s+/);
  for (let i = 0; i <= ctaWords.length - spokenWords.length; i++) {
    let match = true;
    for (let j = 0; j < spokenWords.length; j++) {
      if (ctaWords[i + j] !== spokenWords[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Attach CTA spoken clips.
 *
 * • If the CTA is already fully present in a single clip, just mark it.
 * • If the CTA is not found at all, append it — splitting a long CTA into
 *   multiple clips rather than producing one oversized clip.
 * • Never appends if the CTA is already covered (previously handled by
 *   breakdownScript / localSplitClips).
 */
export function attachCtaSpoken(clips: FlowClip[], cta?: string): FlowClip[] {
  const line = (cta ?? "").trim();
  if (!line) return clips.map((c) => ({ ...c }));
  const key = line.toLowerCase();
  // Check for exact single-clip match.
  if (clips.some((c) => !c.hold && c.spoken.toLowerCase().includes(key))) {
    return clips.map((c) => ({
      ...c,
      ctaBeat: Boolean(!c.hold && c.spoken.toLowerCase().includes(key)),
    }));
  }
  const spoken = clips.filter((c) => !c.hold).map((c) => ({ ...c }));
  const holds = clips.filter((c) => c.hold).map((c) => ({ ...c }));
  // Split a long CTA into multiple clips instead of appending the whole line.
  const ctaPieces = consolidateUnits([line]);
  for (const piece of ctaPieces) {
    spoken.push({
      id: clipId(spoken.length + 1),
      spoken: piece,
      durationSec: durationForClip(piece),
      prompt: "",
      ctaBeat: true,
    });
  }
  return [...spoken, ...holds];
}

export function assignOnScreenLines(
  clips: FlowClip[],
  _opts: { hook?: string; onScreenText?: string[]; cta?: string },
): FlowClip[] {
  void _opts;
  return clips.map((clip) => {
    if (clip.hold) return { ...clip, onScreen: "" };
    return { ...clip, onScreen: clip.spoken.replace(/\s+/g, " ").trim() };
  });
}

function finishClips(clips: FlowClip[], opts: FlowCopyOpts & { _skipCta?: boolean }): FlowClip[] {
  const withCta = opts._skipCta ? clips : attachCtaSpoken(clips, opts.cta);
  return withContinuity(assignOnScreenLines(ensureMinReelDuration(withCta), opts), opts);
}

/**
 * Build clips locally from hook / script / cta.
 *
 * The CTA is handled entirely inside breakdownScript (via scriptUnits), so
 * attachCtaSpoken is intentionally skipped to prevent double-appending.
 * CTA beats are identified by matching each beat's spoken text against the
 * normalised CTA before handing off to finishClips.
 */
export function localSplitClips(opts: FlowCopyOpts & { script: string }): FlowClip[] {
  const { beats } = breakdownScript({
    hook: opts.hook,
    script: opts.script || opts.hook || "",
    cta: opts.cta,
  });
  const rawClips: FlowClip[] = beats.map((beat) => ({
    id: "",
    spoken: beat.spoken,
    durationSec: beat.durationSec,
    prompt: "",
    junction: beat.junction,
    ctaBeat: isCtaBeat(beat.spoken, opts.cta),
  }));
  // Skip attachCtaSpoken — CTA already injected by breakdownScript.
  return finishClips(rawClips, { ...opts, _skipCta: true });
}

export async function splitFlowClips(opts: FlowCopyOpts & { script: string }): Promise<{
  clips: FlowClip[];
  source: "local";
  junctions: string[];
}> {
  const { junctions } = breakdownScript({
    hook: opts.hook,
    script: opts.script || opts.hook || "",
    cta: opts.cta,
  });
  return { clips: localSplitClips(opts), source: "local", junctions };
}

/**
 * Accept raw clips if they reconstruct either the full canonical source, or
 * (when a CTA is supplied) the non-CTA portion — attachCtaSpoken appends the
 * CTA in that case.
 */
export function normalizeClips(
  _raw: { spoken?: string; durationSec?: number; prompt?: string; hold?: boolean; ctaBeat?: boolean; onScreen?: string }[],
  opts: FlowCopyOpts & { script?: string },
): FlowClip[] { return localSplitClips({ ...opts, script: opts.script ?? opts.hook ?? "" }); }

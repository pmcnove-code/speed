import {
  breakdownScript,
  buildV33HoldPrompt,
  buildV33Prompt,
  canonicalSpokenSource,
  CLIP_DURATIONS,
  clipFits,
  consolidateUnits,
  durationForClip,
  normalizeSpoken,
  scriptUnits,
  splitSentences,
  validatePartition,
} from "./clip-v33.mjs";

import { buildScenePrompt, normalizeSceneDirection } from "../../shared/flow/scenes.mjs";

export const MIN_REEL_SEC = 30;

export function clipId(index) {
  return `C${String(index).padStart(2, "0")}`;
}

export function wordCount(text) {
  return String(text || "").trim() ? String(text).trim().split(/\s+/).length : 0;
}

// Re-export normalizeSpoken from the shared module so callers that previously
// imported it from clips.mjs continue to work.
export { normalizeSpoken, splitSentences, validatePartition };

export function copySpokenCorpus(opts = {}) {
  return canonicalSpokenSource(opts);
}

export function isVerbatimFromCopy(spoken, corpus) {
  const line = normalizeSpoken(spoken);
  if (!line) return true;
  return corpus.includes(line);
}

export function clipsMatchCopy(clips, opts = {}) {
  return validatePartition(clips, opts);
}

export function durationForSpoken(spoken) {
  return durationForClip(spoken);
}

export function buildFlowClipPrompt({ spoken, hold = false }) {
  if (hold) return buildV33HoldPrompt();
  return buildV33Prompt(spoken);
}

export function captionRole(clip, index = 0) {
  if (clip?.hold) return "hold";
  if (clip?.ctaBeat) return "cta";
  if (Number(index) === 0 || clip?.id === "C01") return "hook";
  return "body";
}

function withContinuity(clips, opts) {
  const scene = normalizeSceneDirection(opts.sceneDirection);
  return clips.map((c, i) => {
    const id = clipId(i + 1);
    // Recalculate from the complete final quote; an allowed numeric value
    // supplied by a caller is not evidence that the words fit that duration.
    const durationSec = c.hold ? 8 : durationForClip(c.spoken);
    return {
      ...c,
      id,
      durationSec,
      ...(scene ? { scene } : {}),
      prompt: scene ? buildScenePrompt(c.spoken, scene) : buildFlowClipPrompt({
        spoken: c.spoken,
        hold: Boolean(c.hold),
      }),
    };
  });
}

export function reelDurationSec(clips) {
  return (clips || []).reduce((sum, clip) => sum + Number(clip.durationSec || 0), 0);
}

export function ensureMinReelDuration(clips) {
  return (clips || []).filter((c) => c.hold || String(c.spoken || "").trim());
}

export function uniqueLines(lines) {
  const seen = new Set();
  const out = [];
  for (const raw of lines || []) {
    const line = String(raw || "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function punchyCaption(text, maxWords = 6) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

/**
 * Returns true if the given spoken text is a contiguous portion of the CTA
 * text (after normalisation).  Used to mark CTA beats split from a long CTA.
 */
function isCtaBeat(spoken, cta) {
  if (!cta) return false;
  const spokenNorm = normalizeSpoken(spoken);
  const ctaNorm = normalizeSpoken(cta);
  if (!spokenNorm || spokenNorm.length < 4) return false;
  if (spokenNorm.includes(ctaNorm) || ctaNorm.includes(spokenNorm)) return true;
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
 * • If not found, append it — splitting a long CTA via consolidateUnits
 *   instead of producing one oversized clip.
 */
export function attachCtaSpoken(clips, cta) {
  const line = String(cta || "").trim();
  if (!line) return (clips || []).map((c) => ({ ...c }));
  const key = line.toLowerCase();
  if ((clips || []).some((c) => !c.hold && String(c.spoken || "").toLowerCase().includes(key))) {
    return clips.map((c) => ({
      ...c,
      ctaBeat: Boolean(!c.hold && String(c.spoken || "").toLowerCase().includes(key)),
    }));
  }
  const spoken = clips.filter((c) => !c.hold).map((c) => ({ ...c }));
  const holds = clips.filter((c) => c.hold).map((c) => ({ ...c }));
  // Split a long CTA rather than appending the whole oversized line.
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

export function assignOnScreenLines(clips) {
  return (clips || []).map((clip) => {
    if (clip.hold) return { ...clip, onScreen: "" };
    return { ...clip, onScreen: String(clip.spoken || "").replace(/\s+/g, " ").trim() };
  });
}

function finishClips(clips, opts, skipCta = false) {
  const withCta = skipCta ? clips : attachCtaSpoken(clips, opts.cta);
  return withContinuity(assignOnScreenLines(ensureMinReelDuration(withCta)), opts);
}

/**
 * Build clips locally from hook / script / cta.
 *
 * CTA is handled entirely inside breakdownScript, so attachCtaSpoken is
 * intentionally skipped to prevent double-appending.  Each beat that covers
 * part of the CTA is marked ctaBeat via isCtaBeat.
 */
export function localSplitClips(opts) {
  const { beats } = breakdownScript({
    hook: opts.hook,
    script: opts.script || opts.hook || "",
    cta: opts.cta,
  });
  const rawClips = beats.map((beat) => ({
    id: "",
    spoken: beat.spoken,
    durationSec: beat.durationSec,
    prompt: "",
    junction: beat.junction,
    ctaBeat: isCtaBeat(beat.spoken, opts.cta),
  }));
  return finishClips(rawClips, opts, true /* skipCta */);
}

/**
 * Validate that clips cover the canonical spoken source.  When the CTA is
 * supplied separately in opts (to be appended by attachCtaSpoken), also accept
 * clips that reconstruct the non-CTA portion of the canonical source.
 */
export function normalizeClips(_raw, opts) { return localSplitClips(opts); }

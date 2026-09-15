import dictionary from "./data/cmu-syllables.mjs";
/**
 * v3.3 clip contract — canonical shared ESM source.
 *
 * Used by both the Next.js TypeScript app (via src/lib/experimental/clip-v33.ts)
 * and the Node ESM worker (via infra/flow-worker/clip-v33.mjs).
 * Do NOT edit the consumer wrappers; edit this file only.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SYLLABLES = 35;
export const CLIP_DURATIONS = [4, 6, 8, 10];

// Exact v3.3 prompt — byte-for-byte. Substitution point is the quoted spoken
// text at the end; that's the only thing callers replace.
export const FLOW_V33_PROMPT = `Fictional comedy sketch, educational parody. Use the attached image as the character. Use the attached voice exactly as provided — do not generate a different voice under any circumstances.

The character must look visually identical to the attached image in every detail — same face, same hair, same clothing, same accessories, same features. Do not alter, reinterpret, or reimagine any part of the character's appearance.

The background and setting must match the attached image exactly — do not change, add, or remove any element from the scene. No new objects, no new people, no scene changes.

Medium close-up framing, character centered in frame, facing directly toward camera. Static camera, fixed framing, no camera movement, no zoom, no pan, no dolly, no tilt, no rotation.

POSE CONTINUITY LOCK: The character's body pose and physical position must remain consistent with the attached reference image across EVERY clip. Preserve the exact torso angle, shoulder position, arm position, hand position, sitting position, body orientation, and overall posture. The starting pose of every clip must match the reference pose exactly, regardless of the previous clip. Do not reposition, straighten, lean, rotate, shift, or otherwise alter the character's body or limbs. Preserve the same overall body silhouette.

Natural micro-movements are allowed only to make the performance feel human: subtle head movement, eye blinks, facial expression changes, and very slight hand/arm movement are allowed ONLY when they do NOT change the character's overall base pose, body orientation, or silhouette. The character must return to and maintain the same base pose throughout the clip.

No subtitles. No text overlay. No lower thirds. No watermarks.

Absolute audio isolation — zero background sound of any kind. No music, no ambient sound, no sound effects, no environmental audio, no medical equipment sounds, no nature sounds, no crowd noise, no breathing, no body sounds, no room tone, no hum, no static. The ONLY audio in the entire clip is the character's voice.

Speak ONLY these exact words, nothing before, nothing after:`;

// ---------------------------------------------------------------------------
// Syllable counting — conservative, deterministic
// ---------------------------------------------------------------------------

/** Known-exception syllable counts (keyed on lowercase-stripped form). */
const SUB = {
  __proto__: null,
  // standard exceptions
  people: 2,
  every: 2,
  business: 2,
  wednesday: 3,
  chocolate: 3,
  family: 3,
  different: 3,
  interesting: 4,
  vegetable: 4,
  temperature: 4,
  camera: 3,
  metabolism: 5,
  fire: 1,
  hour: 1,
  our: 1,
  said: 1,
  asked: 1,
  called: 1,
  used: 1,
  named: 1,
  // contractions that the regex undercounts
  "isn't": 2,
  "didn't": 2,
  "doesn't": 2,
  "hasn't": 2,
  "haven't": 2,
  "wasn't": 2,
  "wouldn't": 2,
  "couldn't": 2,
  "shouldn't": 2,
};

const ACRONYM_SYLLABLES = {
  __proto__: null,
  AI: 2,
  AM: 2,
  CEO: 3,
  DNA: 3,
  FAQ: 3,
  FDA: 3,
  MRI: 3,
  PM: 2,
  TV: 2,
  US: 2,
};

export function wordsOf(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function countWordSyllables(raw) {
  const rawStr = String(raw || "").replace(/[‘’]/g, "'").replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9']+$/g, "");
  if (/[-–—]/.test(rawStr)) {
    return rawStr.split(/[-–—]/).reduce((sum, part) => sum + countWordSyllables(part), 0);
  }

  if (rawStr === "am") return 1;
  if (/^\d$/.test(rawStr)) return [2,1,1,1,1,1,1,2,1,1][Number(rawStr)];
  if (/^\d{2}$/.test(rawStr)) {
    const n=Number(rawStr),ones=[2,1,1,1,1,1,1,2,1,1];
    if(n<10)return ones[n];
    if(n<20)return [1,3,1,2,2,2,2,3,2,2][n-10];
    return (Math.floor(n/10)===7?3:2)+(n%10?ones[n%10]:0);
  }
  if (/[^\x00-\x7f]/u.test(String(raw).replace(/[^\p{L}]/gu,""))) return [...String(raw).replace(/[^\p{L}]/gu,"")].length;
  // Known spoken-letter acronyms. Ordinary emphasis such as BODY or YOUR
  // must still be counted as a word rather than four separate letters.
  if (ACRONYM_SYLLABLES[rawStr] !== undefined) return ACRONYM_SYLLABLES[rawStr];

  const key = rawStr.toLowerCase().replace(/[^a-z']/g, "");
  const numeric = (rawStr.match(/\d/g) || []).length * 3;
  const known = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (known !== undefined || SUB[key] !== undefined) return Math.max(known || 0, SUB[key] || 0) + numeric;
  const letters = key.replace(/'/g, "");
  if (/^[A-Z]{2,}$/.test(rawStr)) return [...rawStr].reduce((sum,c)=>sum+(c==='W'?3:1),0);
  // Unknown pronunciations: use a conservative vowel-letter bound, and flag
  // the entire clip for the guide's slower word-rate timing fallback.
  return numeric + (letters ? Math.max(1,(letters.match(/[aeiouy]/g)||[]).length) : /\p{L}/u.test(rawStr) ? [...rawStr].length : 0);

}

export function countSyllables(text) {
  return wordsOf(text).reduce((n, w) => n + countWordSyllables(w), 0);
}

// ---------------------------------------------------------------------------
// Duration / timing math
// ---------------------------------------------------------------------------

export function pauseBufferSec(text) {
  const commas = (String(text).match(/[,;]/g) || []).length;
  const stops = (String(text).match(/[.?!]/g) || []).length;
  return commas * 0.25 + stops * 0.4;
}

export function estimatedSpeakSec(text) {
  const syllableTime = countSyllables(text) / 3.5;
  // Numeric expressions have ambiguous pronunciations; apply the guide's
  // word-rate fallback whenever it requires more time than the syllable model.
  const uncertain = wordsOf(text).some(word => {
    const parts=word.replace(/[‘’]/g,"'").split(/[-–—]/);
    return parts.some(part=>{const key=part.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g,"");return /\d/.test(part)||(!Object.hasOwn(dictionary,key)&&SUB[key]===undefined&&ACRONYM_SYLLABLES[part]===undefined);});
  });
  const fallbackTime = uncertain ? wordsOf(text).length / 2 : 0;
  return Math.max(syllableTime, fallbackTime) + pauseBufferSec(text);
}

export function clipFits(text) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (!line) return false;
  return countSyllables(line) <= MAX_SYLLABLES && estimatedSpeakSec(line) <= 10;
}

/**
 * Returns the smallest allowed clip duration (4 | 6 | 8 | 10) that covers the
 * estimated speak time, using conservative boundary rounding: promote to the
 * next tier when within 0.15 s of the tier ceiling.
 */
export function durationForClip(text) {
  if (!clipFits(text)) throw new Error("Clip exceeds 35 syllables or 10 seconds, or is empty; split it before assigning a duration.");
  const est = estimatedSpeakSec(text);
  if (est <= 4) return est >= 3.85 ? 6 : 4;
  if (est <= 6) return est >= 5.85 ? 8 : 6;
  if (est <= 8) return est >= 7.85 ? 10 : 8;
  return 10;
}

// ---------------------------------------------------------------------------
// Text splitting helpers
// ---------------------------------------------------------------------------

export function splitSentences(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinParts(parts) {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pack words into clips that each satisfy clipFits. */
function packWords(line) {
  const words = wordsOf(line);
  const out = [];
  let cur = [];
  for (const word of words) {
    const next = joinParts([...cur, word]);
    if (cur.length && !clipFits(next)) {
      out.push(joinParts(cur));
      cur = [word];
    } else {
      cur.push(word);
    }
  }
  if (cur.length) out.push(joinParts(cur));
  return out.filter(Boolean);
}

export function splitLongSentence(sentence) {
  const line = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!line) return [];
  if (clipFits(line)) return [line];
  const byPause = line.split(/(?<=[,;])\s+/).map((p) => p.trim()).filter(Boolean);
  if (byPause.length > 1) return byPause.flatMap((part) => (clipFits(part) ? [part] : packWords(part)));
  return packWords(line);
}

export function consolidateUnits(units) {
  const out = [];
  let current = "";
  for (const piece of (units || []).flatMap(splitLongSentence)) {
    const next = current ? joinParts([current, piece]) : piece;
    if (current && !clipFits(next)) {
      out.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

// ---------------------------------------------------------------------------
// Junction repeat fix
// ---------------------------------------------------------------------------

function firstWord(text) {
  return (wordsOf(text)[0] || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function lastWord(text) {
  const w = wordsOf(text);
  return (w[w.length - 1] || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function dropLastWord(text) {
  const w = wordsOf(text);
  if (w.length < 2) return { rest: "", word: w[0] || "" };
  return { rest: w.slice(0, -1).join(" "), word: w[w.length - 1] || "" };
}

function dropFirstWord(text) {
  const w = wordsOf(text);
  if (w.length < 2) return { rest: "", word: w[0] || "" };
  return { rest: w.slice(1).join(" "), word: w[0] || "" };
}

/**
 * Never start a clip with the same word that ended the previous clip —
 * unless the source itself has the repeated pair, in which case move the
 * split boundary inward so both words live in one clip rather than deleting
 * either word.
 */
export function fixJunctionRepeats(clips) {
  const next = (clips || []).map((c) => c);
  for (let i = 1; i < next.length; i++) {
    if (lastWord(next[i - 1] || "") !== firstWord(next[i] || "") || !lastWord(next[i - 1] || "")) continue;
    // Try moving the repeated word to the NEXT clip (pull from prev into next).
    const earlier = dropLastWord(next[i - 1] || "");
    const movedEarlier = joinParts([earlier.word, next[i] || ""]);
    if (earlier.rest && clipFits(earlier.rest) && clipFits(movedEarlier)) {
      next[i - 1] = earlier.rest;
      next[i] = movedEarlier;
      continue;
    }
    // Try moving the repeated word to the PREV clip (push from next into prev).
    const later = dropFirstWord(next[i] || "");
    const movedLater = joinParts([next[i - 1] || "", later.word]);
    if (later.rest && clipFits(later.rest) && clipFits(movedLater)) {
      next[i - 1] = movedLater;
      next[i] = later.rest;
    }
    // If neither move fits, leave boundary as-is (never delete a word).
  }
  const result=next.filter(Boolean);
  if (!result.some((line,i)=>i>0&&lastWord(result[i-1])===firstWord(line))) return result;
  // If a one-word shift cannot fit, repartition without dropping source words.
  const words=wordsOf(result.join(" ")), best=Array(words.length+1).fill(null);
  best[words.length]=[];
  for(let start=words.length-1;start>=0;start--){
    for(let end=start+1;end<=words.length;end++){
      const text=words.slice(start,end).join(" ");if(!clipFits(text))break;
      if(end<words.length&&lastWord(text)===firstWord(words[end]))continue;
      if(best[end]&&(!best[start]||best[end].length+1<=best[start].length))best[start]=[text,...best[end]];
    }
  }
  if(!best[0])throw new Error("Cannot avoid a repeated boundary word within clip limits without changing the script.");
  return best[0];
}

// ---------------------------------------------------------------------------
// Normalisation — used for partition validation
// ---------------------------------------------------------------------------

/** Normalise spoken text for exact-reconstruction comparison. */
export function normalizeSpoken(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'"\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse separators without changing words, punctuation, or case. */
export function normalizeVerbatim(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Script unit assembly
// ---------------------------------------------------------------------------

/** Strip punctuation+case for semantic hook-dedup comparison. */
function normStrip(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Build the ordered spoken units from hook / script / cta.
 *
 * Rules:
 *   • Hook is NOT prepended when the (punctuation-stripped) script already
 *     starts with the hook's words — avoids saying the hook twice.
 *   • On-screen text is NEVER included in spoken units.
 *   • CTA is appended once, at the end, if it is not already covered.
 *   • No synthetic holds are created here.
 */
export function scriptUnits(opts = {}) {
  const hook = String(opts.hook || "").trim();
  const script = String(opts.script || "").trim() || hook;
  const sentences = splitSentences(script);
  const first = sentences[0] || "";

  const hookNorm = normStrip(hook);
  const scriptNorm = normStrip(script);

  // Deduplicate: skip prepending the hook if the script already opens with it.
  const hookDuplicate =
    !hookNorm ||
    normStrip(first) === hookNorm ||
    scriptNorm.startsWith(hookNorm + " ") ||
    scriptNorm === hookNorm;

  const units =
    hook && !hookDuplicate
      ? [hook, ...sentences]
      : sentences.length
        ? sentences
        : hook
          ? [hook]
          : [];

  const cta = String(opts.cta || "").trim();
  const assembled = normalizeSpoken(units.join(" "));
  const ctaNormalized = normalizeSpoken(cta);
  if (cta && ctaNormalized && !assembled.includes(ctaNormalized)) {
    units.push(cta);
  }
  return units;
}

// ---------------------------------------------------------------------------
// Full breakdown
// ---------------------------------------------------------------------------

export function breakdownScript(opts = {}) {
  const packed = fixJunctionRepeats(consolidateUnits(scriptUnits(opts)));
  const beats = packed.map((spoken, i) => {
    if (!clipFits(spoken)) throw new Error("A script token exceeds the 35-syllable or 10-second clip limit and cannot be split without changing the words.");
    const prev = packed[i - 1] || "";
    const junction = Boolean(prev && !/[.!?]\s*$/.test(prev) && spoken);
    return { spoken, durationSec: durationForClip(spoken), junction };
  });
  const junctions = beats
    .map((b, i) => (b.junction && i > 0 ? `C${String(i).padStart(2, "0")}→C${String(i + 1).padStart(2, "0")}` : ""))
    .filter(Boolean);
  return { beats, junctions };
}

// ---------------------------------------------------------------------------
// Partition validation
// ---------------------------------------------------------------------------

/**
 * The normalised concatenation of all spoken units derived from the opts.
 * Non-hold clips must collectively equal this string (in order) to be valid.
 */
export function canonicalSpokenSource(opts) {
  return normalizeSpoken(scriptUnits(opts).join(" "));
}

export function canonicalVerbatimSource(opts) {
  return normalizeVerbatim(scriptUnits(opts).join(" "));
}

/**
 * Returns true if and only if the non-hold clips exactly reconstruct the
 * canonical spoken source in order.  Rejects omissions, overlaps, reordering,
 * and duplicated clip content.
 */
export function validatePartition(clips, opts) {
  const source = canonicalVerbatimSource(opts);
  const spoken = (clips || [])
    .filter((c) => !c.hold)
    .map((c) => normalizeVerbatim(String(c.spoken || "")))
    .filter(Boolean)
    .join(" ");
  return spoken === source;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Build the full v3.3 prompt for a spoken clip.
 *
 * The prompt text must be FLOW_V33_PROMPT byte-for-byte, with only the quoted
 * clip text substituted at the end.  Using a greedy match in the fingerprint
 * extractor (see prompt.mjs) ensures clip text containing inner quotation
 * marks is handled without truncation.
 */
export function buildV33Prompt(spoken) {
  const line = String(spoken || "").replace(/\s+/g, " ").trim();
  return `${FLOW_V33_PROMPT} "${line}"`;
}

export function buildV33HoldPrompt() {
  return `${FLOW_V33_PROMPT}

SILENT TAKE. Lips closed. Do not speak, whisper, or mouth words. No dialogue. No new words.`;
}

/** Final paid-dispatch gate: no prompt metadata may alter this contract. */
export function strictClipPrompt(clip) {
  if (clip.hold || !clipFits(clip.spoken) || !CLIP_DURATIONS.includes(clip.durationSec) || clip.durationSec < durationForClip(clip.spoken)) {
    throw Object.assign(new Error(`Flow: ${clip.id || 'clip'} violates the v3.3 spoken-text or duration contract. Generation was not started.`), {code:'PROMPT_CONTRACT'});
  }
  return buildV33Prompt(clip.spoken);
}

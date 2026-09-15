/**
 * Flow clip-settings contract preflight.
 *
 * Validates that a Flow generation settings string (e.g. "Video · 720p · 8s
 * crop_9_16 x1") meets the v3.3 clip contract before a generation is queued.
 */
import { CLIP_DURATIONS } from "./clip-v33.mjs";

/** Allowed clip durations (seconds). */
export { CLIP_DURATIONS as FLOW_CLIP_DURATIONS };

/**
 * Assert that `duration` is an allowed v3.3 clip duration.
 * Throws a descriptive error if not.
 */
export function requireClipDuration(duration) {
  const n = Number(duration);
  if (!CLIP_DURATIONS.includes(n)) {
    throw new RangeError(`Unsupported clip duration ${n}s — allowed: ${CLIP_DURATIONS.join(", ")}s`);
  }
  return n;
}

/**
 * Inspect a Flow settings string and return evidence flags for each required
 * contract property.
 *
 * @param {string} settings  e.g. "Video · 720p · 10s crop_9_16 x1"
 * @param {number} duration  expected clip duration in seconds
 */
export function settingsEvidence(settings, duration) {
  const s = String(settings || "");
  return {
    duration: new RegExp(`\\b${Number(duration)}s\\b`).test(s),
    resolution: /\b720p\b/.test(s),
    portrait: /\bcrop_9_16\b/.test(s),
    outputs: /\bx1\b/.test(s),
  };
}

/**
 * Returns true only when the settings string satisfies ALL contract
 * requirements for the given duration.
 */
export function settingsMeetContract(settings, duration) {
  const ev = settingsEvidence(settings, duration);
  return ev.duration && ev.resolution && ev.portrait && ev.outputs;
}

const SETTINGS_PANEL_RE =
  /omni(?:\s*1(?:\.\d+)?)?\s*flash|nano banana|video ingredients|camera lock|veo 3|gemini omni|aspect ratio|video duration|output count|ingredients to video|ingredients\/references/i;

/** True when Flow's generation settings popover is actually open. */
export function settingsPanelLooksOpen(hay) {
  const s = String(hay || "");
  if (SETTINGS_PANEL_RE.test(s)) return true;
  const durationHits = new Set(
    [...s.matchAll(/\b(4|6|8|10)\s*s\b/gi)].map((match) => match[1]),
  );
  return durationHits.size >= 3 && /ingredients|720p|omni/i.test(s);
}

/**
 * Subtitle style contract shared by the app (editor UI, persistence) and the
 * flow-worker (ASS caption rendering). One normalized shape, CapCut-grade
 * control surface, expressible in libass:
 *  - font: family/size/weight/italic/uppercase/letterSpacing
 *  - fill + stroke + shadow + background box
 *  - position: vertical percent, horizontal alignment, side margins
 *  - behavior: words per line, animation (none|fade|pop|karaoke), highlight
 */

export const SUBTITLE_FONTS = [
  "Liberation Sans",
  "DejaVu Sans",
  "Liberation Serif",
  "DejaVu Serif",
  "Liberation Mono",
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const color = (value, fallback) => (HEX_RE.test(String(value || "")) ? String(value).toLowerCase() : fallback);

const pick = (value, options, fallback) => (options.includes(value) ? value : fallback);

export function defaultSubtitleStyle() {
  return {
    font: { family: "Liberation Sans", size: 54, weight: 700, italic: false, uppercase: false, letterSpacing: 0 },
    fill: { color: "#f5f5f5" },
    stroke: { color: "#000000", width: 1.5 },
    shadow: { color: "#000000", depth: 1, opacity: 0.5 },
    background: { enabled: false, color: "#000000", opacity: 0.6 },
    position: { vertical: 84, align: "center", marginH: 100 },
    behavior: { wordsPerLine: 5, animation: "fade", highlightColor: "#ffd23f" },
  };
}

/** Coerces arbitrary input into a complete, safe style. Never throws. */
export function normalizeSubtitleStyle(input) {
  const base = defaultSubtitleStyle();
  const v = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const font = v.font || {};
  const stroke = v.stroke || {};
  const shadow = v.shadow || {};
  const background = v.background || {};
  const position = v.position || {};
  const behavior = v.behavior || {};
  return {
    font: {
      family: pick(font.family, SUBTITLE_FONTS, base.font.family),
      size: Math.round(clamp(font.size, 24, 96, base.font.size)),
      weight: pick(Number(font.weight), [400, 700, 900], base.font.weight),
      italic: Boolean(font.italic),
      uppercase: Boolean(font.uppercase),
      letterSpacing: clamp(font.letterSpacing, 0, 12, base.font.letterSpacing),
    },
    fill: { color: color(v.fill?.color, base.fill.color) },
    stroke: {
      color: color(stroke.color, base.stroke.color),
      width: clamp(stroke.width, 0, 8, base.stroke.width),
    },
    shadow: {
      color: color(shadow.color, base.shadow.color),
      depth: clamp(shadow.depth, 0, 8, base.shadow.depth),
      opacity: clamp(shadow.opacity, 0, 1, base.shadow.opacity),
    },
    background: {
      enabled: Boolean(background.enabled),
      color: color(background.color, base.background.color),
      opacity: clamp(background.opacity, 0, 1, base.background.opacity),
    },
    position: {
      vertical: clamp(position.vertical, 4, 96, base.position.vertical),
      align: pick(position.align, ["left", "center", "right"], base.position.align),
      marginH: Math.round(clamp(position.marginH, 0, 320, base.position.marginH)),
    },
    behavior: {
      wordsPerLine: Math.round(clamp(behavior.wordsPerLine, 1, 8, base.behavior.wordsPerLine)),
      animation: pick(behavior.animation, ["none", "fade", "pop", "karaoke"], base.behavior.animation),
      highlightColor: color(behavior.highlightColor, base.behavior.highlightColor),
    },
  };
}

/** Named starting points mirroring the reference UI tiles. */
export function subtitleStylePresets() {
  const classic = defaultSubtitleStyle();
  return {
    classic,
    dynamic: normalizeSubtitleStyle({
      font: { family: "Liberation Sans", size: 64, weight: 900, uppercase: true, letterSpacing: 1 },
      fill: { color: "#ffd23f" },
      stroke: { color: "#000000", width: 3 },
      shadow: { depth: 2, opacity: 0.7 },
      position: { vertical: 78 },
      behavior: { wordsPerLine: 3, animation: "pop" },
    }),
    minimal: normalizeSubtitleStyle({
      font: { family: "DejaVu Sans", size: 42, weight: 400 },
      fill: { color: "#ffffff" },
      stroke: { width: 0 },
      shadow: { depth: 0, opacity: 0 },
      position: { vertical: 88 },
      behavior: { wordsPerLine: 6, animation: "fade" },
    }),
    elegant: normalizeSubtitleStyle({
      font: { family: "Liberation Serif", size: 50, weight: 700, italic: true, letterSpacing: 0.5 },
      fill: { color: "#f8f4e9" },
      stroke: { width: 0 },
      shadow: { color: "#1a1614", depth: 3, opacity: 0.8 },
      background: { enabled: true, color: "#000000", opacity: 0.35 },
      position: { vertical: 82 },
      behavior: { wordsPerLine: 4, animation: "fade" },
    }),
  };
}

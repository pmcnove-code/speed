export declare const SUBTITLE_FONTS: string[];

export type SubtitleStyleConfig = {
  font: { family: string; size: number; weight: 400 | 700 | 900; italic: boolean; uppercase: boolean; letterSpacing: number };
  fill: { color: string };
  stroke: { color: string; width: number };
  shadow: { color: string; depth: number; opacity: number };
  background: { enabled: boolean; color: string; opacity: number };
  position: { vertical: number; align: "left" | "center" | "right"; marginH: number };
  behavior: { wordsPerLine: number; animation: "none" | "fade" | "pop" | "karaoke"; highlightColor: string };
};

export declare function defaultSubtitleStyle(): SubtitleStyleConfig;
export declare function normalizeSubtitleStyle(input: unknown): SubtitleStyleConfig;
export declare function subtitleStylePresets(): Record<"classic" | "dynamic" | "minimal" | "elegant", SubtitleStyleConfig>;

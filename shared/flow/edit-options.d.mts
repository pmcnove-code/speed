import type { SubtitleStyleConfig } from "./subtitle-style.mjs";

export type EditOptions = { transition?: 'cut'|'dissolve'|'fade'; subtitles: boolean; subtitleSize: number; subtitlePosition: 'bottom'|'middle'|'top'; subtitleFade: boolean; subtitleStyle?: SubtitleStyleConfig };
export function normalizeEditOptions(value: unknown): EditOptions;

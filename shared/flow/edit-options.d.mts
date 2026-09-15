export type EditOptions = { transition?: 'cut'|'dissolve'|'fade'; subtitles: boolean; subtitleSize: number; subtitlePosition: 'bottom'|'middle'|'top'; subtitleFade: boolean };
export function normalizeEditOptions(value: unknown): EditOptions;

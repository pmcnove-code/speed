export function normalizeEditOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('options must be an object');
  const allowed = ['transition', 'subtitles', 'subtitleSize', 'subtitlePosition', 'subtitleFade'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported edit option');
  if (value.transition !== undefined && !['cut','dissolve','fade'].includes(value.transition)) throw new Error('transition must be cut, dissolve or fade');
  for (const key of ['subtitles','subtitleFade']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${key} must be true or false`);
  if (value.subtitleSize !== undefined && (!Number.isInteger(value.subtitleSize) || value.subtitleSize < 36 || value.subtitleSize > 72)) throw new Error('subtitleSize must be an integer between 36 and 72');
  if (value.subtitlePosition !== undefined && !['bottom','middle','top'].includes(value.subtitlePosition)) throw new Error('subtitlePosition must be bottom, middle or top');
  return { ...(value.transition ? {transition:value.transition} : {}), subtitles:value.subtitles ?? true, subtitleSize:value.subtitleSize ?? 54, subtitlePosition:value.subtitlePosition ?? 'bottom', subtitleFade:value.subtitleFade ?? true };
}

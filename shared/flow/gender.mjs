/** Explicit casting choice; never infer it from dialogue or a photograph. */
export function normalizeCharacterGender(value) {
  if (value == null || value === '') return null;
  if (value === 'male' || value === 'female') return value;
  throw new Error('Choose Male or Female for your video character.');
}
const fold = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function assetGender(name, profiles = [], presets = {}) {
  const key = fold(name);
  const preset = Object.entries(presets).find(([label]) => key === fold(label) || key.startsWith(fold(label)+' '));
  if (preset) return preset[1].type.toLowerCase();
  if (/\b(female|woman|women|girl|mom|mother)\b/.test(key)) return 'female';
  if (/\b(male|man|men|boy|dad|father)\b/.test(key)) return 'male';
  const profile = profiles.find(p => [p.character,p.voiceName,...p.aliases].some(alias => {
    const part = fold(alias);
    return part && (key === part || (` ${key} `).includes(` ${part} `));
  }));
  if (profile) return profile.type.toLowerCase();
  if (/\b(female|woman|women|girl|mom|mother)\b/.test(key)) return 'female';
  if (/\b(male|man|men|boy|dad|father)\b/.test(key)) return 'male';
  return null;
}
export function lockGenderProfile(profile, gender, profiles) {
  const selected = normalizeCharacterGender(gender);
  if (!selected) return profile;
  const matching = profile.type.toLowerCase() === selected ? profile :
    profiles.find(p=>p.character === (selected === 'female' ? 'Suburban Mom' : 'Doctor'));
  if (!matching) throw new Error('No matching character and voice profile is configured.');
  return {...matching, genderLock:selected};
}

export function applyGenderLock(prompt, gender) {
  const selected = normalizeCharacterGender(gender);
  if (!selected) return prompt;
  const instruction = `CASTING LOCK: The single character is an adult ${selected === 'female' ? 'woman' : 'man'}. Preserve this casting in every clip regardless of pronouns in the dialogue or scene directions.\n\n`;
  return instruction + prompt;
}

import { distance } from "fastest-levenshtein";

export type FlowVoiceType = "Male" | "Female";

export type FlowVoiceProfile = {
  character: string;
  baseVoice: string;
  type: FlowVoiceType;
  voiceName: string;
  sampleDialogue: string;
  voicePerformance: string;
  characterInfo: string;
  aliases: string[];
};

/** Google Flow custom voices from the Ceasefire Protocol editor guide. */
export const FLOW_VOICE_PROFILES: FlowVoiceProfile[] = [
  {
    character: "Doctor",
    baseVoice: "Alnilam",
    type: "Male",
    voiceName: "Doctor",
    sampleDialogue:
      "Listen to me. What I'm about to tell you could change everything. Most doctors won't say this — but I will.",
    voicePerformance:
      "A commanding surgeon's voice — firm and direct, like a man giving instructions before an operation. Mid-low pitch, clean and precise. No gravel, no roughness — just sharp, controlled authority. He clips his sentences short and lets the silence after each one do the work. Speaks the way a scalpel cuts — no wasted motion. The firmness isn't aggressive, it's earned. This is a man who's made life-and-death decisions and doesn't second-guess himself. Slightly lower volume than normal conversation, as if the room always gets quiet when he talks.",
    characterInfo:
      "A battle-hardened surgeon in his mid-40s who's spent over 20 years in the operating room. He's built like someone who lifts between shifts — broad shoulders, strong forearms, anchor tattoo on his wrist from his younger years. He sits leaning forward, hands clasped, making eye contact like he's about to deliver a diagnosis you need to hear. He doesn't do small talk. When he speaks, people stop and listen — not because he's loud, but because every word is chosen carefully. He's the doctor who stays after hours, the one nurses trust when things go sideways.",
    aliases: [
      "doctor",
      "marcus",
      "marcus-meat-first",
      "cardiologist",
      "surgeon",
      "heart",
      "avatar profile 2",
    ],
  },
  {
    character: "Farm Woman",
    baseVoice: "Sulafat",
    type: "Female",
    voiceName: "Farm Woman",
    sampleDialogue:
      "Honey, I've been eating this way since before you were born. Sixty years, no pills, no doctors. You do the math.",
    voicePerformance:
      "An elderly woman in her late 70s to early 80s with a warm, weathered Southern voice — think rural Kentucky, not Hollywood Southern. Speaks unhurried, like someone who's got nowhere to be and all the time in the world. Slight natural tremor on certain words that comes with age, but the voice is still strong and clear — not frail. A soft rasp underneath, like decades of morning air and wood smoke. She chuckles mid-sentence sometimes. Drops her g's naturally — \"raisin'\" not \"raising,\" \"eatin'\" not \"eating.\" The rhythm is storytelling — she builds to her point slowly, then lands it plain and simple. No performance, no drama. Just a woman on her porch telling you the truth because she's got no reason to lie.",
    characterInfo:
      "An 80-year-old cattle farmer from rural Kentucky who's been eating nothing but animal foods for over 60 years — long before anyone called it \"carnivore.\" She raises cattle, chickens, and pigs on her 40-acre farm and still butchers her own meat. Married, no medications, no doctors, hasn't been sick in decades. Her body looks 40 but her eyes carry 80 years of wisdom. She sits on her porch with a steel mug of coffee, talks slow, and doesn't care what anyone thinks. She doesn't preach — she just lives it.",
    aliases: ["farm woman", "farm-mabel", "mabel", "farm", "kentucky", "avatar profile 3"],
  },
  {
    character: "Parisian Woman",
    baseVoice: "Callirrhoe",
    type: "Female",
    voiceName: "Parisian Woman",
    sampleDialogue:
      "I tried every diet. Vegan, low carb, everything. Then I started eating meat again — real meat — and my body finally woke up.",
    voicePerformance:
      "An elegant woman in her late 70s who sounds younger than she looks — clear, composed, quietly commanding. Standard American English with the faintest hint of a European origin — not a French accent, just the ghost of one. The very occasional vowel held a fraction of a second longer than a native speaker would, a slightly rounder \"o\" here and there, an almost imperceptible softness on certain consonants — so subtle that most people wouldn't place it, they'd just think she sounds sophisticated. Mid pitch, warm but precise. She speaks at a calm, unhurried pace — never filling silence with filler words. Poised, clear, grounded — with just enough foreign silk in the voice to make you wonder where she's from.",
    characterInfo:
      "An 80-year-old Parisian woman who radiates quiet elegance. Silver hair, impeccable posture, bright eyes, skin that looks two decades younger than her age. She sits in her Haussmann apartment near the Eiffel Tower in a silk blouse and tailored trousers. She spent 12 years as a vegan, then 10 years low carb, before discovering carnivore 8 years ago — and it changed everything. Her thyroid problems vanished. Her skin cleared. Her energy came back. Her brain fog lifted. She now shops at the finest butcher in Paris and eats like royalty.",
    aliases: [
      "parisian woman",
      "parisian",
      "colette",
      "colette-de-paris",
      "paris",
      "french",
      "avatar profile 4",
    ],
  },
  {
    character: "Latino Dad",
    baseVoice: "Algieba",
    type: "Male",
    voiceName: "Latino Dad",
    sampleDialogue:
      "Three-twenty. That's what the scale said. My doctor told me to eat less. I said forget that, and I ate more meat. Best decision I ever made.",
    voicePerformance:
      "A stocky, warm-voiced Latino man in his late 40s. Speaks American English with a natural, subtle Mexican-American cadence — not a heavy accent, just the rhythm and warmth that comes from growing up in a bilingual household. His voice is mid-low, full-bodied, with a natural chest resonance like a bigger guy who fills a room without trying. He talks the way you'd talk to your buddy at a barbecue — direct, a little rough around the edges, real. He speeds up slightly when he gets passionate about something, then catches himself and slows back down. No polish, no filter — this is a guy who says \"bro\" and \"man\" and means every word. Never preachy, just a man telling his story because it might save yours.",
    characterInfo:
      "A 48-year-old Latino father of three from a working-class background. He was obese most of his adult life — peaked at 320 pounds. Pre-diabetic, high blood pressure, sleep apnea, joint pain. Five years ago he found carnivore and everything changed. He's now 200 pounds, muscular, trains in his garage, grills meat every day. Zero medications. His whole family followed him into keto-carnivore because diabetes runs deep in the family. He's proof that genetics is not a death sentence.",
    aliases: [
      "latino dad",
      "latino",
      "papa-diego",
      "diego",
      "papa",
      "hispanic",
      "avatar profile 5",
    ],
  },
  {
    character: "Trucker",
    baseVoice: "Schedar",
    type: "Male",
    voiceName: "Trucker",
    sampleDialogue:
      "I had two stents in my heart and a cooler full of Mountain Dew. Now the cooler's full of ribeyes. Same truck, different man.",
    voicePerformance:
      "A blue-collar Midwestern man in his late 50s. Flat, no-nonsense Ohio accent — he says \"yeah\" not \"yes,\" \"gonna\" not \"going to.\" His voice is mid-low and even-keeled, like a man who's used to talking on a CB radio and keeping it steady. There's a natural worn-in quality — not damaged, just lived-in, like a well-broken-in leather seat. He speaks in short, punchy sentences. Doesn't ramble. Gets to the point and stays there. Occasional dry humor — he'll drop something deadpan and let it sit. No emotion in the delivery until he mentions what he almost lost — then the voice drops half a register and slows way down, just for a beat, before he catches himself and keeps going. Real. Plain.",
    characterInfo:
      "A 57-year-old long-haul trucker based in Ohio who drives cross-country 300 days a year. For three decades he lived on gas station hot dogs, energy drinks, drive-thru burgers. He hit 300 pounds, got diagnosed diabetic, had acid reflux, sleep apnea, constant back pain, and two heart stents before 55. Three years ago he stumbled onto carnivore. Now he's 190 pounds, no diabetes, no apnea, no reflux, no pain. He cooks meat right in his cab with a portable grill.",
    aliases: ["trucker", "road-hank", "hank", "truck", "road", "avatar profile 6"],
  },
  {
    character: "Suburban Mom",
    baseVoice: "Aoede",
    type: "Female",
    voiceName: "Suburban Mom",
    sampleDialogue:
      "I was ninety-eight pounds. I couldn't leave my house. Four years later, no meds, no symptoms. This isn't a miracle — it's meat.",
    voicePerformance:
      "A Midwestern American woman in her early 50s with a warm, relatable suburban mom voice. She sounds like the kind of woman who'd bring you a casserole and then sit at your kitchen counter and tell you the truth about something important. Mid pitch, slightly bright — there's a natural lightness to her voice now, but you can hear that it wasn't always there. When she talks about her sick years, her pace slows and her voice tightens just slightly — not dramatic, just the body remembering. Then when she shifts to how she healed, the voice opens back up like a window being unlocked. Natural, grounded, a little emotional underneath but never breaking.",
    characterInfo:
      "A 54-year-old mother of two grown kids living in suburban Chicago. She was diagnosed with Crohn's disease at 44 and spent the next 8 years in and out of hospitals. She cycled through biologics, steroids, immunosuppressants. Nothing worked. She dropped to 98 pounds. Four years ago she tried carnivore. Within 90 days her symptoms vanished. Within a year, total remission. No medications for three years.",
    aliases: [
      "suburban mom",
      "diane-midlife-reset",
      "diane",
      "midlife",
      "rosa-gut-calm",
      "rosa",
      "suburban",
      "crohn",
      "avatar profile 7",
      "avatar profile 9",
    ],
  },
  {
    character: "Street Doctor",
    baseVoice: "Sadachbia",
    type: "Male",
    voiceName: "Street Doctor",
    sampleDialogue:
      "I spent twenty years writing prescriptions that don't fix anything. Now I tell my patients the truth. The food is the problem. And the food is the fix.",
    voicePerformance:
      "A Black American man in his early 50s from Atlanta. His voice carries the natural cadence and rhythm of the urban South — not exaggerated, just authentic. Low pitch with a warm bass resonance that fills the space around him. He speaks with the confidence of a physician and the directness of someone who grew up on those same blocks he now serves. His pace shifts — measured and clinical when explaining science, then faster and more intense when talking about his community. He hits certain words hard for emphasis, almost like a preacher landing a point — then drops to near-whisper for the gut punch. Real, raw, and completely unafraid to say what other doctors won't.",
    characterInfo:
      "A 52-year-old Black American family physician born and raised in Atlanta. Twenty years of practicing medicine in his community, watching diabetes, obesity, heart disease, and kidney failure destroy families. For years he prescribed medications that managed symptoms without fixing anything. Then he discovered keto and carnivore nutrition. Now he tells his patients what no one told them: the food is killing you, and the food can save you. He's the doctor from the block. And he's done being polite about it.",
    aliases: [
      "street doctor",
      "coach-andre",
      "andre",
      "coach",
      "street",
      "atlanta",
      "avatar profile 8",
    ],
  },
  {
    character: "Ohio Mom",
    baseVoice: "Achernar",
    type: "Female",
    voiceName: "Ohio Mom",
    sampleDialogue:
      "I spent fifteen years thinking my body was broken. Turns out it wasn't broken. It was starving for the right food.",
    voicePerformance:
      "A soft, almost intimate female voice — higher pitch but never shrill, like a woman who naturally speaks quietly because she's used to keeping things to herself. There's a delicate, slightly fragile quality — not weak, just unguarded. She sounds like someone who's finally saying out loud what she's been thinking for years. The softness isn't performance, it's just how she is — a woman who whispers even when she doesn't need to. Pace is slow and gentle, with tiny hesitations before the emotional parts. When she mentions her body failing her, the voice thins out just slightly — almost disappearing — then comes back stronger on the recovery. The kind of voice that makes you hold your breath to hear every word.",
    characterInfo:
      "A 50-year-old stay-at-home mother of four living in suburban Ohio. For over 15 years she battled PCOS — the weight, the facial hair, the irregular cycles, the infertility struggles, the crushing fatigue. Then came fatty liver disease. Doctors handed her metformin, birth control pills, and the same tired advice. Three years ago she tried carnivore. Her PCOS symptoms disappeared. Her liver enzymes normalized. She dropped 60 pounds. She's off every medication. Her energy is better now than it was at 30.",
    aliases: ["ohio mom", "ohio", "ohio-mom", "pcos"],
  },
  {
    character: "Hong Kong Woman",
    baseVoice: "Autonoe",
    type: "Female",
    voiceName: "Hong Kong Woman",
    sampleDialogue:
      "People ask me what cream I use, what doctor I see. I tell them: I just eat meat. They never believe me. But look at my face.",
    voicePerformance:
      "An elegant Asian-American woman around 60 who sounds decades younger than her age — clear, bright, and precise. She speaks fluent American English with just the faintest trace of a Hong Kong upbringing in how she clips certain consonants slightly shorter than a native speaker would — not an accent, just a subtle texture. Her voice is light and clean, almost luminous — the kind of voice that matches skin that glows. She speaks with quiet amusement, like she's used to people not believing her and she finds it a little funny. Poised, bright, radiant — her voice sounds the way her skin looks.",
    characterInfo:
      "A 60-year-old Chinese woman originally from Hong Kong, now living in San Francisco. She looks 30. Flawless skin, no wrinkles, no age spots, no Botox, no fillers. For years she suffered from severe eczema, psoriasis, and IBS. Five years ago she discovered carnivore. Her skin cleared in weeks. Her IBS vanished. Her face now looks younger than it did at 40. She stands in her luxury apartment overlooking the Bay — glowing. She doesn't need to convince you. You can see it.",
    aliases: [
      "hong kong woman",
      "hong kong",
      "mei-quiet-glow",
      "mei",
      "hongkong",
      "chinese",
      "avatar profile 10",
    ],
  },
  {
    character: "African Elder",
    baseVoice: "Charon",
    type: "Male",
    voiceName: "African Elder",
    sampleDialogue:
      "My father ate this way. His father ate this way. No one was sick. No one was weak. Then the world changed what it eats. And the world got sick.",
    voicePerformance:
      "A deep, resonant African male voice — rich bass that vibrates in the chest. He speaks English with a strong, unhurried West African accent — elongated vowels, rounded consonants, a musical rise and fall that gives every sentence the rhythm of oral storytelling. His pace is deliberately slow, almost ceremonial — like a man who has never been rushed by anything in his life. Long pauses between sentences, filled with the weight of what he's about to say next. He doesn't explain — he declares. Each statement lands like a proverb. There's no effort in his voice, no projection — it's naturally massive, the way a large drum doesn't need to be hit hard to fill a room. This is a man who speaks the way fire burns — steady, ancient, and impossible to ignore.",
    characterInfo:
      "A 61-year-old man from West Africa. Born in a village, raised on the land, now living on his own territory on the edge of the bush. No gym, no supplements, no protein shakes — just red meat, animal fat, organ meats, and whole eggs. His body at 61 is leaner and more muscular than most men half his age. His testosterone is higher than the average young American male. He eats the way his father ate, and his father before him. He is the living proof that modern nutrition got it backwards.",
    aliases: [
      "african elder",
      "elder-emeka",
      "emeka",
      "elder",
      "african",
      "avatar profile 1",
    ],
  },
];

export function normalizeVoiceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeVoiceKey(value).split(/\s+/).filter(Boolean);
}

export function resolveFlowVoice(input: {
  name?: string | null;
  handle?: string | null;
  voiceName?: string | null;
}): FlowVoiceProfile {
  const voiceName = normalizeVoiceKey(input.voiceName ?? "");
  if (voiceName) {
    const exact = FLOW_VOICE_PROFILES.find(
      (p) => normalizeVoiceKey(p.character) === voiceName || normalizeVoiceKey(p.voiceName) === voiceName,
    );
    if (exact) return exact;
  }

  const hay = [input.handle, input.name, input.voiceName].filter(Boolean).map((s) => normalizeVoiceKey(String(s)));
  for (const profile of FLOW_VOICE_PROFILES) {
    for (const alias of profile.aliases) {
      const a = normalizeVoiceKey(alias);
      if (hay.some((h) => h === a || h.includes(a) || a.includes(h))) return profile;
    }
  }

  let best: FlowVoiceProfile = FLOW_VOICE_PROFILES[0]!;
  let bestScore = Infinity;
  const blob = hay.join(" ");
  for (const profile of FLOW_VOICE_PROFILES) {
    const keys = [profile.character, profile.voiceName, ...profile.aliases].map(normalizeVoiceKey);
    for (const key of keys) {
      const d = distance(blob, key);
      const tokenHit = tokens(blob).some((t) => key.includes(t) && t.length > 3);
      const score = tokenHit ? d - 4 : d;
      if (score < bestScore) {
        bestScore = score;
        best = profile;
      }
    }
  }
  return best;
}

/** Flow stock voices: pitch 1 = lower, 5 = high. */
export const FLOW_PRESET_TRAITS: Record<string, { type: FlowVoiceType; pitch: number }> = {
  Charon: { type: "Male", pitch: 1 },
  Sadachbia: { type: "Male", pitch: 1 },
  Fenrir: { type: "Male", pitch: 1 },
  Algieba: { type: "Male", pitch: 2 },
  Schedar: { type: "Male", pitch: 2 },
  Alnilam: { type: "Male", pitch: 2 },
  Achird: { type: "Male", pitch: 2 },
  Algenib: { type: "Male", pitch: 2 },
  Puck: { type: "Male", pitch: 3 },
  Orus: { type: "Male", pitch: 3 },
  Sulafat: { type: "Female", pitch: 3 },
  Callirrhoe: { type: "Female", pitch: 3 },
  Aoede: { type: "Female", pitch: 3 },
  Kore: { type: "Female", pitch: 3 },
  Autonoe: { type: "Female", pitch: 4 },
  Leda: { type: "Female", pitch: 4 },
  Zephyr: { type: "Female", pitch: 4 },
  Achernar: { type: "Female", pitch: 5 },
};

function presetKey(name: string): string | null {
  const n = normalizeVoiceKey(name);
  if (!n) return null;
  const keys = Object.keys(FLOW_PRESET_TRAITS);
  return (
    keys.find((key) => normalizeVoiceKey(key) === n) ||
    keys.find((key) => {
      const k = normalizeVoiceKey(key);
      return n === k || n.startsWith(`${k} `) || n.includes(` ${k} `);
    }) ||
    null
  );
}

/** Rank voices that actually appear in Flow for this character profile. */
export function rankAvailableVoices(
  profile: Pick<FlowVoiceProfile, "character" | "voiceName" | "baseVoice" | "type">,
  available: string[],
): string[] {
  const wantedPitch = FLOW_PRESET_TRAITS[profile.baseVoice]?.pitch ?? (profile.type === "Female" ? 3 : 2);
  const custom = normalizeVoiceKey(profile.voiceName);
  const character = normalizeVoiceKey(profile.character);
  const base = normalizeVoiceKey(profile.baseVoice);
  const names = [...new Set(available.map((s) => s.trim()).filter(Boolean))];

  function score(name: string): number {
    const n = normalizeVoiceKey(name);
    if (!n) return 999;
    if (n === custom || n === character) return 0;
    if (custom && (n.includes(custom) || custom.includes(n))) return 1;
    if (n === base || n.startsWith(`${base} `)) return 2;
    const preset = presetKey(name);
    const trait = preset ? FLOW_PRESET_TRAITS[preset] : null;
    if (trait) {
      let s = 10 + Math.abs(trait.pitch - wantedPitch);
      if (trait.type !== profile.type) s += 25;
      return s;
    }
    if (profile.type === "Male" && /woman|mom|female|girl/i.test(name)) return 80;
    if (profile.type === "Female" && /dad|man|male|trucker|elder|doctor|boy/i.test(name)) return 80;
    return 40;
  }

  return names.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

/** Rank character assets that actually appear in this Flow library. Never invents names. */
export function rankAvailableCharacters(
  profile: Pick<FlowVoiceProfile, "character" | "voiceName" | "type" | "aliases">,
  available: string[],
): string[] {
  const wanted = normalizeVoiceKey(profile.character);
  const voice = normalizeVoiceKey(profile.voiceName);
  const aliases = [profile.character, profile.voiceName, ...profile.aliases].map(normalizeVoiceKey).filter(Boolean);
  const names = [...new Set(available.map((s) => s.trim()).filter(Boolean))];

  function score(name: string): number {
    const n = normalizeVoiceKey(name);
    if (!n) return 999;
    if (n === wanted || n === voice) return 0;
    if (aliases.some((a) => n === a || n.includes(a) || a.includes(n))) return 1;
    if (profile.type === "Male" && /woman|mom|female|girl|parisian/i.test(name)) return 80;
    if (profile.type === "Female" && /(?:\bdad\b|trucker|elder|doctor|\bboy\b)/i.test(name) && !/woman|mom/i.test(name)) {
      return 80;
    }
    return 40;
  }

  return names.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

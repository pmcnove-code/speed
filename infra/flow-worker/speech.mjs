import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STOPS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "as",
  "at",
  "be",
  "by",
  "we",
  "you",
  "i",
  "me",
  "my",
  "our",
  "your",
  "this",
  "that",
  "with",
  "um",
  "uh",
  "er",
  "ah",
  "hmm",
  "huh",
]);

const CONTRACTIONS = [
  [/\bcan't\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwasn't\b/g, "was not"],
  [/\bweren't\b/g, "were not"],
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"],
  [/\bhaven't\b/g, "have not"],
  [/\bhasn't\b/g, "has not"],
  [/\bhadn't\b/g, "had not"],
  [/\bi'm\b/g, "i am"],
  [/\byou're\b/g, "you are"],
  [/\bwe're\b/g, "we are"],
  [/\bthey're\b/g, "they are"],
  [/\bit's\b/g, "it is"],
  [/\bthat's\b/g, "that is"],
  [/\bwhat's\b/g, "what is"],
  [/\blet's\b/g, "let us"],
  [/\bi've\b/g, "i have"],
  [/\byou've\b/g, "you have"],
  [/\bwe've\b/g, "we have"],
  [/\bi'll\b/g, "i will"],
  [/\byou'll\b/g, "you will"],
  [/\bwe'll\b/g, "we will"],
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => reject(new Error(`${cmd} missing or failed: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(out || err);
      else reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-400)}`));
    });
  });
}

export function normalizeHeard(text) {
  let s = String(text || "").toLowerCase().replace(/[‘’]/g, "'");
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'"\s]/g, " ")
    .replace(/\b(\d+)\s+(am|pm)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentTokens(text) {
  return normalizeHeard(text)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPS.has(w));
}

function lcsLength(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[b.length];
}

export function speechKeysFrom(input = {}) {
  return {
    deepgramKey: String(input.deepgramKey || process.env.DEEPGRAM_API_KEY || "").trim(),
    deepgramModel: String(input.deepgramModel || process.env.DEEPGRAM_MODEL || "nova-3").trim() || "nova-3",
    geminiKey: String(input.geminiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim(),
    geminiModel: String(input.geminiModel || process.env.FLOW_BRAIN_MODEL || "gemini-2.5-flash").trim() || "gemini-2.5-flash",
  };
}

// ASR may write ordinary spoken numbers as digits. Canonicalize notation,
// never values, before the exact word comparison.
function numberWords(n) {
  const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + small[n % 10] : "");
  if (n < 1000) return small[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberWords(n % 100) : "");
  return numberWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numberWords(n % 1000) : "");
}
export function comparableSpeech(text) {
  return normalizeHeard(String(text).replace(/\b\d{1,4}(?:\.\d+)?\b/g, value => {
    const [whole, fraction] = value.split(".");
    const integer = /^0\d/.test(whole) ? [...whole].map(n => numberWords(Number(n))).join(" ") : numberWords(Number(whole));
    return integer + (fraction ? " point " + [...fraction].map(n => numberWords(Number(n))).join(" ") : "");
  })).replace(/\b(hundred|thousand) and (?=(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b)/g, '$1 ');
}

function contractionParts(word) {
 const match=word.match(/^(.+)'(s|d|ll|ve|re|m)$/);
 if(!match)return [];
 return ({s:['is','has'],d:['had','would'],ll:['will'],ve:['have'],re:['are'],m:['am']}[match[2]]||[]).map(suffix=>[match[1],suffix]);
}
function equivalentWords(a,b) {
 const memo=new Map();const clean=w=>w.replace(/["']/g,'');
 function match(i,j){
  if(i===a.length||j===b.length)return i===a.length&&j===b.length;
  const key=`${i}:${j}`;if(memo.has(key))return memo.get(key);
  let ok=clean(a[i])===clean(b[j])&&match(i+1,j+1);
  if(!ok)for(const parts of contractionParts(a[i]))if(parts.every((p,k)=>b[j+k]&&clean(b[j+k])===p)&&match(i+1,j+parts.length)){ok=true;break;}
  if(!ok)for(const parts of contractionParts(b[j]))if(parts.every((p,k)=>a[i+k]&&clean(a[i+k])===p)&&match(i+parts.length,j+1)){ok=true;break;}
  memo.set(key,ok);return ok;
 }
 return match(0,0);
}

export function speechMatchesCopy(expected, heard, { hold = false } = {}) {
  const got = comparableSpeech(heard);
  if (hold) {
    const words = got.split(" ").filter(Boolean).filter((w) => !STOPS.has(w) && w !== "empty");
    return words.length <= 2;
  }
  const want = comparableSpeech(expected);
  if (!want) return true;
  if (!got || got === "empty") return false;

  // Check every word in order. Content-only overlap used to accept changed
  // numbers, missing negations and repeated phrases in otherwise similar takes.
  const tokens = text => text.replace(/["“”]/g, "").split(" ").filter(Boolean);
  const expAll = tokens(want);
  const gotAll = tokens(got);
  return equivalentWords(expAll,gotAll);
}

export function speechMatchMetrics(expected, heard) {
  const expTok = contentTokens(expected);
  const gotTok = contentTokens(heard);
  if (!expTok.length) return { coverage: 1, extraRatio: 0 };
  const orderedHits = lcsLength(expTok, gotTok);
  return {
    coverage: orderedHits / expTok.length,
    extraRatio: (gotTok.length - orderedHits) / Math.max(gotTok.length, 1),
  };
}

export function isAmbiguousSpeechMismatch(expected, heard) {
  const { coverage, extraRatio } = speechMatchMetrics(expected, heard);
  return coverage >= 0.45 && extraRatio <= 0.6;
}

export function matchingOtherClipId(heard, currentClip, clips = []) {
  for (const candidate of clips || []) {
    if (!candidate || candidate.id === currentClip?.id || candidate.hold) continue;
    if (speechMatchesCopy(String(candidate.spoken || ""), heard)) return String(candidate.id || "");
  }
  return "";
}

/** True when the take is a line from this reel, even if clip.spoken is a stale beat. */
export function heardMatchesReelCopy(heard, corpus) {
  const got = normalizeHeard(heard);
  const want = normalizeHeard(corpus);
  if (!got || got === "empty" || !want) return false;
  if (want.includes(got) || got.includes(want.slice(0, Math.min(want.length, got.length)))) return true;
  const gotTok = contentTokens(got);
  const wantTok = contentTokens(want);
  if (gotTok.length < 5 || wantTok.length < 5) return false;
  const hits = gotTok.filter((w) => wantTok.includes(w)).length;
  return hits / gotTok.length >= 0.75;
}

function transcriptFromDeepgram(data) {
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const para = alt?.paragraphs?.transcript?.trim();
  if (para) return para;
  return String(alt?.transcript || "").trim();
}

async function transcribeDeepgram(wav, key, model, onWords) {
  const buf = await readFile(wav);
  const q = new URLSearchParams({ model, smart_format: "true", punctuate: "true", filler_words: "true" });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${q}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "audio/wav",
    },
    body: buf,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Deepgram HTTP ${res.status}: ${err.slice(0, 180)}`);
  }
  const data = await res.json();
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  onWords?.(words);
  const text = words.length ? words.map(w => w.punctuated_word || w.word).join(" ") : transcriptFromDeepgram(data);
  return text;
}

function geminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => String(p?.text || ""))
    .join(" ")
    .trim();
}

async function transcribeGemini(wav, key, model) {
  const b64 = (await readFile(wav)).toString("base64");
  const payload = {
    contents: [
      {
        parts: [
          {
            text: "Transcribe the spoken English in this clip. Return only the words you hear, no quotes or commentary. If there is no speech, return EMPTY.",
          },
          { inline_data: { mime_type: "audio/wav", data: b64 } },
        ],
      },
    ],
  };
  const tried = [];
  for (const m of [model, "gemini-2.5-flash", "gemini-2.0-flash"]) {
    if (!m || tried.includes(m)) continue;
    tried.push(m);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) continue;
    const text = geminiText(json);
    if (text) return text;
  }
  throw new Error("Gemini returned no transcript");
}

async function extractWav(src, dest) {
  await run("ffmpeg", ["-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dest]);
}

export async function transcribeTake(file, keys = {}) {
  const dir = await mkdtemp(join(tmpdir(), "flow-speech-"));
  const wav = join(dir, "take.wav");
  try {
    try {
      await extractWav(file, wav);
    } catch (err) {
      if (/does not contain any stream|does not contain.*audio|output file does not contain/i.test(String(err.message || err))) {
        return "";
      }
      throw err;
    }
    const lastErr = [];
    if (keys.deepgramKey) {
      try {
        const hash = createHash("sha256").update(await readFile(file)).digest("hex");
        return await transcribeDeepgram(wav, keys.deepgramKey, keys.deepgramModel || "nova-3", words => {
          wordTimingCache.set(hash, words);
          while (wordTimingCache.size > 256) wordTimingCache.delete(wordTimingCache.keys().next().value);
        });
      } catch (err) {
        lastErr.push(err.message || err);
      }
    }
    if (keys.geminiKey) {
      try {
        return await transcribeGemini(wav, keys.geminiKey, keys.geminiModel);
      } catch (err) {
        lastErr.push(err.message || err);
      }
    }
    throw new Error(lastErr[0] || "no speech recognizer configured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribeClipFile(file, keys = {}) {
  const body = await readFile(file);
  const hash = createHash("sha256").update(body).digest("hex");
  const cached = transcriptCache.get(hash);
  if (cached) return cached;
  const injectedTranscriber =
    typeof keys.transcribe === "function" ? keys.transcribe : null;
  if (!injectedTranscriber && !keys.deepgramKey && !keys.geminiKey) {
    throw Object.assign(new Error("Flow: cannot check speech — no Deepgram or Gemini key."), {
      code: "SPEECH",
    });
  }
  const pending = Promise.resolve(
    injectedTranscriber ? injectedTranscriber(file) : transcribeTake(file, keys),
  ).then((heard) =>
    /^empty$/i.test(String(heard || "").trim()) ? "" : heard,
  );
  transcriptCache.set(hash, pending);
  while (transcriptCache.size > 256) {
    transcriptCache.delete(transcriptCache.keys().next().value);
  }
  try {
    return await pending;
  } catch (error) {
    transcriptCache.delete(hash);
    throw error;
  }
}

const transcriptCache = new Map();
const wordTimingCache = new Map();
const secondaryTranscriptCache = new Map();

export async function captionWordsFor(file, keys = {}) {
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  if (!wordTimingCache.has(hash)) await transcribeClipFile(file, keys).catch(() => undefined);
  return wordTimingCache.get(hash) || [];
}

export function secondarySpeechModel(primary='nova-3') {
 return /^nova-2/.test(primary)?'nova-3':'nova-2';
}

async function transcribeSecondaryClipFile(file, keys = {}) {
  const verifier =
    typeof keys.verifyTranscribe === "function" ? keys.verifyTranscribe : null;
  if (!verifier && !keys.deepgramKey && !keys.geminiKey) return null;
  const body = await readFile(file);
  const hash = createHash("sha256").update(body).digest("hex");
  if (secondaryTranscriptCache.has(hash)) return secondaryTranscriptCache.get(hash);
  const pending = (async () => {
    if (verifier) return verifier(file);
    const dir = await mkdtemp(join(tmpdir(), "flow-speech-verify-"));
    const wav = join(dir, "take.wav");
    try {
      await extractWav(file, wav);
      if(keys.geminiKey){
        try{return await transcribeGemini(wav,keys.geminiKey,keys.geminiModel);}catch{/* use the configured speech provider below */}
      }
      if(keys.deepgramKey){
        return await transcribeDeepgram(wav,keys.deepgramKey,secondarySpeechModel(keys.deepgramModel),words=>{
          wordTimingCache.set(hash,words);
          while(wordTimingCache.size>256)wordTimingCache.delete(wordTimingCache.keys().next().value);
        });
      }
      return null;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })().then((heard) => (/^empty$/i.test(String(heard || "").trim()) ? "" : heard));
  secondaryTranscriptCache.set(hash, pending);
  while (secondaryTranscriptCache.size > 256) {
    secondaryTranscriptCache.delete(secondaryTranscriptCache.keys().next().value);
  }
  try {
    return await pending;
  } catch {
    secondaryTranscriptCache.delete(hash);
    return null;
  }
}

export function clearTranscriptCache() {
  transcriptCache.clear();
  wordTimingCache.clear();
  secondaryTranscriptCache.clear();
}

export async function assertSpeechMatches(file, clip, keys = {}, reference = []) {
  const hold = Boolean(clip?.hold);
  const expected = String(clip?.spoken || "").trim();
  // Speech verification is disabled in production for now: accept every rendered
  // take as-is. Only an injected transcriber (tests) still verifies.
  if (typeof keys.transcribe !== "function") {
    keys.onVerification?.("Speech verification disabled — keeping the take as rendered.");
    return expected;
  }
  let said = await transcribeClipFile(file, keys);
  if (speechMatchesCopy(expected, said, { hold })) return said;
  let matchedClipId = Array.isArray(reference)
    ? matchingOtherClipId(said, clip, reference)
    : "";
  if (!hold && !matchedClipId && isAmbiguousSpeechMismatch(expected, said)) {
    keys.onVerification?.("Checking a second transcription of the same audio — no new generation");
    const verified = await transcribeSecondaryClipFile(file, keys);
    keys.onVerification?.(verified ? "Second transcription received" : "Second transcription unavailable; keeping the first transcript for review");
    if (verified && speechMatchesCopy(expected, verified)) return verified;
    if (verified) {
      said = verified;
      matchedClipId = Array.isArray(reference)
        ? matchingOtherClipId(said, clip, reference)
        : "";
    }
  }
  const got = String(said || "").replace(/\s+/g, " ").trim().slice(0, 400) || "(silence)";
  const want = expected.replace(/\s+/g, " ").trim().slice(0, 400) || "silence";
  const matchesReel = Boolean(
    matchedClipId ||
      (!Array.isArray(reference) && reference && heardMatchesReelCopy(said, reference)),
  );
  throw Object.assign(new Error(`Flow: ${clip.id} said "${got}" — copy is "${want}"`), {
    code: "SPEECH",
    heard: said,
    wrongFile: Boolean(!hold && said && matchesReel),
    matchedClipId: matchedClipId || undefined,
  });
}

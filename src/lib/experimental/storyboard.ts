import type { ReelShot } from "@/db/schema";

export type ReelCopy = {
  hook: string;
  script: string;
  onScreenText: string[];
  cta: string;
  videoBrief: string;
};

const MIN_SHOT = 6;
const MAX_SHOT = 10;
const TARGET_WORDS = 24;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function packSentences(sentences: string[], maxWords = TARGET_WORDS): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const w = wordCount(sentence);
    if (current.length && words + w > maxWords) {
      groups.push(current.join(" "));
      current = [sentence];
      words = w;
    } else {
      current.push(sentence);
      words += w;
    }
  }
  if (current.length) groups.push(current.join(" "));
  return groups;
}

function durationFor(spoken: string): number {
  const words = wordCount(spoken);
  const sec = Math.round(words / 2.4 + 1.4);
  return Math.max(MIN_SHOT, Math.min(MAX_SHOT, sec));
}

function defaultVisual(brief: string, beat: "hook" | "body" | "cta"): string {
  const look =
    brief.trim() ||
    "UGC talking-head, natural daylight, casual clothes, eye contact with camera, handheld micro-movement, punchy Instagram reel";
  if (beat === "hook") return `${look}. Open on a tight close-up, immediate energy, no intro bumper.`;
  if (beat === "cta") return `${look}. Lean into camera, hold the last look, decisive ending.`;
  return `${look}. Cut on every spoken beat, no dead air.`;
}

/** Deterministic 1–3 shot board from hook/script/on-screen/CTA. */
export function localStoryboard(copy: ReelCopy): ReelShot[] {
  const hook = copy.hook.trim();
  const cta = copy.cta.trim();
  const lines = copy.onScreenText.map((s) => s.trim()).filter(Boolean);
  const scriptSentences = splitSentences(copy.script).filter((s) => {
    if (!hook) return true;
    return s.toLowerCase() !== hook.toLowerCase();
  });
  const packed = packSentences(scriptSentences);
  const shots: ReelShot[] = [];

  shots.push({
    index: 1,
    durationSec: durationFor(hook || packed[0] || "Watch this."),
    spoken: hook || packed.shift() || "Watch this.",
    onScreen: lines[0] || hook || "WATCH THIS",
    visual: defaultVisual(copy.videoBrief, "hook"),
  });

  const bodyGroups = packed.slice(0, 2);
  bodyGroups.forEach((spoken, i) => {
    const last = i === bodyGroups.length - 1 && !packed[2];
    shots.push({
      index: shots.length + 1,
      durationSec: durationFor(last && cta ? `${spoken} ${cta}` : spoken),
      spoken: last && cta && !spoken.toLowerCase().includes(cta.toLowerCase()) ? `${spoken} ${cta}` : spoken,
      onScreen: lines[Math.min(i + 1, lines.length - 1)] || lines[0] || spoken.split(" ").slice(0, 5).join(" ").toUpperCase(),
      visual: defaultVisual(copy.videoBrief, last ? "cta" : "body"),
    });
  });

  if (cta && shots.length === 1) {
    shots.push({
      index: 2,
      durationSec: durationFor(cta),
      spoken: cta,
      onScreen: lines[1] || cta,
      visual: defaultVisual(copy.videoBrief, "cta"),
    });
  }

  return shots.slice(0, 3).map((s, i) => ({ ...s, index: i + 1 }));
}

export function parseStoryboardJson(raw: string, fallback: ReelShot[]): ReelShot[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { shots?: unknown };
    if (!Array.isArray(parsed.shots) || !parsed.shots.length) return fallback;
    const shots: ReelShot[] = [];
    for (const item of parsed.shots.slice(0, 3)) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const spoken = String(rec.spoken ?? "").trim();
      if (!spoken) continue;
      const duration = Number(rec.durationSec ?? rec.duration_sec ?? durationFor(spoken));
      shots.push({
        index: shots.length + 1,
        durationSec: Math.max(MIN_SHOT, Math.min(MAX_SHOT, Number.isFinite(duration) ? duration : durationFor(spoken))),
        spoken,
        onScreen: String(rec.onScreen ?? rec.on_screen ?? "").trim() || spoken.split(" ").slice(0, 6).join(" "),
        visual: String(rec.visual ?? "").trim() || defaultVisual("", shots.length ? "body" : "hook"),
      });
    }
    return shots.length ? shots : fallback;
  } catch {
    return fallback;
  }
}

export function srtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const milli = clamped % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

export function shotsToSrt(shots: ReelShot[]): string {
  let t = 0;
  return shots
    .map((shot, i) => {
      const start = t;
      const end = t + shot.durationSec * 1000;
      t = end;
      const text = (shot.onScreen || shot.spoken).replace(/\s+/g, " ").trim();
      return `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}\n`;
    })
    .join("\n");
}

/**
 * Turn a YouTube URL into a transcript: captions when available, else
 * yt-dlp audio + Deepgram. Used by Knowledge → Add YouTube.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSetting } from "@/lib/config";
import {
  canonicalYouTubeUrl,
  parseYouTubeId,
  transcriptFromCaptionJson3,
  transcriptFromDeepgram,
  transcriptFromRelayPayload,
  transcriptFromVtt,
} from "@/lib/youtube";

const DEEPGRAM_CHUNK_SECS = 480;
const MAX_VIDEO_SECS = 3 * 60 * 60;
const KEYTERMS = ["carnivore", "keto", "seed oils", "testosterone", "ribeye", "tallow", "oxalates", "ruminant"];

export type TranscribeResult = {
  title: string;
  url: string;
  transcript: string;
  via: "captions" | "deepgram";
};

function run(bin: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out`));
    }, opts.timeoutMs ?? 180_000);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} failed (${code}): ${(stderr || stdout).slice(-500)}`));
    });
  });
}

async function oembedTitle(url: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { title?: string };
    return typeof data.title === "string" ? data.title.trim() : "";
  } catch {
    return "";
  }
}

async function innertubeCaptions(videoId: string): Promise<string> {
  const clients = [
    {
      headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/19.09.37" },
      client: { clientName: "ANDROID", clientVersion: "19.09.37" },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20241201.00.00", hl: "en", gl: "US" },
    },
  ];
  for (const c of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: c.headers,
        body: JSON.stringify({
          context: { client: c.client },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{ baseUrl?: string; languageCode?: string; kind?: string }>;
          };
        };
      };
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (!tracks.length) continue;
      const preferred =
        tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ||
        tracks.find((t) => t.languageCode?.startsWith("en")) ||
        tracks[0];
      if (!preferred?.baseUrl) continue;
      const cap = await fetch(`${preferred.baseUrl}&fmt=json3`, { signal: AbortSignal.timeout(20_000) });
      if (!cap.ok) continue;
      const text = transcriptFromCaptionJson3(await cap.json());
      if (text.length > 80) return text;
    } catch {
      /* next client */
    }
  }
  return "";
}

/** Caption relays that fetch timedtext from a non-datacenter IP. VPS YouTube is bot-blocked. */
async function relayCaptions(videoId: string): Promise<string> {
  const attempts: Array<{ url: string; body: Record<string, string>; origin: string }> = [
    { url: "https://kome.ai/api/transcript", body: { video_id: videoId, lang: "en" }, origin: "https://kome.ai" },
    { url: "https://kome.ai/api/transcript", body: { url: canonicalYouTubeUrl(videoId) }, origin: "https://kome.ai" },
  ];
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
          Origin: a.origin,
          Referer: `${a.origin}/`,
        },
        body: JSON.stringify(a.body),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) continue;
      const text = transcriptFromRelayPayload(await res.json());
      if (text.length > 80) return text;
    } catch {
      /* next relay */
    }
  }
  return "";
}

function friendlyYoutubeError(msg: string): Error {
  if (/not a bot|LOGIN_REQUIRED|Sign in to confirm/i.test(msg)) {
    return new Error(
      "YouTube blocked this server from downloading that video. If it has no captions, paste the transcript as notes instead.",
    );
  }
  if (/timed out/i.test(msg)) {
    return new Error("YouTube took too long. Try again, or paste the transcript as notes.");
  }
  return new Error(msg);
}

async function ytdlpCaptions(url: string, dir: string): Promise<string> {
  try {
    await run(
      "yt-dlp",
      [
        "--no-playlist",
        "--skip-download",
        "--write-sub",
        "--write-auto-sub",
        "--sub-langs",
        "en.*,en",
        "--sub-format",
        "vtt",
        "--no-warnings",
        "-o",
        join(dir, "subs"),
        url,
      ],
      { timeoutMs: 90_000 },
    );
  } catch {
    return "";
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith(".vtt"));
  if (!files.length) return "";
  const vtt = await readFile(join(dir, files[0]!), "utf8");
  return transcriptFromVtt(vtt);
}

function deepgramListenUrl(model: string): string {
  const q = new URLSearchParams({
    model,
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
  });
  for (const k of KEYTERMS) q.append("keyterm", k);
  return `https://api.deepgram.com/v1/listen?${q.toString()}`;
}

async function deepgramFile(apiKey: string, model: string, filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const res = await fetch(deepgramListenUrl(model), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: buf,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Deepgram HTTP ${res.status}: ${err.slice(0, 240)}`);
  }
  const text = transcriptFromDeepgram(await res.json());
  if (!text) throw new Error("Deepgram returned an empty transcript");
  return text;
}

async function transcribeAudio(apiKey: string, model: string, audioPath: string, durationSec: number, dir: string): Promise<string> {
  if (!durationSec || durationSec <= DEEPGRAM_CHUNK_SECS + 30) {
    return deepgramFile(apiKey, model, audioPath);
  }
  const chunkPattern = join(dir, "chunk_%03d.m4a");
  try {
    await run(
      "ffmpeg",
      ["-y", "-i", audioPath, "-f", "segment", "-segment_time", String(DEEPGRAM_CHUNK_SECS), "-c", "copy", chunkPattern],
      { timeoutMs: 120_000 },
    );
  } catch {
    return deepgramFile(apiKey, model, audioPath);
  }
  const chunks = (await readdir(dir)).filter((f) => /^chunk_\d+\.m4a$/.test(f)).sort();
  if (!chunks.length) return deepgramFile(apiKey, model, audioPath);
  const parts: string[] = [];
  for (const f of chunks) {
    parts.push(await deepgramFile(apiKey, model, join(dir, f)));
  }
  return parts.filter(Boolean).join("\n\n");
}

export async function transcribeYouTube(rawUrl: string): Promise<TranscribeResult> {
  const id = parseYouTubeId(rawUrl);
  if (!id) throw new Error("That doesn’t look like a YouTube link.");
  const url = canonicalYouTubeUrl(id);

  const title = (await oembedTitle(url)) || `YouTube ${id}`;

  const captions =
    (await innertubeCaptions(id).catch(() => "")) || (await relayCaptions(id).catch(() => ""));
  if (captions.length > 80) return { title, url, transcript: captions, via: "captions" };

  const apiKey = await getSetting("DEEPGRAM_API_KEY");
  const model = (await getSetting("DEEPGRAM_MODEL")) || "nova-3";

  const dir = await mkdtemp(join(tmpdir(), "kb-yt-"));
  try {
    const ytdlpSubs = await ytdlpCaptions(url, dir);
    if (ytdlpSubs.length > 80) return { title, url, transcript: ytdlpSubs, via: "captions" };

    if (!apiKey) {
      throw new Error("No captions on this video, and Deepgram isn’t configured. Add the Deepgram key in Settings.");
    }

    let duration = 0;
    try {
      const { stdout } = await run("yt-dlp", ["--no-playlist", "--print", "duration", "--no-warnings", url], { timeoutMs: 60_000 });
      duration = Number(stdout.trim());
    } catch {
      duration = 0;
    }
    if (Number.isFinite(duration) && duration > MAX_VIDEO_SECS) {
      throw new Error("Video is longer than 3 hours — paste a transcript instead.");
    }

    await run(
      "yt-dlp",
      [
        "--no-playlist",
        "--no-warnings",
        "-f",
        "bestaudio[ext=m4a]/bestaudio/best",
        "--max-filesize",
        "250M",
        "-o",
        join(dir, "audio.%(ext)s"),
        url,
      ],
      { timeoutMs: 240_000 },
    );
    const files = await readdir(dir);
    const audio = files.find((f) => f.startsWith("audio."));
    if (!audio) throw new Error("Couldn’t download audio from YouTube.");
    const audioPath = join(dir, audio);
    const st = await stat(audioPath);
    if (st.size < 1000) throw new Error("Downloaded audio was empty.");

    const transcript = await transcribeAudio(apiKey, model, audioPath, duration, dir);
    if (transcript.length < 40) throw new Error("Transcript came back empty. Try another video, or paste the text.");
    return { title, url, transcript, via: "deepgram" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT|not found/i.test(msg)) {
      throw new Error("Server is missing yt-dlp/ffmpeg. Redeploy the app image, or paste the transcript instead.");
    }
    throw friendlyYoutubeError(msg);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

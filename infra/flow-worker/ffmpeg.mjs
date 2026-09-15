import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { normalizeEditOptions } from "../../shared/flow/edit-options.mjs";
import { createHash } from "node:crypto";
import { clipEditPlan } from "./clip-edit.mjs";
import { compileClipEdit, compileEditingTimeline } from "./capcut.mjs";
import { captionPhrases, subtitleText } from "./captions.mjs";

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, timeout: 20 * 60 * 1000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });
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
      else reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-800)}`));
    });
  });
}

function wrapWords(text, maxWords = 4, maxLines = 2) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  for (let i = 0; i < words.length && lines.length < maxLines; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(" "));
  }
  return lines;
}

function cueText(cue) {
  if (cue && typeof cue === "object") return String(cue.text || "").trim();
  return String(cue || "").trim();
}

function cueRole(cue, index) {
  if (cue && typeof cue === "object" && cue.role) return String(cue.role);
  return index === 0 ? "hook" : "body";
}

function assStyle(role) {
  if (role === "cta" || role === "hold") return "Cta";
  if (role === "hook") return "Hook";
  return "Body";
}

function escapeAss(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

export function srtTimestamp(ms) {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const milli = clamped % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

export function assTimestamp(ms) {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function buildCaptionSrt(cues) {
  let t = 0;
  let n = 0;
  const parts = [];
  for (const cue of cues || []) {
    const start = t;
    const dur = Math.max(400, Number(cue?.durationMs) || 8000);
    t += dur;
    const text = wrapWords(subtitleText(cueText(cue)), 5, 4).join("\n").trim();
    if (!text) continue;
    n += 1;
    parts.push(`${n}\n${srtTimestamp(start)} --> ${srtTimestamp(t)}\n${text}\n`);
  }
  return parts.join("\n");
}

export function buildCaptionAss(cues) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Liberation Sans,54,&H00F5F5F5,&H000000FF,&H30000000,&H80000000,0,0,0,0,100,100,0,0,1,1.5,1,2,100,100,300,1
Style: Body,Liberation Sans,54,&H00F5F5F5,&H000000FF,&H30000000,&H80000000,0,0,0,0,100,100,0,0,1,1.5,1,2,100,100,300,1
Style: Cta,Liberation Sans,54,&H00F5F5F5,&H000000FF,&H30000000,&H80000000,0,0,0,0,100,100,0,0,1,1.5,1,2,100,100,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  let t = 0;
  const events = [];
  (cues || []).forEach((cue, i) => {
    const start = t;
    const dur = Math.max(400, Number(cue?.durationMs) || 8000);
    t += dur;
    const style = assStyle(cueRole(cue, i));
    const fade = "{\\fad(60,90)}";
    for (const phrase of captionPhrases(cueText(cue), cue?.words || [], dur)) {
      const text = subtitleText(phrase.text);
      if (!text) continue;
      events.push(
        `Dialogue: 0,${assTimestamp(start + phrase.startMs)},${assTimestamp(start + phrase.endMs)},${style},,0,0,0,,${fade}${escapeAss(text)}`,
      );
    }
  });
  return header + events.join("\n") + (events.length ? "\n" : "");
}

const GRADE = "eq=contrast=1.07:saturation=1.1:gamma=0.98:brightness=0.012,unsharp=5:5:0.32:5:5:0.0";
const CAPTION_STYLE =
  "Fontname=DejaVu Sans,Fontsize=54,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=5,Shadow=0,Alignment=2,MarginV=520";

async function finishReel(input, output, cwd, { assPath, srtPath } = {}) {
  const vf = assPath
    ? `${GRADE},subtitles=${assPath}`
    : srtPath
      ? `${GRADE},subtitles=${srtPath}:force_style='${CAPTION_STYLE}'`
      : GRADE;
  await run(
    "ffmpeg",
    [
      "-y",
      "-i",
      input,
      "-vf",
      vf,
      "-af",
      "loudnorm=I=-12:TP=-1.5:LRA=9",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      output,
    ],
    cwd,
  );
}

export function transitionFilter(durations, audioPresent = durations.map(() => true), transitions = []) {
  const types = durations.map((_, i) => transitions[i] || "dissolve");
  if (types.some(type => !["dissolve", "cut", "fade"].includes(type))) throw new Error("Unsupported scene transition");
  const lengths = types.map((type, i) => i === 0 || type === "cut" ? 0 : type === "fade" ? 8 / 24 : 4 / 24);
  const filters = [];
  durations.forEach((ms, i) => {
    const seconds = ms / 1000;
    // Padding supplies the dissolve handles without overlapping spoken audio
    // or shortening any clip. The original boundary stays on the same frame.
    filters.push(`[${i}:v]fps=24,settb=AVTB,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,trim=duration=${seconds},tpad=start_mode=clone:start_duration=${lengths[i] / 2}:stop_mode=clone:stop_duration=${(lengths[i + 1] || 0) / 2}[v${i}]`);
    const source = audioPresent[i] ? `[${i}:a]aresample=48000` : "anullsrc=r=48000:cl=stereo";
    const fadeIn = i ? ",afade=t=in:d=0.008" : "";
    const fadeOut = i < durations.length - 1 ? `,afade=t=out:st=${Math.max(0, seconds - 0.008)}:d=0.008` : "";
    filters.push(`${source},apad,atrim=duration=${seconds},asetpts=PTS-STARTPTS${fadeIn}${fadeOut}[a${i}]`);
  });
  let boundary = durations[0] / 1000;
  let previous = "v0";
  for (let i = 1; i < durations.length; i++) {
    const next = i === durations.length - 1 ? "video" : `blend${i}`;
    filters.push(types[i] === "cut"
      ? `[${previous}][v${i}]concat=n=2:v=1:a=0[${next}]`
      : `[${previous}][v${i}]xfade=transition=${types[i] === "fade" ? "fadeblack" : "fade"}:duration=${lengths[i]}:offset=${boundary - lengths[i] / 2}[${next}]`);
    boundary += durations[i] / 1000;
    previous = next;
  }
  filters.push(`${durations.map((_, i) => `[a${i}]`).join("")}concat=n=${durations.length}:v=0:a=1[audio]`);
  return filters.join(";");
}

export async function prepareClipEdits(paths, outputDir, captions = [], onProgress) {
  const editedPaths=[], editedCaptions=[];
  for(let i=0;i<paths.length;i++) {
    const plan=clipEditPlan(await probeDurationMs(paths[i]),captions[i]);
    const sourceHash=createHash("sha256").update(await readFile(paths[i])).digest("hex");
    const key=createHash("sha256").update(JSON.stringify({sourceHash,start:plan.sourceStartMs,duration:plan.durationMs,version:1})).digest("hex");
    const dir=join(outputDir,"clip-edits",key), out=join(dir,"clip.mp4"), record=join(dir,"complete.json");
    await mkdir(dir,{recursive:true});
    onProgress?.(`Flow: [clip-edit] C${String(i+1).padStart(2,"0")}/${paths.length} editing source clip with CapCut`);
    let reusable=false;
    try {
      const cached=JSON.parse(await readFile(record,"utf8"));
      reusable=cached.key===key && cached.outputHash===createHash("sha256").update(await readFile(out)).digest("hex") && (await isPlayableTake(out,{minMs:plan.durationMs-100})).ok;
    } catch { /* A missing or incomplete edit must be rendered before assembly. */ }
    if(!reusable) {
      const draft=await compileClipEdit(paths[i],plan,out);
      const temp=join(dir,"rendering.mp4");
      await run("ffmpeg",["-y","-i",draft.path,"-ss",String(draft.sourceStartMs/1000),"-t",String(draft.durationMs/1000),
        "-vf","scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24",
        "-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-ac","2","-b:a","160k","-movflags","+faststart",temp]);
      const take=await isPlayableTake(temp,{minMs:plan.durationMs-100});
      if(!take.ok || Math.abs(take.ms-plan.durationMs)>100) throw new Error(`CapCut clip ${i+1} edit did not preserve the selected duration`);
      await rename(temp,out);
      const outputHash=createHash("sha256").update(await readFile(out)).digest("hex");
      await writeFile(record+".tmp",JSON.stringify({key,sourceHash,outputHash,project:draft.project,sourceStartMs:plan.sourceStartMs,durationMs:take.ms}));
      await rename(record+".tmp",record);
    }
    editedPaths.push(out);editedCaptions.push(plan.caption);
    onProgress?.(`Flow: [clip-edit] C${String(i+1).padStart(2,"0")}/${paths.length} ${reusable ? "reused verified edit" : "clip edited"} — ${plan.trimmedMs>0 ? `${plan.trimmedMs}ms outer padding removed` : "full speech preserved"}`);
  }
  return {paths:editedPaths,captions:editedCaptions};
}

export async function concatClips(clipPaths, destPath, captions = [], editOptions = {}, onProgress) {
  try { return await assembleEditedClips(clipPaths,destPath,captions,editOptions,onProgress); }
  catch(error) {
    // Generation has already completed. An editing failure must never rotate
    // accounts and purchase another set of clips.
    error.code="CLIP_EDIT";
    error.dispatched=true;
    throw error;
  }
}

async function assembleEditedClips(clipPaths, destPath, captions = [], editOptions = {}, onProgress) {
  if (!clipPaths.length) throw new Error("No clips to stitch.");
  const options = normalizeEditOptions(editOptions);
  await writeFile(join(dirname(destPath), "edit-source.json"), JSON.stringify({ paths: clipPaths, captions }));
  const prepared = await prepareClipEdits(clipPaths, dirname(destPath), captions, onProgress);
  clipPaths = prepared.paths; captions = prepared.captions;
  onProgress?.("Flow: [stitch] All clips edited — assembling transitions and subtitles");
  const sourceDurations = await Promise.all(clipPaths.map(probeDurationMs));
  const timeline = await compileEditingTimeline(clipPaths, sourceDurations, captions, destPath, options);
  clipPaths = timeline.clips.map(clip => clip.path);
  const dir = await mkdtemp(join(tmpdir(), "flow-concat-"));
  try {
  const normalized = [];
  const durations = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const take = await isPlayableTake(clipPaths[i]);
    if (!take.ok) throw new Error(`clip ${i + 1} ${take.reason}`);
    const norm = join(dir, `n-${i}.mp4`);
    await run("ffmpeg", ["-y","-i",clipPaths[i],"-c","copy",norm]);
    normalized.push(norm);
    const ms = await probeDurationMs(norm);
    if (!ms || ms < MIN_CLIP_MS) throw new Error(`normalized clip ${i + 1} too short (${ms || 0}ms)`);
    if (Math.abs(ms - timeline.clips[i].durationMs) > 100) throw new Error(`Normalization changed clip ${i + 1} duration`);
    durations.push(timeline.clips[i].durationMs);
  }

  const concatOut = join(dir, "concat.mp4");
  if (normalized.length === 1) {
    await run("ffmpeg", ["-y", "-i", normalized[0], "-c", "copy", concatOut]);
  } else {
    const audioPresent = await Promise.all(normalized.map(async file =>
      Boolean(String(await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", file])).trim()),
    ));
    await run("ffmpeg", [
      "-y",
      ...normalized.flatMap(file => ["-i", file]),
      "-filter_complex_threads", "1",
      "-filter_complex", transitionFilter(durations, audioPresent, timeline.clips.map(clip => clip.transition)),
      "-map", "[video]", "-map", "[audio]",
      "-t", String(durations.reduce((sum, ms) => sum + ms, 0) / 1000),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      concatOut,
    ]);
  }

  const captionCues = normalized.map((_, i) => {
    const raw = captions[i];
    return {
      text: cueText(raw),
      role: cueRole(raw, i),
      durationMs: durations[i],
      words: raw?.words || [],
    };
  });
  const header = buildCaptionAss([]).replaceAll("Sans,54,", `Sans,${options.subtitleSize},`).replaceAll(",2,100,100,300,1", `,${options.subtitlePosition === "top" ? 8 : options.subtitlePosition === "middle" ? 5 : 2},100,100,300,1`);
  const fade = options.subtitleFade ? "{\\fad(60,90)}" : "";
  const assBody = header + timeline.subtitles.map(cue =>
    `Dialogue: 0,${assTimestamp(cue.startMs)},${assTimestamp(cue.endMs)},Body,,0,0,0,,${fade}${escapeAss(cue.text)}`
  ).join("\n") + "\n";
  const srtBody = options.subtitles ? buildCaptionSrt(captionCues) : "";
  try {
    if (assBody.includes("Dialogue:")) {
      const assPath = join(dir, "captions.ass");
      await writeFile(assPath, assBody, "utf8");
      await finishReel("concat.mp4", destPath, dir, { assPath: "captions.ass" });
    } else if (srtBody) {
      const srtPath = join(dir, "captions.srt");
      await writeFile(srtPath, srtBody, "utf8");
      await finishReel("concat.mp4", destPath, dir, { srtPath: "captions.srt" });
    } else {
      await finishReel("concat.mp4", destPath, dir, {});
    }
  } catch (error) {
    throw new Error(`Final subtitle/audio export failed: ${error.message}`);
  }
  // The script determines reel length. Check for lost footage against the
  // normalized sources, allowing a small mux/encoder rounding tolerance.
  const expectedMs = durations.reduce((sum, ms) => sum + ms, 0);
  const reel = await isPlayableTake(destPath, { minMs: Math.max(MIN_CLIP_MS, expectedMs - 500) });
  if (!reel.ok) throw new Error(`stitched reel ${reel.reason}`);
  return destPath;
  } finally { await rm(dir, {recursive:true,force:true}); }
}

export const MIN_CLIP_MS = 3000;
/** Skip empty network bodies. Finished Flow takes can be ~70KB. */
export const MIN_CLIP_BYTES = 4_096;

export async function isPlayableTake(file, { minMs = MIN_CLIP_MS } = {}) {
  const st = await stat(file);
  if (!st.size) {
    return { ok: false, ms: 0, bytes: 0, reason: "empty" };
  }
  const ms = await probeDurationMs(file);
  if (!ms) {
    return { ok: false, ms: 0, bytes: st.size, reason: `unreadable (${st.size} bytes)` };
  }
  if (ms < minMs) {
    return { ok: false, ms, bytes: st.size, reason: `too short (${(ms / 1000).toFixed(2)}s)` };
  }
  return { ok: true, ms, bytes: st.size };
}

export async function probeDurationMs(file) {
  try {
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const sec = Number(String(out).trim());
    return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
  } catch {
    return null;
  }
}

export { readFile };

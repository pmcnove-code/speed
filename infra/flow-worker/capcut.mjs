import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDraft, extractText } from "capcut-cli";
import { captionPhrases, subtitleText } from "./captions.mjs";

async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./node_modules/capcut-cli/dist/index.js", import.meta.url));

// The draft is the editing timeline. Linux export uses our full-quality encoder:
// upstream's proxy render omits transitions and subtitle fades.
export function editingSpec(paths, durations, captions, options = {}) {
  let offset = 0;
  const videos = [], texts = [], operations = [];
  paths.forEach((path, i) => {
    const ms = durations[i];
    if (!Number.isFinite(ms) || ms <= 0) throw new Error("Invalid editing duration");
    const ref = `clip${i}`;
    videos.push({ ref, path: resolve(path), start: offset / 1000, duration: ms / 1000 });
    const transition = options.transition || captions[i]?.transition || "dissolve";
    if (!["cut", "dissolve", "fade"].includes(transition)) throw new Error("Unsupported scene transition");
    if (i && transition !== "cut") operations.push({ op: "transition", target: `clip${i - 1}`, slug: transition === "fade" ? "black-fade" : "mix", duration: transition === "fade" ? 8 / 24 : 4 / 24 });
    for (const phrase of options.subtitles === false ? [] : (captions[i]?.phrases || captionPhrases(captions[i]?.text || "", captions[i]?.words || [], ms))) {
      const text = subtitleText(phrase.text);
      if (text) texts.push({ text, start: (offset + phrase.startMs) / 1000, duration: (phrase.endMs - phrase.startMs) / 1000, fontSize: (options.subtitleSize || 54) / 3, color: "#F5F5F5", y: options.subtitlePosition === "top" ? 0.66 : options.subtitlePosition === "middle" ? 0 : -0.66 });
    }
    offset += ms;
  });
  return { name: "Copy Studio Reel", width: 1080, height: 1920, ratio: "9:16", fps: 24,
    tracks: [{ type: "video", name: "Verified clips", items: videos }, ...(texts.length ? [{ type: "text", name: "Subtitles", items: texts }] : [])], operations };
}

export async function compileEditingTimeline(paths, durations, captions, output, options = {}) {
  const folder = await mkdtemp(join(dirname(resolve(output)), "capcut-"));
  const spec = editingSpec(paths, durations, captions, options);
  const specPath = join(folder, "edit.json");
  const project = join(folder, "project");
  await writeFile(specPath, JSON.stringify(spec, null, 2));
  try {
    await exec(process.execPath, [cli, "compile", specPath, "--out", project], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    const { draft } = loadDraft(project);
    const segments = draft.tracks.filter(t => t.type === "video").flatMap(t => t.segments).sort((a,b) => a.target_timerange.start - b.target_timerange.start);
    if (segments.length !== paths.length) throw new Error("Compiled timeline lost clips");
    const clips = await Promise.all(segments.map(async (seg, i) => {
      const material = draft.materials.videos.find(m => m.id === seg.material_id);
      const expected = spec.tracks[0].items[i];
      if (!material?.path || await digest(material.path) !== await digest(paths[i]) || Math.abs(seg.target_timerange.start - expected.start * 1e6) > 1 || Math.abs(seg.target_timerange.duration - durations[i] * 1000) > 1 || seg.source_timerange.start !== 0 || seg.speed !== 1) throw new Error("Compiled timeline changed verified speech timing");
      const previous = segments[i - 1];
      const transition = previous && draft.materials.transitions?.find(t => previous.extra_material_refs?.includes(t.id));
      const type = !transition ? "cut" : transition.name === "Black Fade" ? "fade" : transition.name === "Mix" ? "dissolve" : null;
      if (!type) throw new Error("Unsupported compiled transition");
      return { path: material.path, durationMs: seg.target_timerange.duration / 1000, transition: type };
    }));
    const subtitles = draft.tracks.filter(t => t.type === "text").flatMap(t => t.segments).map(seg => ({
      text: extractText(draft.materials.texts.find(t => t.id === seg.material_id)?.content || ""),
      startMs: seg.target_timerange.start / 1000,
      endMs: (seg.target_timerange.start + seg.target_timerange.duration) / 1000,
    }));
    const expectedTexts = spec.tracks.find(track => track.type === "text")?.items || [];
    if (subtitles.length !== expectedTexts.length || subtitles.some((s,i) => s.text !== expectedTexts[i].text || Math.abs(s.startMs - expectedTexts[i].start * 1000) > .01 || Math.abs(s.endMs - (expectedTexts[i].start + expectedTexts[i].duration) * 1000) > .01)) throw new Error("Compiled subtitles changed text or timing");
    await writeFile(join(folder, "renderer.json"), JSON.stringify({ engine: "capcut-cli@0.22.0 + Copy Studio FFmpeg export", project, clips, subtitles, options, subtitleFadeMs: options.subtitleFade === false ? [0,0] : [60,90], transitionHandles: "cloned frames; speech audio never overlaps" }, null, 2));
    return { project, clips, subtitles };
  } catch (error) {
    throw new Error(`CapCut editing failed: ${String(error.stderr || error.message).slice(-1000)}`);
  }
}

export async function compileClipEdit(path, plan, output) {
  const folder=await mkdtemp(join(dirname(resolve(output)), 'capcut-clip-'));
  const project=join(folder,'project');
  const spec={name:'Copy Studio clip edit',width:1080,height:1920,fps:24,ratio:'9:16',tracks:[{type:'video',name:'Verified clip',items:[{path:resolve(path),start:0,sourceStart:plan.sourceStartMs/1000,duration:plan.durationMs/1000}]}]};
  const specPath=join(folder,'edit.json');await writeFile(specPath,JSON.stringify(spec,null,2));
  await exec(process.execPath,[cli,'compile',specPath,'--out',project],{timeout:120000,maxBuffer:2*1024*1024});
  const {draft}=loadDraft(project);
  const segments=draft.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments);
  const seg=segments[0],material=draft.materials.videos.find(m=>m.id===seg?.material_id);
  if(segments.length!==1 || !material?.path || await digest(material.path)!==await digest(path) ||
     seg.source_timerange.start!==plan.sourceStartMs*1000 || seg.source_timerange.duration!==plan.durationMs*1000 ||
     seg.target_timerange.start!==0 || seg.target_timerange.duration!==plan.durationMs*1000 || seg.speed!==1) throw new Error('CapCut clip edit changed the verified speech range');
  return {project,path:material.path,sourceStartMs:seg.source_timerange.start/1000,durationMs:seg.source_timerange.duration/1000};
}

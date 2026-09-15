type ProgressJob = { status: string; stage: string; stageDetail?: string; error?: string | null; storyboard?: unknown[] | null };

export function friendlyReelError(error: string | null | undefined): string {
  const text = String(error || "");
  if (/RENDER_UNAVAILABLE|shared 10-minute observation window/i.test(text)) return "Flow has not made the submitted clip available. Your saved clips are preserved in Clips & results. Open Error details for the missing clip.";
  if (/MEDIA_LOAD_FAILED|could not load its submitted clip/i.test(text)) return "The video service could not load the generated clip. Open Error details for the processing log.";
  if (/GENDER_MISSING|no matching (?:male|female)/i.test(text)) return "No matching character or voice is available for your selected gender. Add a matching reference in Personas or Flow and try again.";
  if (/CHARACTER_MISSING|no character named|character ingredient did not attach|no reference photo/i.test(text)) return "Your character could not be attached. Upload its reference photo in Personas, or add the matching character in Flow, then try again.";
  if (/unusual activity|blocked/i.test(text)) return "The video service couldn't accept this request. Please try again later.";
  if (/credit|quota|billing/i.test(text)) return "Your video account needs more credits before it can continue.";
  if (/expired|sign.?in|reconnect|session/i.test(text)) return "Your video account needs to be reconnected in Settings.";
  if (/speech|said .*copy|repeat|stutter/i.test(text)) return "The spoken words didn't match your script. Please try creating the video again.";
  return "We couldn't finish this video. Your script is still here, so you can try again.";
}

export function reelProgress(job: ProgressJob | null, starting = false) {
  const lines = String(job?.stageDetail || "").split("\n").filter(Boolean);
  const latest = lines.at(-1) || "";
  const clips = [...lines.join("\n").matchAll(/\[clip\]\s*C(\d+)\s*\/\s*C?(\d+)/gi)];
  const lastClip = clips.at(-1);
  const total = Math.max(1, Number(lastClip?.[2]) || job?.storyboard?.length || 1);
  const index = Math.min(total, Math.max(1, Number(lastClip?.[1]) || 1));
  let percent = starting ? 3 : 8;
  let step = 0;
  let message = "Preparing your character and voice";
  if (job?.status === "queued") {
    percent = 0;
    message = "Your video is in line and will start automatically";
  } else if (/\[clip-edit\]/i.test(latest)) {
    const edit=latest.match(/C(\d+)\/(\d+)/);
    step=2;
    percent=edit ? Math.round(85+5*Number(edit[1])/Number(edit[2])) : 85;
    message=edit ? `Editing clip ${Number(edit[1])} of ${Number(edit[2])} before assembly` : "Preparing clips for editing";
  } else if (/stitch|caption|final reel|pulling the stitched/i.test(`${job?.stage} ${latest}`)) {
    step = 2;
    percent = /pull|sav|final reel/i.test(latest) ? 96 : 90;
    message = "Adding subtitles and smoothing the transitions";
    if (percent === 96) message = "Saving your finished video";
  } else if (lastClip || /clips|render|download/i.test(job?.stage || "")) {
    step = 1;
    const fraction = /saved|said the copy/i.test(latest) ? 1 : /download|speech|checking/i.test(latest) ? 0.85 : /generat|render/i.test(latest) ? 0.5 : 0.1;
    percent = Math.round(15 + 70 * (index - 1 + fraction) / total);
    message = `${/download|speech|checking|saved|said the copy/i.test(latest) ? "Checking" : "Creating"} clip ${index} of ${total}`;
    if (/recover|retry/i.test(latest)) message = `Taking another look at clip ${index} of ${total}`;
    if (/reloading the video service/i.test(latest)) message = `Reloading the video service to recover clip ${index} of ${total}`;
    else if (/waiting for the new clip player|waiting for the submitted clip/i.test(latest)) message = `Waiting for clip ${index} of ${total} to become available`;
    else if (/download-only recovery/i.test(latest)) message = `Recovering the download for clip ${index} of ${total}`;
  } else if (/script|shots/i.test(job?.stage || "")) {
    message = "Planning your video from the script";
  }
  if (job?.status === "done") return { percent: 100, step: 3, message: job.stage === "clips" ? "Your clips are ready — edit and stitch to make your video" : "Your video is ready", failed: false };
  if (job?.status === "error") return { percent, step, message: friendlyReelError(job.error), failed: true };
  const attempt=[...lines.join('\n').matchAll(/\[retry\] C(\d+) attempt (\d+)\/(\d+)/g)].filter(m=>Number(m[1])===index).at(-1);
  if(step===1&&attempt)message+=` · attempt ${attempt[2]} of ${attempt[3]}`;
  return { percent, step, message, failed: false };
}

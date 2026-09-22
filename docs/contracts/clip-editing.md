# Automatic clip editing

Video Studio runs in this order:

1. Flow generates each clip and the existing speech checks verify it.
2. Copy Studio automatically calls its editing API after every clip is verified. CapCut CLI compiles a separate edit for each source clip. The server renders that clip's selected range at 1080×1920 / 24 fps.
3. Completed clip edits are checked and saved before final assembly starts.
4. The edited clips are assembled with the chosen transitions and timed subtitles, then exported as the finished reel.

The **Clips & results** button opens the results editor. Each verified source clip has its own preview and download. **Edit & stitch automatically** processes all saved clips in script order, then assembles a new result with the selected transitions and subtitles. Originals stay unchanged. Generation automatically proceeds into editing and stitching. The results editor remains available for individual downloads and optional additional versions, which reuse the same footage. Stitching is enabled only when every source clip is downloaded and verified. Failed final assembly can be retried from complete verified clips.

Clip edits conservatively remove only outer padding where timestamped words match the full spoken script exactly. They leave at least 250ms before speech and 350ms after it, round outward to video frames, preserve pauses within the script, and retain the whole clip if timing is missing/uncertain or trimming would leave less than three seconds. Silent hold clips retain their full duration. Caption timestamps shift with the selected source range.

Each clip has a CapCut draft and verified edited MP4 under the job's `clip-edits/<content-key>/` directory. The content key includes source hash, trim range and editing version. A retry reuses an edit only if its saved hash and playable duration still match. Original generated clips are never overwritten.

The progress UI displays “Editing clip X of Y before assembly.” Editing does not submit video-generation requests. As before, the unofficial CapCut CLI builds the projects and the Linux FFmpeg renderer executes the edits; this does not use CapCut's desktop/cloud rendering engine.

Automatic editing uses a stable request ID per reel, so a resumed runner reuses the existing edit and finished export. The main reel completes only after the edited MP4 is downloaded and validated. Editing failures preserve clips and diagnostics without submitting new footage.

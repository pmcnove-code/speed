# Flow deployment and verification — September 10, 2026

## Current result

Server `62.83.10.231` (`v2202609415376517035.hotsrv.de`), application `/opt/copy-studio`, has the stealth integration and Flow fixes deployed. Manual generation remains enabled, including after an unusual-activity rejection.

**Reel 79 completed successfully.** Both Google Flow clips were generated with stealth enabled, downloaded, and passed the worker's speech verification. Each clip was submitted once. The first clip was recovered from its existing project after fixing tile detection; neither clip was regenerated during recovery. The final stitch was recovered using the verified files after correcting its duration check.

- Worker job: `261776de-9977-4e8c-aad7-0509c1546fae`
- Project: `https://flow.google.com/project/e440358d-ae5b-4204-a164-30607298c78e`
- C01 asset: `7958a855-ace7-4783-a09d-2c9a7ae5fb6c`
- C02 asset: `36b05e18-64fa-4b0c-bee6-7a61df9da946`
- Final MP4: 19.8 seconds, 1080×1920 H.264 video / AAC audio, 6,132,344 bytes.
- SHA-256: `d9907bee3eb2fa2130d37634d35b705822139043a48d5063e5143d49110d1310`
- Authenticated job API reports `done`; video download returned HTTP 200; byte-range seeking returned HTTP 206 with the exact requested bytes. Full FFmpeg decoding passed.

This is a successful live recovery and final-output test. It does not prove that every future Google request will succeed or that IP reputation caused the earlier rejection. Stealth changes the browser fingerprint; the server IP was not changed. No additional fresh paid job was submitted after final deployment.

## Character gender selection

- Added required Male/Female casting choice to Video Studio for Flow generation. The API validates it and persists nullable `character_gender` (migration 0010); missing/invalid selections never enter the queue. Legacy jobs keep their previous payloads and checkpoints.
- Photo selection filters saved persona metadata by the selected gender. It never guesses from dialogue or a photograph, or silently uses an opposite/unknown reference. Flow character and voice inventory searches use the same strict filter, including search fallbacks and RPC inventory. Generic “Copy Studio” fallback is excluded for locked casting.
- Kept the chosen live character and voice in clip checkpoints for resume. Explicit casting instruction preserves the selected character gender when scene pronouns conflict; quoted spoken text remains untouched.
- Added the gender field to the worker request parser and persisted payload. HTTP regression verifies Female survives server restart and changing gender with the same idempotency key is rejected.
- Only African Elder currently has a saved persona photo. Female selection shows a notice to add a matching photo in Personas or use a matching saved Flow character. No female reference was fabricated and no paid test generation was submitted.
- Validation: full pre-route suite passed (131 app + 177 worker tests); six additional API cases passed, plus targeted worker HTTP persistence and gender tests, TypeScript and lint. Staged browser checks passed at 320–1920px: selected gender payload, missing-photo notice, page fit, persistent action, history/progress isolation and completion dialog.
- Live Chrome checks passed: Female selection persists across editor tabs, the missing-photo notice is visible, invalid API requests are rejected, the closing line remains visible on desktop, and mobile preview/playback work. Deployed worker HTTP tests also passed with isolated data. Saved-video labels distinguish previous renders from the next gender selection.
- Backup before migration: `/opt/copy-studio-backups/20260910-gender/`. Waited for existing Reel 85 before worker rollout; it independently ended with a repeated “next” speech failure and was not regenerated.

## Experimental workspace redesign

- Replaced the long stacked layout with a viewport-sized editor and preview. Generate remains visible; scene options have a separate editing tab; posts, saved videos and errors open in a searchable library dialog. Mobile/tablet switch between Write and Preview. Long content scrolls inside its panel rather than pushing actions down the page.
- Preserved request payloads, character selection, queue handling, independent active progress/history playback, detailed error logs and once-per-completion dialogs. Library search resets between sections and completion dialogs take precedence over the library.
- Browser verification passed at 320, 375, 414, 768, 1366, 1440 and 1920 pixels: no horizontal or vertical page overflow, Generate visible, input persistence, scene payload, history while processing, mobile preview and completion dialog. POST generation was intercepted; no paid UI-test request was submitted.
- 129 application tests + 172 worker tests and TypeScript passed; targeted component lint and production build passed. Installed Google Chrome verified live Reel 84 playback, mobile preview, library search reset and keyboard dialog access. The container Chromium reported a codec/demuxer error for the same valid H.264/AAC files; live Chrome playback and full FFmpeg decode passed.

## Reel 84 stalled-preview recovery

**Completed:** Reel 84 is a 48.1-second, 1080×1920 H.264/AAC MP4, 13,032,898 bytes. SHA-256 `2908ffe74a88c8d3b90e738aead36b2630022af92c581258c9363d42d5275d57`. All five clips passed speech verification. C01 retained its original two dispatches; C02–C05 each used one. C05 asset `abb4ea08-ba43-445c-8e6a-78f0c5e28c61`. Authenticated download, exact HTTP 206 range bytes and full FFmpeg decode passed.

- Reel 84 (`b4ae783b-0452-4fe4-baee-8280c8f08b3f`) was stuck in C01 acquisition after the first take failed speech validation and its one allowed replacement was submitted. Its active Flow tab displayed “Failed — The video failed to load,” but reopening the project showed both assets available. The replacement was confirmed by project inventory as `934db661-a453-414f-8a26-b43ea3d65e07`, created at the second dispatch timestamp. Original rejected take: `370b936a-d57e-4459-a001-1820750f47e6`.
- Detect failed new video tiles, reload the project at most twice, and retry the existing submitted asset. Also reload a stalled observation after 90 seconds without movement, within the same two-reload budget. Persistent identified load errors become `MEDIA_LOAD_FAILED` rather than repeated acquisition loops; this does not submit another paid take.
- Preserve rejected-asset URLs even when a network download saved only the asset ID; clear stale top-level identity fields on a fresh dispatch. Recovery of Reel 84 pins the confirmed replacement and excludes the rejected original, preserving C01's two-dispatch ceiling.
- Progress messages now distinguish waiting for an available clip, recovering a download, and reloading the video service.
- Live continuation recovered C01 and verified C02/C03, then exposed a C04 download handoff failure. Save the opened asset identity before attempting downloads, retain it across acquisition failures, wait for its player on resume, and accept the already identified editor without matching dialogue to its generated title. Carry historical rejected asset URLs into later clip exclusions. Existing C04 asset `a1823b93-dae4-4a52-8ad2-a023db16b2a1` was identified by the project inventory at its single dispatch time.
- Replaced title discovery through changing live button locators with one DOM snapshot. A rapid-control-change browser fixture confirms scans finish promptly. Downloads with a known asset ID remain bound to that editor; they do not reselect tiles by script or title. C04 local file passed fresh speech verification (`417ad336f5b0f14673f2bc5d906dddecc1fa13e1e51b31743b56b7d42a293755`, 10.005s) and was restored with its single dispatch retained.
- Follow-up verification: all 172 worker tests passed; worker build and browser fixture passed, including retaining an identified clip when its editor does not expose the dialogue.
- Validation: 129 app tests and 172 worker tests passed, TypeScript and targeted lint passed, app/worker builds succeeded. Browser fixtures verified one reload recovers an existing playable asset and a persistent load error stops after two reloads. Predeployment backup: `/opt/copy-studio-backups/20260910-load-recovery/`; recovery state backup remains beside the worker state file.

## Available-reference selection (Reel 83)

**Reel 83 completed:** 38.1-second 1080×1920 H.264/AAC MP4 using African Elder, 11,462,132 bytes, SHA-256 `42b85d920c6acbb075262ef7ed0e4835701945ef2af628fd93f5efca4d82d4cc`. Download, byte-range seeking, full decoding and service health passed. All four clips are verified with exactly one paid dispatch each. Compared the original and replacement payloads: hook, script, CTA and every spoken clip line are identical. The API and mobile progress UI show the persisted African Elder reference.

- User authorized using available references instead of requiring the copy persona's mapped name. New Flow jobs prefer the requested persona's saved image; otherwise they choose an existing saved reference deterministically. The selected persona ID and character name are saved on the reel before dispatch, so subsequent clips and resumes retain that reference. Already-dispatched legacy jobs retain their original inputs.
- Migration 0009 adds nullable `reference_persona_id` and `reference_character`. Experimental progress and playback show the selected character. Missing-photo guidance now describes automatic available-reference selection.
- Reel 83 originally mapped to Latino Dad with no saved photo. Its old worker `f4cdd783-5531-447b-b330-bf38a037a2aa` failed before any paid dispatch. After verifying that, it was requeued with fresh dispatch metadata and selected persona 1 / African Elder, using the real stored reference photo. Original failed worker state remains for audit. Replacement worker: `325af88d-222b-4550-9047-f0c504a73922`; project `1d46b883-facb-46d9-960b-9e1512f614b9`.
- Asset-name replacement is limited to prompt directions and cannot rewrite the quoted spoken script.
- Verification: 128 app and 168 worker tests passed before the final prompt guard; the added prompt guard passed its six-test suite, along with reference-selection tests, TypeScript and targeted UI lint. Production app/worker builds and migration succeeded. Source/database backup: `/opt/copy-studio-backups/20260910-available-reference/`.

## Reel 82 missing reference

- Reel 82 (`9e66bdf3-b4c9-4c37-99e5-0382aa159d8b`) failed before any paid dispatch. Post 170 uses persona 5, “Avatar Profile 5 - Diabetes/Obesity Carnivore,” mapped to Latino Dad. Its photo and photo MIME are null, and the Flow account has no matching character to attach.
- The voice inventory message did not mean character setup succeeded. Reword it to explicitly describe voices and separate character setup.
- Missing character plus missing photo now raises `CHARACTER_MISSING` and stops preflight without retrying the same missing input. The UI explains the required reference photo and links to Personas while retaining the diagnostic log.
- Targeted progress/state-machine tests, TypeScript, UI lint and production app/worker builds passed. Deployed mobile browser check confirmed the photo explanation, Personas link and original log; service health passed. Reel 82 is not retried without the correct reference image or a matching Flow character.

## Render-completion hardening

**Reel 81 recovered successfully:** 46.1 seconds, 1080×1920 H.264/AAC MP4, 13,614,631 bytes. SHA-256 `669cda4a665afb7ad040488710022861780042789ae08d969d43529b77e62070`. App and worker both report done; authenticated download, byte-range seeking and full FFmpeg decode passed. All five clip checkpoints remain verified with dispatchCount=1: no additional generation credits were spent. C05 asset `add65199-6317-4025-90c9-83b3c0a3cc4a` was acquired from the original project. Database, worker and runner health checks passed.

- Fix Reel 81's premature completion detection: a new thumbnail or an existing play icon is no longer a finished-render signal. Visible generating/percentage indicators block acquisition, and the worker must open a distinct asset before proceeding. Remove the old 18-second grid-completion latch.
- Include custom Flow tiles in progress observation, even outside `main`. Recheck readiness on each poll instead of retaining a transient ready state.
- Carry all prior clip asset URLs into selection and recovery. Handle repeated auto-titles by inspecting individual occurrences and rejecting known asset IDs.
- Support loaded HTML video and Flow's canvas editor with an enabled media download control; allow the player to load. Downloaded bytes still undergo media, duration, identity and speech validation.
- Resumed acquisition returns from stale editors to the project grid. Lack of an early UI signal no longer falsely reports that the saved submission never started; continue bounded observation without another generation.
- Verification: all 167 worker tests passed. Production browser regressions passed for the 24% tile outside `main`, duplicate titles, unloaded video, disabled/enabled canvas export, active progress on the canvas, and a phantom ready tile beyond the former 18-second threshold. Production Docker builds succeeded.
- Reel 81 recovery preserves the original worker ID `fc296d43-b82d-4772-8248-0a45c03b840e`, four verified files and all five single-dispatch checkpoints. Replacement generation is disabled for this recovery. Separate state backups are stored alongside the worker state; original source backup is `/opt/copy-studio-backups/20260910-scenes/flow-before-render-wait.mjs`.

## Error-log UI update

- Failed jobs retain the friendly explanation and expose expandable Error details with the recorded error, reel ID, processing stage, completion time when available, and stage log. Copy error log copies the displayed diagnostic text.
- The five most recent other failed jobs remain accessible after refresh and alongside ongoing progress. This is a UI-only change; it does not resolve the underlying generation failure.
- TypeScript, targeted ESLint and production build passed. Deployed browser checks passed for expandable details, copying, mobile overflow and active progress while browsing history. Generation requests were intercepted, with no paid generation. App-only rollout left the worker and reel runner running; service health passed.

## Whole-video scene and history update

- Separate saved-video playback from active generation state. Clicking history keeps the running progress bar intact.
- Queue a completion dialog once per observed newly finished video; old history selections do not trigger it. The dialog offers Watch video and Keep working.
- Add one optional scene description for the entire video and a global transition selector: soft dissolve, straight cut, or fade through black. Scene directions replace the reference-background paragraph only when explicitly supplied; spoken copy, character identity, pose and voice locks remain intact. Blank defaults preserve existing prompts and dispatch payloads.
- Store the optional setting in nullable `reel_jobs.scene_direction` via migration 0008; pass it through the app and worker to every clip. Render selected transitions while retaining the full audio timeline.
- Verification: 124 app tests + 165 worker tests passed, TypeScript and targeted UI lint passed. Actual synthetic-video rendering tested all three transitions within 6.9–7.2 seconds for two 3.5-second inputs. Production Docker builds succeeded; database, worker and runner health passed.
- Browser regression passed on desktop and mobile: scene payload, history during active creation, one completion dialog, and no dialog when selecting history. Generation POST was intercepted; no paid generation was submitted. A newly generated scene's visual fidelity has not been live-tested.
- Predeployment source and database backups: `/opt/copy-studio-backups/20260910-scenes/`. No queued or running jobs existed at rollout.

## Deployed changes

- Pinned `playwright` 1.56.1, `playwright-extra` 4.3.6 and `puppeteer-extra-plugin-stealth` 2.11.2. Shared browser configuration covers login, probes and generation. Persistent sessions create a new tab so stealth hooks run before navigation.
- `FLOW_STEALTH=1` is the default. Setting it to `0` and recreating the worker restores plain Playwright. Signed-in profiles were retained.
- Removed the earlier app-level blocked-account lockout at the owner's request. Google rejection still ends the affected job; explicit manual retries remain available.
- Corrected mouse coordinates for both points and rectangles, awaited the character-builder fallback correctly, and reopened the picker before attaching a voice after a character.
- Recognize Flow's labeled `flow-grid-tile-container` video elements, exclude character tiles, and click above hover actions. The prior button-only detector missed successfully generated videos.
- Use consistent video counts before and after submission. Keep new checkpoint state authoritative over stale resumed metadata.
- Display subtitle letters and numbers without punctuation or symbols, except apostrophes. Apply this only during rendering, retaining punctuation for phrase grouping and preserving the original spoken script.
- Add disappearing phrase subtitles timed to recognized speech. Punctuation keeps phrases such as “step outside” together. Use Liberation Sans regular with a thin outline and subtle shadow; retain every script word. If recognized words cannot align exactly, use estimated timing rather than timestamps from mismatched words.
- Reject unexpected repeated speech, including “come comes,” during generation validation. Reel 79's original C02 contained that stutter; a separate repaired copy removes 7.68–8.00 seconds from synchronized audio/video. Original media is retained. Both corrected clips passed fresh speech verification, without any new Google generation.
- Replace the Experimental terminal log with an accessible progress bar, estimated completion percentage, three plain-language steps, and friendly failure messages. Restore active-job progress after refresh and version video URLs so an older cached render is not replayed.
- Center a four-frame dissolve on each actual clip boundary using cloned handles; retain the complete audio timeline with 8 ms click-suppression fades rather than overlapping voices.
- Reinforce the shared v3.3 contract: recompute supplied durations from the final quote, normalize syllable counting for punctuated acronyms, curly contractions and compounds, apply conservative numeric timing fallback, and reject an unsplittable oversized token. Syllable counts remain deterministic estimates, not a pronunciation dictionary. The exact prompt, single-character attachments, sentence consolidation and verbatim partition checks remain shared by app and worker.
- Validate stitched duration against the sum of normalized clips with 500 ms tolerance. Removed the hard-coded 25-second minimum that incorrectly rejected the valid 20.1-second reel.
- Worker dependencies use a committed lockfile and Docker `npm ci`. Build context excludes local dependencies, environment files and browser profiles. Experimental duration wording follows the copy rather than promising a minimum length.

## Checks

- 121 application tests and 165 worker tests passed; TypeScript passed.
- The new FFmpeg regression stitches a short two-clip reel and verifies its combined duration.
- The progress display passed a real-browser desktop/mobile check for queued, creating, finishing and completed states; the browser intercepted the test generation request, so no job or paid generation was created. Targeted UI lint passed.
- Final-reel speech transcription matches the full script with no extra “come.” The “step outside” subtitle was visually checked at 6.6 seconds.
- Production Docker builds passed. The browser fixture verifies custom tile detection/opening without Google requests.
- Real ephemeral and persistent browser checks passed with stealth enabled; earlier disabled comparisons confirmed the integration changes the fingerprint. Enabled browsers report `navigator.webdriver=false`, a non-HeadlessChrome user agent and browser plugins.
- Signed-in Flow dashboard access was verified before generation.
- Full repository lint has pre-existing failures outside this fix, recorded in `PROJECT_REVIEW.md`; this is not a claim of a clean repository-wide lint run.

## Rollback and history

Source and database backup: `/opt/copy-studio-backups/20260910-flow-fix/`.
Pre-stealth source backup: `/opt/copy-studio-backups/20260910-stealth/source.tar.gz`.
Pre-stealth image tags: `infra-flow-worker:pre-stealth-20260910` and `copy-studio:pre-stealth-20260910`.
Worker job state was backed up before each manual recovery next to its state JSON.

Earlier reel 77 exposed voice-picker failure; reel 78 was rejected for unusual activity before stealth. Those results are historical and do not describe the current completed reel or generation policy.

## CapCut automated editing — 2026-09-11

- Pinned unofficial `capcut-cli` 0.22.0 in the worker lockfile; installed with lifecycle scripts disabled. CLI is on the container PATH and the server launcher runs it in the worker container.
- Both Flow transports now automatically compile a CapCut draft before final export. The encoder consumes the compiled video order, durations, transitions and subtitle text/timing. Source SHA-256 checks ensure imported draft media matches verified takes.
- Drafts and copied media are retained under each job's `capcut-*/project`; `edit.json` records compiler input, `renderer.json` records the export timeline. No desktop interaction is required for the normal Studio MP4 workflow.
- Linux export remains the full-quality Copy Studio FFmpeg renderer: upstream `capcut render` is a proxy and omits transitions/effects. This integration supports the existing cut/dissolve/black-fade choices and timed regular-weight disappearing subtitles; it does not implement arbitrary CapCut effects or native desktop export.
- Final subtitle/audio rendering errors now fail explicitly instead of silently delivering an uncaptioned fallback. Existing editing retry does not submit any new Flow generations.
- Server isolated export suite: 10/10 passed (all three transition choices, complete duration, subtitles). Local worker regression: 178/179 passed; the local Homebrew FFmpeg lacks the subtitle filter, now correctly surfaced instead of suppressed. Linux image is the authoritative render environment.
- Full Linux worker suite: **179/179 passed**. TypeScript check passed. A render-only smoke test using Reel #84 C01+C02 produced a fully decoded **20.100s, 1080×1920 H.264/AAC** MP4; original reels and Flow credits were untouched.

### Server CLI operation

`capcut --version` (or `capcut-cli --version`) runs the pinned CLI inside `infra-flow-worker-1`. File arguments use **container paths**; persistent projects are under `/data/flow-sessions/jobs/<worker-job-id>/capcut-*/project`. The normal Generate workflow automatically performs compilation and MP4 export; operators do not need to open CapCut. Draft media is copied into each project; moving a draft to a desktop requires relinking those media paths. Desktop effects/export parity has not been verified.

## Saved-video editing API — 2026-09-11

- Added authenticated reel edit creation, list/status and byte-range MP4 download endpoints; see `docs/editing-api.md`.
- Added **Edit video** to saved-video preview. Controls cover subtitles on/off, size, position, fade and transition choice. Edited copies are independently watchable/downloadable; originals and generation progress remain separate.
- Durable, sequential editing queue with per-reel concurrency control, request-ID deduplication, cross-reel ID checks and restart recovery. Editing invokes CapCut timeline compilation and the existing export renderer, never Flow generation.
- Existing reels can reconstruct their clip timeline from saved exact scripts and source files. Caption timing can be recovered with the configured Deepgram service; no new video is generated.
- Fixed reverse-proxy origin validation and CapCut's rejection of empty text tracks. Export temp files now clean up after rendering; FFmpeg subprocesses have a timeout.
- Verification: **145 app tests, 184 Linux worker tests passed**, plus typecheck and targeted lint. Render coverage includes subtitles off and custom size/top position/fade-off. Isolated HTTP/UI export of Reel #84 footage produced **48.100s / 12,072,571 bytes**; full FFmpeg decode passed, Chrome playback and byte-range requests passed. Full authenticated MP4 download passed on the server network: HTTP 200, exact Content-Length, SHA-256 `84565ca3e697e515b14e64c3103065c780a335d991be0d9bc558c6a91342801f`. The external test tunnel was too slow for its 30s download deadline; this did not affect the server-side export/download checks.
- No source reels were overwritten and no Flow generation credits were spent by these tests. Staging used read-only source footage and no Flow accounts.
- Live rollout verified: editor controls work in Chrome at desktop/mobile sizes; edit list returns 200 and invalid options return 400. App/database/Flow worker/runner are healthy. Temporary preview containers and SSH tunnel were removed. Live verification did not submit exports or generation requests.

## Correction: automatic clip-first editing — 2026-09-11

The intended workflow is source-clip editing **before** final assembly. Removed the saved-video editor button. Both Flow transports now call the shared pipeline which compiles and renders a separate CapCut edit for every verified source clip, persists it with source/output hashes, and only then assembles the edited clips with transitions and timed subtitles.

- Conservative outer-padding trims require a full, exact match between the spoken script and word timestamps; preserve 250ms lead-in and 350ms tail, all internal pauses, and at least three seconds of footage. Otherwise retain the entire clip. Caption times shift with the source cut.
- Original clips stay unchanged. Completed edits are reused only after output-hash and playable-duration checks. Clip edits replace the former normalization encode rather than adding another encode to that stage.
- `CLIP_EDIT` errors carry the post-dispatch flag so the worker cannot rotate accounts and generate another set of clips after an edit/export failure.
- UI progress explicitly says “Editing clip X of Y before assembly.” Saved-edit API URLs remain compatible but are not the normal user workflow. See `docs/clip-editing.md`.
- Validation: 146 app tests passed; trim and cache-reuse tests passed against the real CLI/FFmpeg. Isolated saved-footage export confirmed two individual edited MP4s and completion events **before** assembly, followed by a fully decoded 20.100s MP4 (4,906,705 bytes).
- Rollout waits for Reel #86 to finish; its in-flight generation is not interrupted or regenerated by this deployment.
- Final Linux worker suite: **189/189 passed**. Reel #86 completed successfully before activation. The corrected app/worker are live and healthy; the running worker confirms both clip-first preprocessing and the no-regeneration editing-error guard.

## 2026-09-11 — Clip downloads and results editor

Generation now returns verified source clips and saved editing metadata, without calling final assembly. The app marks the job complete at the clips stage and displays a clips-ready completion message. Results editor starts CapCut clip preprocessing and stitching only on explicit button action. History includes clips-only jobs.

Verified: 153 app tests; 190 Linux worker tests; isolated real five-clip edit with no pre-existing final video; Chrome playback and HTTP ranges; responsive editor at 320, 375, 414, 768 and 1366 pixels. All five original clip downloads returned exact listed byte counts. The 12,073,260-byte stitched MP4 passed full FFmpeg decode. No Flow generation was submitted during testing.

## Reel 88 progress logger recovery

Fixed a ReferenceError introduced by the clips-ready change: the progress callback used `result.clipsReady` before `generateReel` returned. Extracted the actual log handler into `job-progress.mjs`; regression tests cover the exact Reel 88 event, completed clips and real assembly messages. All 192 Linux worker tests pass. Recovered the persisted failed job only after verifying both saved MP4s and the editing manifest, with a backup of the original job record. No generation or final stitch was submitted. Reel 88 now completes at the clips stage and awaits the user's editor action.

## Reel 89 — unavailable submitted render

Read-only inspection of Flow project 344b7523-2313-42a1-a78f-bc9e84b6ae20 found only the two known video tiles. C01 and C02 were verified and remain individually downloadable; C03 was submitted once but no output asset was recorded or visible, and C04 was never submitted. This job has not been marked complete or regenerated.

Fixed repeated observation windows: all acquisition retries for the same submitted take share one ten-minute deadline. An unavailable render becomes a specific terminal `RENDER_UNAVAILABLE` error, with saved-clip guidance, rather than restarting three additional ten-minute waits. Corrected the misleading “already rendered” recovery log to “already submitted.” Tests cover deadline reuse, independent clips/new takes, and preventing further recovery or paid replacement on this error. App tests: 154 passed.

Deployment verified healthy (app/database/worker/runner). All 193 Linux worker tests pass. Chrome verified History → Errors → Reel 89 → Clips & results opens the editor, exposes the two verified downloads, and disables stitching with only 2/4 clips ready. Added the editor action to historical error entries so partial clips remain accessible after refresh.

## Reel 90 — completion protocol and deployment correction

The background reel-runner was still using an older image requiring a final MP4; restarting that container had not upgraded it. The worker's persisted schema also omitted clipsReady. Added durable serialization with fresh-store restart coverage. Worker startup validates saved files for historical done/clips jobs and restores clipsReady only when every source clip is available. Added scripts/deploy-video-studio.sh, which recreates the runner and checks image identity against the app after deployment. Use this script for future app/worker rollouts; do not substitute compose start for runner recreation.

Reel 90's worker was already done. After restart, all six saved clips and clipsReady were verified; corrected the app record to done/clips. All six authenticated full downloads passed, and canStitch is true. No clips were generated or final video stitched during recovery. Removed duplicate results action beside the error panel. All 193 Linux worker tests pass; app TypeScript passes; app, worker, DB and runner are healthy, with app and runner using the same image.

## 2026-09-12 — Automatic CapCut API editing restored

The runner now automatically calls the existing Copy Studio editing API after verified Flow clips finish. It waits for clip edits and assembly, downloads the edited MP4, validates duration, and completes the main reel with the final video. Stable automatic request IDs reuse queued/running/completed exports across runner retries. Generation is never called by editing recovery. The optional results editor and individual clip downloads remain available; editing status can be read while the main reel is running.

Validation: 157 app tests; 193 Linux worker tests; TypeScript and scoped lint passed. Isolated six-clip export using saved Reel 90 footage included subtitles and transitions, produced a 19,951,407-byte MP4, passed full FFmpeg decode, and returned byte-identical output on a repeated automatic request. All six clip edits preceded assembly. Visually checked a rendered subtitle frame. Fixed a worker test race that attempted to parse in-progress atomic temporary files as completed job records.

## 2026-09-12 — Separate generation history and project clips

Added authenticated `/experimental/history` for replaying and downloading finished generated videos, `/experimental/clips` for searching clip projects, and `/experimental/clips/{id}` for per-project original clip previews/downloads. Both libraries use database pagination rather than the Studio's recent-80 list. Dedicated Studio navigation links keep history and clip downloads separate from creation. Partial/failed projects expose only verified saved clips; missing clips are disabled. Existing optional editing remains accessible from each project.

Verified: 157 app tests, TypeScript and scoped ESLint. Chrome replay of Reel 87 and range response; six downloads listed for project 90, two for partial project 89; search, empty state, page 2 navigation, invalid-project 404; responsive checks at 320/375/414/768/1366 pixels and visual inspection. No generation or editing requests were submitted.

## 2026-09-12 — Create form controls and requirements

Moved Load post from the global header into a native selector inside Create your reel. Selection reuses the existing post loader for hook, script, CTA and scene description. Character gender now has a separate row below the selector. A persistent Requirements note above Generate lists missing service/copy/gender, reports unavailable saved reference photos without falsely ruling out Flow's own library, and updates with form edits. Tightened the narrow-screen header to preserve editing space.

Verified: TypeScript and scoped ESLint; 157 app tests. Chrome checked post loading, separate gender-row positioning, disabled/enabled generation states, missing-photo guidance, and Generate remaining inside the viewport at 320/375/414/768/1366 widths. No generation was submitted.

## 2026-09-12 — Enforced user v3.3 prompt contract

Audited the existing splitter, scene overrides and both actual Flow dispatch paths. Fixed prompt mutation by scene replacement, gender prefix and RPC/live-name transformations; the paid-dispatch gate now rebuilds and validates the exact shared template. Gender and voice selection remain ingredient checks. Scene text is retained as planning metadata, with an updated UI note explaining that the reference image owns the setting.

Added pinned CMU pronunciation-derived syllable counts with license/provenance, conservative unknown-word timing fallback, strict oversized-duration rejection, boundary-repair fallback that never deletes words, and canonical consolidation of supplied clip plans. Short quoted dialogue now passes full-prompt composer verification. Both app and worker preserve the same canonical breakdown. Existing source footage is unchanged.

Validation: 157 app tests, 196 Linux worker tests, TypeScript and scoped lint passed. Exact-template fixture and live-deployed contract tests passed without any paid generation. App and runner image identities match; health reports app/DB/worker/runner healthy. See docs/flow-v33-contract.md for the rule-by-rule audit and estimation limits.

## Reel 94 — unnamed rendered tile and speech audit (2026-09-12)

The failure-time project snapshot had transient “video failed to load” tiles. A later read-only inspection found C06 playable with an empty `aria-label`, ahead of five older clips. The selector discarded empty labels and the play fallback assumed appended tiles. Keep unnamed video tiles in discovery and click them by occurrence, then require a new edit asset ID, playable bytes, distinct hash and matching speech. Periodic identity inspection also works when an older tile failing to load prevents the total play count from increasing. No timeout increase or automatic replacement submission was added.

Speech verification now compares the full ordered words instead of accepting 80% content-word coverage and 35% extras. Normalize contractions, curly apostrophes, punctuation and ordinary numeric notation; preserve differences in values, negations, fillers and repeated phrases. Similar mismatches may use the existing independent recognizer before rejection.

Recovered Reel 94 C06 from its existing asset `1e7f602a-cdc9-47b1-a8b3-e79688c69524`: 6016 ms; exact transcript “Cooler, grill, salt, water. That's the whole secret.” Saved its verified checkpoint. C05 failed a fresh strict speech audit (garbled/repeated 190 sentence), so its original MP4 is retained but its verified flag is withdrawn. C07 was never submitted. Worker and database errors now describe this current state instead of claiming C06 remains missing. No paid video generation occurred during this repair.

Validation: 200 worker tests, including a browser regression opening a newest unnamed tile and speech regressions for numbers, decimal points, negations and phrase repetition. Deployed with the guarded deployment script.

## Project clips recovery action (2026-09-12)

Added **Regenerate incomplete clips** on project clip pages. The session-protected, same-origin POST binds the reel to its existing worker job. The worker serializes recovery requests, persists request IDs across restarts, rejects concurrent generation/active editing, checks that the saved clip breakdown still matches the current canonical script split, and archives prior incomplete MP4s/checkpoints before resetting only unavailable clip states. Verified clips are reused. Recovery stays on the saved Flow account/project and uses the DOM checkpoint path. The app runner resumes automatic editing/stitching when all clips finish; each recovery revision uses a new export key so a previous export cannot be mistaken for the corrected result.

The UI polls availability, shows the remaining count and failures, disables duplicate submission, and preserves the request ID after an uncertain response. Live browser verification on Project 94: 5/7 source downloads retained, action visible, no horizontal overflow at 320/375/414/768 px; intercepted POST responses verified retry idempotency and processing state without sending paid generation requests. Project 94's persisted plan matches the canonical split; its recovery button has not been submitted by this verification.

Validation: 162 app tests, 202 worker tests, TypeScript and scoped ESLint pass. App, worker and runner deployed; health reports database/worker/runner healthy.

## Animated progress, individual regeneration, and sidebar navigation (2026-09-12)

Project clips now show immediate submission animation, an estimated progress bar, active clip status, ready counts, Prepare/Generate/Edit/Stitch stages, expandable processing updates, error state and a finished-video link. Progress follows the app runner after the worker finishes downloading, keeping editing/stitching visible. Motion respects reduced-motion preferences; requesting regeneration scrolls the progress panel into view.

Every card has a Regenerate Cxx action, including completed clips. Requests bind the request ID to the selected clip; existing takes are archived. The worker preserves and reuses other verified clips and skips unselected incomplete clips. A successful single-clip operation with other missing clips records partial completion without stitching or falsely marking rejected files verified. Once all clips are ready the existing automatic edit path runs. Project clips and Generation history have separate sidebar links, with only the current section highlighted.

Validation: 167 app tests; 203 worker tests; additional partial-completion file verification assertion; TypeScript/scoped ESLint. Browser testing used intercepted generation responses (no paid requests) to cover C05-only then C07-only selection, immediate animation, download/speech messages, partial completion, editing, stitching, final link, sidebar state, mobile widths and reduced motion. Production health remained healthy and Project 94 generation was not started by these checks.

## HTTP regeneration click fix (2026-09-12)

Public HTTP IP origins do not expose `crypto.randomUUID`, unlike localhost, where previous browser checks ran. Calling it outside the request try/catch caused both regeneration actions to fail before any UI update or network request. The handler now creates its ID inside error handling and falls back to `crypto.getRandomValues` (available on HTTP), preserving the same ID for uncertain retries.

Validated with actual Chrome at http://62.83.10.231: insecure context, randomUUID undefined, getRandomValues available. A single C05 click produced a valid fallback request ID (intercepted before generation); the user's incomplete-clips request for 94 was then submitted to the real endpoint and accepted once. Worker targets are C05/C07; C01/C02/C03/C04/C06 remain verified. Database 94 is queued behind running 95 and progress animation is visible. TypeScript and scoped ESLint pass.

Deployed the app only because 95 was actively generating. Worker and runner were intentionally left running; this patch changes only client-side request ID creation, so their existing backend code remains compatible. The next guarded full deployment can align their image IDs after active jobs finish.

## Recovery queue order and clip preservation clarification (2026-09-12)

User clarified that completed/unselected clips must stay and must not be generated again; no deletion of those clips was requested. Existing regeneration selection/checkpoint behavior already preserves them: all-incomplete targets unavailable clips only; per-clip targets the chosen ID only.

Fixed queue position reporting and restart ordering. Worker queue entries now persist `queuedAt`, reset only when a new recovery request is accepted; duplicate requests keep their timestamp. Running work sorts first, then requests by queue entry time. Older saved HTTP recovery records derive the timestamp from their persisted request ID. Restarts restore active work before waiting work. Queue display now exposes worker status and actual jobs ahead, so queued recoveries do not look as if rendering has started.

Added `reel_jobs.queued_at` (migration 0011), and the runner uses queue entry time instead of original project ID when claiming waiting work. Active generation was allowed to finish before the guarded full deployment. Validation: 205 worker tests, app suite plus focused queue-progress tests, TypeScript; durable queue timestamps and recovery ordering explicitly tested. No paid generations or completed-clip deletions were initiated for this change.

## Speech verification and targeted recovery (2026-09-12)

Two avoidable failures were identified in Reel 95 C02: the exact checker did not recognize an uncommon contraction (me's / me is), and legacy fallback button discovery classified ingredient/back controls as potential clips. Speech comparison now uses bounded ordered alignment for contraction equivalents and permits the optional “and” within numeric hundreds/thousands while still rejecting missing endings, changed values, repeated phrases, missing negations and ordinary missing words. The exact generation prompt and original script are unchanged.

Video discovery lists real flow-video-tile containers only (including unnamed clips). Once current asset identity is confirmed, a speech mismatch goes directly to the existing bounded content retry decision instead of inspecting unrelated UI controls. A known other clip is not treated as a confirmed current-content error.

Second transcription activity is logged. If the configured Gemini verification path is absent/unavailable, the existing Deepgram key can run a different Nova model (nova-3 ↔ nova-2); no expected script is supplied to the transcriber. Supported model reference: https://developers.deepgram.com/docs/model . Accepted secondary Deepgram word timings are available for captions. Errors retain up to 400 characters of each transcript/script rather than truncating the diagnostic at 80 characters.

Real saved C02 audit used no new video generation: both recognition passes heard “He watches me open my cooler, watches me open my cooler. Ribeye.” The contraction is now accepted, but the repeated phrase remains a valid rejection. That saved take was not marked verified or altered.

Validation: 208 worker tests, including contraction/numeric equivalence, missing ending/repetition rejection, complete diagnostics, model selection and real-browser exclusion of ingredient/back controls. Deployed with the guarded app/worker/runner script.

## Ten-attempt recovery and clean replacements (2026-09-12)

Automatic recovery now permits ten total generation attempts per failed clip, shared across confirmed speech mismatches and unrecoverable output/download errors. Free download recovery runs first when applicable. Backoff increases from 15 seconds to a maximum of 120 seconds; progress displays the current attempt out of ten. The worker has a two-hour overall deadline based on the original job start, preserved across restart, and app polling allows 130 minutes. Account, credit, blocked service, missing reference and prompt-contract failures still stop rather than repeatedly spending credits.

Each replacement persists a reset checkpoint, clears the failed local MP4 and attempt-specific asset/media/timing state, reloads the same Flow project composer, rewrites the exact prompt, and repeats duration and ingredient checks. Previous asset URLs and rejected file hashes remain excluded across worker restart. Retry counters and the selected identity are retained; completed/unselected clips are unchanged. Every replacement gets a new media catcher and render observation budget. Existing failed jobs are not automatically resubmitted by deployment.

Validation: app suite 169 passed and TypeScript check passed; worker regression coverage includes the shared ten-attempt budget, restart persistence, terminal blockers, free acquisition attempts, backoff and fresh-attempt identity exclusion. No paid generation was started for these tests.

## Native Chrome sign-in (2026-09-12)

The sign-in desktop now launches installed Google Chrome directly, without Playwright, stealth injection, remote debugging or a headless fallback during Google authentication. Existing authenticated frame/input routes show the X11 desktop and deliver the user's mouse/keyboard input. Text is passed to the input process over stdin rather than command arguments; subprocess errors do not include typed values. The UI asks the user to finish Google verification and open Flow before selecting Save Flow session.

Confirmation closes native Chrome normally (rather than terminating it, which the integration test demonstrated could lose unwritten cookies), then opens its persistent profile for Flow-session verification. A landing page or Google sign-in page cannot be saved as connected. Failed confirmation returns to the manual desktop. Sign-in requests persist across worker restart and are restored before queued jobs run. Generation uses the same Chrome executable and profile storage settings. Flow .com URL detection is corrected.

Validation: 216 worker tests, 169 app tests, TypeScript check, and an isolated Linux native-desktop integration test covering JPEG capture, user input, normal browser closure and cookie retention through the automation handoff. No Google credentials or paid generations were used in tests. Actual Google account authentication and any Google challenges must be completed by the user; the change does not guarantee that Google will accept an account or server IP.

## Generation-focused Experimental workspace (2026-09-12)

Experimental now contains a new-video form, a large estimated-progress bar with clip/retry status, and a numbered active queue. Saved players, embedded editors and the history dialog are removed from this page; completion notifications link to the dedicated History / Project Clips routes. Current-session errors retain expandable copyable diagnostics. Polling continues while idle so regeneration or jobs created elsewhere appear automatically. Queue ordering uses queuedAt (not project ID), with running work first; list retrieval prioritizes active jobs. Submission clears copy fields for the next video while retaining casting preferences.

Optional character description (500 characters) is stored as scene metadata, outside the spoken prompt. It selects a unique saved reference by character-name words and selected gender; ambiguous, missing or wrong-gender matches return validation before queue insertion. The selected reference ID is locked at submission, so existing runners honor it. The image owns actual appearance; this does not invent a new character image from free text.

Validation: TypeScript, app regression suite and focused queue / character-selection / verbatim-prompt tests passed. Browser checks covered submission while another video is running, retained active progress, queue order for older regenerated projects, reset copy fields, retry count, completion links, no old videos, no horizontal overflow at 320/375/414/768/1024/1440 px, and no JavaScript errors. Browser POSTs were intercepted: no paid generation was created. App-only rollout preserves the active generator and runner.

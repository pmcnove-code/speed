# Copy Studio editing API

This authenticated API uses the installed unofficial `renezander030/capcut-cli` 0.22.0 to compile an editing timeline. Copy Studio renders that timeline to MP4 on Linux. It is not a CapCut cloud API and does not use a CapCut login or Pro subscription.

The results editor uses this API to edit individual saved clips first and then stitch a final video. The runner calls this API automatically once all clips are verified. **Edit & stitch automatically** remains available for optional additional versions. See [Automatic clip editing](clip-editing.md).

## Create an edit

`POST /api/experimental/reels/{reelId}/edits`

Use your existing Copy Studio session cookie. JSON body:

```json
{
  "requestId": "a-unique-request-id-123",
  "options": {
    "transition": "dissolve",
    "subtitles": true,
    "subtitleSize": 42,
    "subtitlePosition": "bottom",
    "subtitleFade": true
  }
}
```

Returns HTTP 202 with `{ "edit": { "id": "…", "status": "queued", "options": {}, "log": [] } }` (additional timestamps and source ID included).

| Option | Accepted values | Default |
| --- | --- | --- |
| transition | `cut`, `dissolve`, `fade` (through black) | Keep original transitions |
| subtitles | boolean | true |
| subtitleSize | integer 36–72, at 1080×1920 | 54 |
| subtitlePosition | `bottom`, `middle`, `top` | bottom |
| subtitleFade | boolean | true, 60ms in / 90ms out |

Unknown options are rejected. The API does not accept arbitrary CLI commands, filesystem paths, replacement speech, or shell arguments. Every edit starts from the original saved footage, not an earlier edited MP4. There is one active edit per reel; exports run sequentially in a separate editing queue.

`requestId` accepts 8–100 letters, numbers, underscores or hyphens. Reuse the same ID and options after a network timeout: this returns the same edit rather than rendering twice. Reusing the ID with different options returns 409. Use a new ID to retry an export that has already ended in an error.

## Status and playback

- `GET /api/experimental/reels/{reelId}/edits` → `{ "edits": [...] }`
- `GET /api/experimental/reels/{reelId}/edits/{editId}` → `{ "edit": {...} }`
- `GET /api/experimental/reels/{reelId}/edits/{editId}/video` → MP4; supports byte ranges for playback.
- Add `?download=1` to download the edited copy.

Poll status every 3 seconds until `done` or `error`. Statuses are `queued`, `running`, `done`, and `error`; `log` explains progress and failures. Edits persist across worker restarts; interrupted exports resume using saved footage. Completed exports are not rerendered on restart.

All endpoints require a Copy Studio session and follow the application's shared-workspace access model. The app resolves the reel's worker ID from its database; clients cannot select another source by passing a path. The internal worker API additionally requires the configured worker secret.

## Existing reels and limits

A completed Flow reel must retain its source clips and timeline. Reels created before the CapCut integration can be rebuilt from their saved exact clip scripts. When subtitles are enabled, the existing Deepgram transcription service recovers timings from their saved audio; this may incur transcription usage. It does not generate new video or spend Flow generation credits. Missing audio timing or missing source files produce a visible error, while the original remains available.

Subtitles use the existing regular-weight font and punctuation rules (apostrophes retained). Visual transitions preserve the full spoken audio without overlapping voices. Arbitrary CapCut effects, clip trimming/reordering, and CapCut desktop rendering are outside this API's current scope.

Worker artifacts are retained in `/data/flow-sessions/edits/{editId}/`; the status record is the adjacent `{editId}.json`. Original generation files are not overwritten. The editing service does not currently expire edited copies automatically.

## Individual clips

`GET /api/experimental/reels/{reelId}/clips` lists original clips in script order with availability, byte size, duration and `canStitch`.

`GET /api/experimental/reels/{reelId}/clips/{clipId}/video` previews a verified clip with HTTP byte-range support. Add `?download=1` to download it as `reel-{reelId}-{clipId}.mp4`. These routes require the existing session. Unverified clips cannot be downloaded.

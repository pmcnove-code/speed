# Batch Production System Integration Guide

## Overview

The **BatchView** component implements the [workflow](../design/workflow.pdf) design for batch-centric video production. All clips in a batch generate **concurrently** with unified progress tracking.

## Architecture

### Flow

```
User adds scripts
    ↓
User reviews each script (Deepseek breakdown analysis)
    ↓
Click "Generate All X Scripts"
    ↓
API: POST /api/batches/{id}/generate-all
    ├─ Creates reel jobs for all clips (status: "queued")
    ├─ Updates batch status to "running"
    └─ Returns job details
    ↓
Client: Listen to /api/batches/{id}/events (Server-Sent Events)
    ├─ Polls job_events table for new stages
    ├─ Streams: setup → flow → rendering → assembling → done
    └─ UI updates in real-time
    ↓
Flow Worker (background) processes all clips
    ├─ Jobs run concurrently (not sequentially)
    ├─ Each job follows: script → clips → edit → assemble
    └─ Writes progress events to job_events table
    ↓
Client UI shows
    ├─ Videos tab: clips with progress bars
    ├─ Progress tab: concurrent summary
    └─ Notifications when complete
```

## Components

### BatchView (`src/components/experimental/batch-view.tsx`)

**State:**
- `scripts[]`: Script objects with breakdown results
- `videos[]`: Video/clip entries tracking progress
- `activeTab`: "scripts" | "videos" | "progress"
- `isGenerating`: Generation in flight

**Tabs:**

1. **Scripts Tab**
   - Add scripts (hook + script text)
   - Analyze with "Analyze Clips" button → calls Deepseek via API
   - Shows breakdown preview (clips, junctions, warnings)
   - "Generate All" button appears when ≥1 script reviewed

2. **Videos Tab**
   - Lists all generated clips
   - Shows status badges (Queued, Generating %, Complete, Error)
   - Progress bars for in-flight clips

3. **Progress Tab**
   - Summary cards (Generating, Complete, Total counts)
   - Concurrent progress detail (each clip's progress bar)
   - "Generation running" indicator

### useScriptBreakdown Hook (`src/lib/experimental/use-script-breakdown.ts`)

Analyzes a script and returns clips, junctions, fill ratios, and validation status.

**API:** `POST /api/batches/{batchId}/breakdown`

```typescript
const breakdown = await analyze(scriptText: string)
// Returns: BreakdownResult
```

### useBatchProgress Hook (`src/lib/experimental/use-batch-progress.ts`)

**New hook** for real-time progress via Server-Sent Events.

```typescript
const progress = useBatchProgress({
  batchId: 1,
  onStageChange: (event) => { /* update video progress */ },
  onComplete: (success) => { /* show final result */ }
});

progress.connect();  // Start listening
progress.disconnect();  // Stop listening
```

## API Routes

### `/api/batches/[id]/breakdown` (POST)

**Request:**
```json
{ "scriptText": "string" }
```

**Response:**
```json
{
  "batchId": 1,
  "totalClips": 5,
  "clips": [
    {
      "clipNumber": "C1",
      "duration": "0:03",
      "text": "...",
      "wordCount": 45,
      "estimatedTime": 3.2,
      "fillRatio": 0.95,
      "generationPrompt": "..."
    }
  ],
  "junctions": ["C1→C2"],
  "lowFillClips": [],
  "verbatimCheckPass": true,
  "limitCheckPass": true
}
```

Uses Deepseek API (from `DEEPSEEK_API_KEY` setting) to break down scripts.

### `/api/batches/[id]/generate-all` (POST)

**Request:** (empty body)

**Response:**
```json
{
  "ok": true,
  "batch": { "id": 1, "status": "running" },
  "jobsCreated": 12,
  "jobs": [
    {
      "id": 42,
      "postId": 7,
      "videoLabel": "MyPersona_2025-09-14_1",
      "status": "queued"
    }
  ]
}
```

**What it does:**
1. Fetches all posts in the batch
2. Calls `createBatchReelJobs()` to create reel jobs (one per script)
3. Jobs inserted with `status: "queued"`, `stage: "setup"` or `"script"`
4. Flow worker picks them up and processes concurrently
5. Batch status updated to `"running"`

### `/api/batches/[id]/events` (GET, Server-Sent Events)

**Stream:** Events for the batch's job progress.

**Events:**

1. **`hello`** (connection)
   ```json
   { "batchId": 1 }
   ```

2. **`stage`** (progress update, repeating)
   ```json
   {
     "stage": "setup",
     "detail": "Flow: queued — waiting for Chrome",
     "ts": "2025-09-14T12:34:56Z"
   }
   ```
   
   Possible stages:
   - `setup` / `script` - Initial
   - `flow` - Flow generation
   - `rendering` - CapCut rendering
   - `assembling` - Final assembly
   - `done` - Success
   - `error` - Failure

3. **`end`** (terminal, closes connection)
   ```json
   {
     "stage": "done",
     "detail": "All jobs complete",
     "ts": "2025-09-14T12:35:42Z"
   }
   ```

**How it works:**
- Polls `job_events` table every 600ms
- Finds rows where `batchId` matches and `id > lastSeenId`
- Streams each new event to client
- Closes when a terminal stage (`done` / `error`) is found

## Data Flow

### 1. Script Analysis (Synchronous)

```
User: Click "Analyze Clips"
  ↓
BatchView: POST /api/batches/1/breakdown { scriptText: "..." }
  ↓
API: Get DEEPSEEK_API_KEY from appSettings
  ↓
API: Call breakdownScript(text, apiKey)
  ├─ Parses script via Deepseek
  ├─ Extracts clips
  ├─ Validates verbatim + limits
  └─ Computes durations/fill ratios
  ↓
API: Return BreakdownResult
  ↓
UI: Show breakdown preview, enable "Generate All"
```

### 2. Concurrent Generation (Asynchronous)

```
User: Click "Generate All 3 Scripts"
  ↓
BatchView: Create 12 video entries (4 clips × 3 scripts)
  ↓
BatchView: POST /api/batches/1/generate-all
  ↓
API: Get posts for batch
  ↓
API: createBatchReelJobs(posts, {personaNames, createdBy})
  ├─ Builds video labels (PersonaName_Date_Seq)
  ├─ INSERT into reel_jobs (status: "queued", stage: "setup")
  └─ Return job list with IDs
  ↓
API: UPDATE batches SET status = "running"
  ↓
API: Return jobsCreated + jobs[]
  ↓
UI: Map job IDs to video entries, store videoLabels
  ↓
UI: Open EventSource /api/batches/1/events
  ├─ Listen for "stage" events
  ├─ Update video progress based on stage
  └─ Close on "end" event
  ↓
(Background) Flow worker picks up jobs from reel_jobs queue
  ├─ Process all jobs CONCURRENTLY (not sequentially)
  ├─ Each job: script → flow gen → edit → assemble
  ├─ Write events to job_events (batchId, stage, detail, ts)
  └─ Update reel_jobs status
  ↓
UI: Real-time progress updates as events stream in
  ↓
All 12 clips finish at approximately the same time ✓
```

## Implementation Checklist

- [x] **BatchView component** - Scripts/Videos/Progress tabs
- [x] **useScriptBreakdown hook** - Script analysis
- [x] **useBatchProgress hook** - SSE progress tracking
- [x] **API: breakdown** - Deepseek script analysis
- [x] **API: generate-all** - Batch job creation
- [x] **API: events** - SSE progress streaming
- [x] **TypeScript** - Full type safety, no `any`
- [x] **Integration** - Experimental page uses BatchView
- [x] **Error handling** - Toast notifications for failures
- [ ] **Persistence** (optional) - LocalStorage for batch state
- [ ] **Retry logic** (optional) - Auto-retry failed clips
- [ ] **Concurrent limit** (optional) - Cap simultaneous jobs

## Testing the Flow

### Manual Test

1. Navigate to `/experimental`
2. Click "Add First Script"
3. Enter hook + script text
4. Click "Analyze Clips"
   - Should show breakdown in ~5 seconds
   - Verify clip count, fill ratios, warnings
5. Click "Generate All 1 Scripts"
   - Should see 4 video entries appear
   - Videos should be "Queued"
6. Click **Progress** tab
   - Should see real-time progress bars
   - Counts should increase
7. Wait for completion
   - All clips should reach 100%
   - Status badge changes to "Complete"

### Expected Times

- Script analysis (Deepseek): ~5-10s
- Single clip generation (Flow): ~30-60s
- All N clips concurrently: ~30-60s (not N×30s)

### Debugging

Enable browser console → look for:

```
[Batch] Stage change: setup ...
[Batch] Stage change: flow ...
[BatchProgress] Connected: { batchId: 1 }
[BatchProgress] Stage: { stage: "flow", ... }
```

## Configuration

### Batch ID

Currently hardcoded to `BATCH_ID = 1` in BatchView. To use dynamic IDs:

1. Pass `batchId` as prop to `<BatchView />`
2. Update API route pattern to extract from URL/params
3. Store batch creation timestamp for labeling

### Deepseek API

Requires `DEEPSEEK_API_KEY` setting in `appSettings` table.

Set via `/settings` UI or:

```sql
INSERT INTO app_settings (key, value) 
VALUES ('DEEPSEEK_API_KEY', 'sk-...')
```

## Next Steps

1. **Test end-to-end** on staging
2. **Tune concurrent limits** if needed (via flow-worker config)
3. **Add persistence** - save batch state to DB for resume
4. **Implement retry logic** - auto-retry failed clips
5. **Add video editing UI** - let users trim/adjust clips before assembly
6. **Batch export** - download all clips at once as ZIP

## Files Changed

```
src/
├── components/experimental/
│   ├── batch-view.tsx (NEW - 400 lines)
│   └── script-breakdown-preview.tsx (exists)
├── lib/experimental/
│   ├── use-script-breakdown.ts (exists)
│   └── use-batch-progress.ts (NEW - 60 lines)
├── app/
│   ├── (dash)/experimental/page.tsx (updated to use BatchView)
│   └── api/batches/[id]/
│       ├── breakdown/route.ts (exists)
│       ├── generate-all/route.ts (exists)
│       └── events/route.ts (exists)
└── components/ui/
    └── tabs.tsx (NEW - from shadcn/ui)
```

## Key Features Implemented

✅ **Batch-centric workflow** - One "Generate All" button for all scripts  
✅ **Concurrent generation** - All clips process simultaneously  
✅ **Real-time progress** - SSE streaming from job_events table  
✅ **Type-safe** - Full TypeScript, no `any` casts  
✅ **Error handling** - Toast notifications + error badges  
✅ **Visual feedback** - Progress bars, status badges, counters  
✅ **Workflow alignment** (`docs/design/workflow.pdf`) - Scripts → Review → Generate All → Videos  

---

**Last updated:** 2025-09-14  
**Status:** Ready for testing

# Video Search App

- **App purpose:** desktop Electron app for managing a video library, extracting audio, running Whisper-based transcription, storing transcripts in a local DB, and enabling search/viewing of segments. Users pick a folder, scan videos, launch transcriptions, monitor progress, and read/search transcripts.
- **Tech stack:** Electron + TypeScript app split into main (Node) and renderer (React) processes; React frontend with CSS styling; backend uses Node APIs like fluent-ffmpeg, ffmpeg-static, worker threads, and @xenova/transformers for Whisper; local database layer (likely SQLite via custom wrapper) for videos/transcripts; build tooling via webpack, TypeScript configs, npm scripts.

A desktop application that helps users search their personal video files by spoken content through AI transcription indexing.

## Current Architecture

This application uses a **3-tier architecture** with secure communication between layers:

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   React Frontend    │    │   Node.js Backend    │    │   SQLite Database   │
│   (Renderer Process)│◄──►│   (Main Process)     │◄──►│   with FTS5 Search  │
│                     │    │                      │    │                     │
│ • Video Library UI  │    │ • Video Scanner      │    │ • Video Metadata    │
│ • Search Interface  │    │ • Database Manager   │    │ • Transcript Data   │
│ • Transcription UI  │    │ • IPC Handlers       │    │ • Full-Text Index   │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
         │                           │
         └─────── IPC Channels ──────┘
```

### **Why SQLite Database?**
The SQLite database is the backbone of the search functionality:

- **Video Metadata**: Stores file paths, sizes, durations, and transcription status
- **Transcript Segments**: Stores time-stamped transcript text with confidence scores
- **FTS5 Full-Text Search**: Enables lightning-fast searching through transcript content
- **Search History**: Tracks user queries for analytics and suggestions
- **Offline Operation**: Works completely offline with no external dependencies
- **Memory Fallback**: Gracefully falls back to in-memory storage if SQLite fails

### **Why IPC (Inter-Process Communication)?**
IPC provides secure communication between frontend and backend:

- **Security**: Prevents direct Node.js API exposure to the frontend
- **Process Isolation**: Keeps UI responsive by separating heavy operations
- **Type Safety**: Strongly typed communication channels
- **Error Handling**: Centralized error handling for all backend operations

## Features (Currently Implemented)

- ✅ **Folder Selection**: Select directories containing video files
- ✅ **Video Scanning**: Recursively scan folders for supported video formats
- ✅ **Database Storage**: SQLite with FTS5 full-text search capabilities
- **Automated Transcription**: Whisper-based pipeline processes videos with progress feedback
- ✅ **Real-time Search**: Search transcripts as you type
- ✅ **Video Library**: View all videos with transcription status
- ✅ **Responsive UI**: Clean interface with status indicators
- ✅ **Memory Fallback**: Works even without SQLite

## Tech Stack

- **Frontend**: React + TypeScript (Electron Renderer Process)
- **Backend**: Node.js + TypeScript (Electron Main Process)
- **Database**: SQLite with FTS5 (Full-Text Search)
- **Communication**: IPC (Inter-Process Communication)
- **Build Tools**: Webpack + TypeScript Compiler
- **Styling**: Custom CSS

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Video-search-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the application**
   ```bash
   npm run build
   ```

4. **Start the application**
   ```bash
   npm start
   ```

## Development Commands

- **Development mode** (with hot reload):
  ```bash
  npm run dev
  ```

- **Build only**:
  ```bash
  npm run build
  ```

- **Build main process only**:
  ```bash
  npm run build:main
  ```

- **Build renderer process only**:
  ```bash
  npm run build:renderer
  ```

## How It Works

### 1. **Video Discovery**
- User selects a folder containing video files
- `VideoScanner` recursively scans directories
- Supported formats: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.m4v`, `.wmv`, `.flv`
- Video metadata is stored in SQLite database

### 2. **Whisper Transcription Pipeline**
- Extracts audio with FFmpeg before queueing jobs
- Runs Whisper in a worker thread via @xenova/transformers
- Streams stage-by-stage progress and writes transcripts to SQLite
- Supports cancellation, retries, and automatic cleanup

### 3. **Search Functionality**
- Uses SQLite FTS5 for full-text search
- Searches across all transcript segments
- Returns results with video context and timestamps
- Ranks results by relevance

### 4. **Data Flow**
```
Frontend Request → IPC Channel → Backend Handler → Database Operation → Response
```

## Project Structure

```
src/
|- main/                     # Electron Main Process (backend)
|  |- main.ts                # Application entry point
|  |- preload.ts             # IPC bridge for security
|  |- database/              # SQLite database management
|  |  |- database.ts         # Database operations & fallback
|  |  |- schema.sql          # Database schema with FTS5
|  |- ipc/                   # Inter-Process Communication
|  |  |- handlers.ts         # IPC request handlers
|  |- transcription/         # Whisper orchestration, queue, workers
|  |  |- audio-extractor.ts
|  |  |- index.ts
|  |  |- transcription-queue.ts
|  |  |- whisper-transcriber.ts
|  |  |- whisper-worker.ts
|  |- video/                 # Video processing logic
|     |- video-scanner.ts
|- renderer/                 # React Frontend (UI)
|  |- App.tsx
|  |- App.css
|  |- index.tsx
|  |- types/
|     |- electron.d.ts
|- shared/                   # Shared types & constants
   |- types.ts
```

## Database Schema

```sql
-- Video metadata
CREATE TABLE videos (
    id INTEGER PRIMARY KEY,
    file_path TEXT UNIQUE,
    file_name TEXT,
    file_size INTEGER,
    duration REAL,
    transcription_status TEXT DEFAULT 'pending'
);

-- Transcript segments with timestamps
CREATE TABLE transcript_segments (
    id INTEGER PRIMARY KEY,
    video_id INTEGER,
    start_time REAL,
    end_time REAL,
    text TEXT,
    confidence REAL,
    FOREIGN KEY (video_id) REFERENCES videos(id)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE transcripts USING fts5(
    video_id UNINDEXED,
    start_time UNINDEXED,
    end_time UNINDEXED,
    text,
    confidence UNINDEXED
);
```

## Current Limitations (MVP)

- **CPU-heavy Transcription**: Whisper runs locally and can be slow on long videos
- **No Video Playback**: Cannot play videos or jump to timestamps
- **Basic Metadata**: No video duration or thumbnail extraction
- **No Semantic Search**: Only keyword-based search currently

## Next Steps (Full Implementation)

1. **Enhanced Search**:
   - Add semantic search capabilities
   - Implement search suggestions and history
   
2. **Video Player Integration**:
   - Embed video player with timestamp navigation
   - Add thumbnail generation
   
3. **Performance Optimizations**:
   - Parallel job processing and smarter prioritisation
   - Incremental indexing for large collections

4. **UI/UX Improvements**:
   - Dark mode support
   - Keyboard shortcuts
   - Better progress indicators

## Transcription Quality Notes

- **Latest diagnostic run (large >500MB sample)**  
  - Worker defaults: 30s chunk length, 5s stride, conditioning enabled (see `src/main/transcription/whisper-transcriber.ts`).  
  - Outcome: 417 raw segments -> 116 loop removals -> 301 retained segments. Transcript is longer than previous runs but still contains repeated passages.

- **Override experiment (20s/4s + higher token cap)**  
  - Override values: 20s chunk length, 4s stride, conditioning enabled, `maxContextLength = 150`, `model = 'Xenova/whisper-small'`, `max_new_tokens = 200`.  
  - Outcome: 400 raw segments -> 146 loop removals -> 254 retained segments (36.5% reduction). Duplication shifted to repeated `[Growling]` segments and overall transcript length decreased, so this knob mix regressed quality.

- **Immediate experiments to queue**
  1. **Inference knobs**: trial runs removing or increasing `max_new_tokens`, and adjust `log_prob_threshold` / `no_speech_threshold` to see if confidence filtering reduces loops.
  2. **Model capacity**: re-run the same clip with higher checkpoints (`Xenova/whisper-small`, `...-medium`, `...-large` if available locally) to compare duplication rates versus runtime.
  3. **Chunk overlap**: test a tighter stride (e.g., 4s) while keeping 30s chunks to measure whether additional context lowers repetition.
  4. **Diagnostics discipline**: after each change, capture the raw/loop-removed/final segment counts (and any runtime notes) so the loop-removal trend stays measurable between experiments.

- **How to stage a manual override test**
  - Open `src/main/transcription/index.ts` and locate `TranscriptionOrchestrator.processTranscriptionJob`.
  - Right before the existing `const whisperOptions = { ... }` block, add a temporary object for the knobs you want to try:
    ```ts
    // TEMP: experiment with alternative defaults
    const testOptions = {
      chunkLength: 20,
      strideLength: 4,
      conditionOnPreviousText: true,
      maxContextLength: 150,
      model: 'Xenova/whisper-small'
    };
    ```
  - When calling `whisperTranscriber.transcribeAudio(...)`, pass the merge of the experiment values and the normal options so any explicit UI overrides still win:
    ```ts
    const transcriptionResult = await this.whisperTranscriber.transcribeAudio(
      audioResult.outputPath!,
      { ...testOptions, ...whisperOptions }
    );
    ```
  - To probe the `max_new_tokens` behaviour, adjust the conditional in `src/main/transcription/whisper-worker.ts` (search `// Add max_new_tokens`) and set it to `undefined`, a higher ceiling, or your experimental value.
  - Run the large sample video, record the raw/loop-removed/final counts printed by the worker logs, then revert the temporary object once the experiment is logged.

- **Rollback plan (Step back one knob at a time)**
  1. **Undo the `max_new_tokens` bump first**  
     - Open `src/main/transcription/whisper-worker.ts` and find the block that currently reads:
       ```ts
       // TEMP: experiment with max_new_tokens behavior
       if (isLargeFile) {
         transcriptionOptions.max_new_tokens = 200; // Experimental higher value
       }
       ```
     - Replace it with the original behavior so large files reuse their context length as the cap:
       ```ts
       if (isLargeFile) {
         transcriptionOptions.max_new_tokens = maxContextLength;
       }
       ```
       (Alternatively, remove the assignment entirely to let the worker defaults kick in.)
     - Keep the 20s/4s override inside `TranscriptionOrchestrator.processTranscriptionJob` untouched during this test so you isolate the effect of the token cap.  
     - Re-run the large sample clip and log the diagnostic summary (`raw -> removed -> retained`) before making any other tweaks.
  2. **Only after capturing those results** should you revisit chunk length, stride, or model changes.

- **Readable diagnostic timestamps**
  - Diagnostic files (`temp/whisper-diagnostic-*.json`) currently use a raw `Date.now()` value, which is hard to correlate with wall-clock experiments.  
  - Update `src/main/transcription/whisper-worker.ts` so the file name includes a readable stamp:  
    1. Create a helper (e.g., `formatDiagnosticTimestamp`) that converts a JS `Date` into `HHmmDDMMYYYY` (example: `160027102025` for 16:00 on 27 Oct 2025).  
    2. When generating the file name, build both the millisecond epoch (for metadata) and the formatted string, then use the human-readable label in ``whisper-diagnostic-${label}.json``.  
    3. Continue writing the numeric epoch inside the JSON (`timestamp` field) so automated tooling can still sort by time.  
  - After changing the formatter, re-run a test to confirm the file name uses the new pattern and that the JSON still contains the diagnostic data.

## Backend Feature: Persist Transcription Diagnostics Per Run

Persist the metrics you already log for every Whisper execution so they can be analyzed later. The goal is to write a concise record into SQLite whenever a transcription finishes and make it queryable by backend code.

- **Schema changes (`src/main/database/schema.sql`)**
  - Append a new table definition; keep the existing foreign key conventions:
    ```sql
    CREATE TABLE IF NOT EXISTS transcription_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        run_timestamp TEXT NOT NULL,
        model TEXT,
        chunk_length INTEGER,
        stride_length INTEGER,
        condition_on_previous_text INTEGER,
        max_context_length INTEGER,
        adaptive_chunking INTEGER,
        max_new_tokens INTEGER,
        raw_segments INTEGER,
        removed_segments INTEGER,
        final_segments INTEGER,
        reduction_pct REAL,
        diagnostic_file TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_transcription_runs_video_time
      ON transcription_runs(video_id, run_timestamp DESC);
    ```
  - Call the same `CREATE TABLE IF NOT EXISTS` SQL from the database bootstrap so existing installs migrate automatically (no separate migration runner is required).

- **Shared types (`src/shared/types.ts`)**
  - Add a `TranscriptionRunRecord` interface containing the columns above (with camelCase property names) plus optional `durationSeconds?: number` if you want to store it later.

- **Database API (`src/main/database/database.ts`)**
  - Extend the `VideoDatabase` class with two new methods:
    ```ts
    recordTranscriptionRun(run: TranscriptionRunRecord): void;
    getTranscriptionRuns(videoId: number, limit?: number): TranscriptionRunRecord[];
    ```
  - Implement inserts with prepared statements when SQLite is available, including boolean columns converted to 0/1. Mirror the methods in the in-memory fallback so diagnostics are still available if SQLite is disabled.
  - Load precompiled statements during class construction to avoid recompiling per call. For example, create `this.insertTranscriptionRunStmt = this.db.prepare(...);` guarded by the `isAvailable` flag.

- **Worker payload (`src/main/transcription/whisper-worker.ts`)**
  - Accept the `videoId` in the worker request payload (update the `TranscriptionRequest` interface and ensure `whisper-transcriber.ts` forwards it).
  - After computing `rawChunkCount`, `removedSegments.length`, and `segments.length`, assemble a `diagnostics` object that includes:
    ```ts
    {
      videoId,
      runTimestamp: new Date(diagnosticTimestamp).toISOString(),
      model: transcriptionOptions.model,
      chunkLength: transcriptionOptions.chunk_length ?? chunkLength,
      strideLength: transcriptionOptions.stride_length ?? strideLength,
      conditionOnPreviousText,
      maxContextLength,
      adaptiveChunking,
      maxNewTokens: transcriptionOptions.max_new_tokens ?? null,
      rawSegments: rawChunkCount,
      removedSegments: removedSegments.length,
      finalSegments: segments.length,
      reductionPct: rawChunkCount > 0 ? (rawChunkCount - segments.length) / rawChunkCount : 0,
      diagnosticFile
    }
    ```
  - Include this diagnostics object in the worker’s `result` message so the main thread can persist it without opening a database connection inside the worker.

- **Transcriber bridge (`src/main/transcription/whisper-transcriber.ts`)**
  - Update the `TranscriptionResult` interface to carry an optional `diagnostics?: TranscriptionRunRecord`.
  - Ensure the `transcribe` call passes `videoId` through to the worker and forwards the diagnostics data from the worker back to the orchestrator.

- **Orchestrator hook (`src/main/transcription/index.ts`)**
  - After segments are validated (right before or after `insertTranscriptSegments`), call `this.database.recordTranscriptionRun` with the diagnostics returned by the worker. Guard against cases where diagnostics are missing (e.g., failure paths) and still write a record when no segments were produced.
  - If `TranscriptionResult.success` is false, consider recording a partial run with zeroed `finalSegments` so you can reason about failures later.

- **Memory cleanup**
  - Append the diagnostic file path (`diagnosticFile`) to the existing cleanup routine if you want to prune old JSONs after persistence. This is optional but keeps `temp/` tidy.

Implementation checklist: update the schema, extend shared types, wire the database helper, forward the diagnostics payload from worker → transcriber → orchestrator, and invoke the insert when a run completes. Once done, you can fetch recent runs with `getTranscriptionRuns(videoId, limit)` for dashboards or CLI reporting.

## Git Repository Cleanup

If you have too many uncommitted changes:

```bash
# Remove untracked files (be careful!)
git clean -fd

# Reset staged changes
git reset HEAD .

# Add only the files you want
git add src/ package.json README.md .gitignore

# Commit your changes
git commit -m "Update video search application"
```

## Troubleshooting

- **Database Issues**: Delete the database file in your user data directory to reset
- **Build Errors**: Ensure all dependencies are installed with `npm install`
- **Permission Errors**: Check app permissions for reading video folders

## License

MIT License

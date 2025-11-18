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

### Current issues:
- Transcripts from longer videos don't return accurate transcripts, whilst short ones (videos <100mb) are relatively accurate.
- `temp/whisper-diagnostic-20251112193848.json` (10 MB/352 s) is the “good” run: 67 raw chunks, 0 removals, coherent historical narrative. 
- The “bad” long files (temp/whisper-diagnostic-1761190549995.json, …1761541369876.json, …20251110191309.json) all show 400+ raw chunks, loop pruning wiping out ~30‑37 %, and the surviving text devolves into generic short sentences near the 1400‑2200 s marks. So the model isn’t crashing; it is repeatedly re‑emitting low-confidence fragments as the clip gets longer.
- Every clip that Whisper labels “large” gets `max_new_tokens = maxContextLength` in `src/main/transcription/whisper-worker.ts` (lines 167-217). That cap is 100 (or 150/200 when you manually override), whereas Whisper’s own decoder expects ~448 tokens for a 30 s chunk. We’re stopping generation after ~20‑30 tokens worth of speech and relying on the next chunk (with `condition_on_previous_text` still on) to finish the thought, which amplifies duplication as the chain grows to several hundred chunks.
- The worker always loads `@xenova/transformers` with `{ quantized: true }` (src/main/transcription/whisper-worker.ts (lines 62-93)). That means every knob you test is still an int8 checkpoint. Feeding hundreds of chunks back into `condition_on_previous_text` with an `int8` model is a known way to accumulate hallucinations; the 6‑minute sample (67 chunks) stays fine simply because the chain is short.
- There’s at least one different failure signature in `temp/whisper-diagnostic-20251110192342.json`: an 11‑minute, 21 MB file turned into only four chunks and the last chunk is 680 s of [silence]. That usually means the extracted WAV is basically zeroed after the intro (either we picked the wrong audio stream or mono down-mixing cancelled the dialogue). That points to the audio extraction path, not Whisper knobs.

### Experiments to narrow down the cause:
1. Lift the decoder ceiling for long clips:
- Temporarily remove or bump the assignment in src/main/transcription/whisper-worker.ts (lines 208-217) so that max_new_tokens is undefined or ≥448 when chunk_length_s ≥20. Capture before/after diagnostics; if the loop-removal rate drops, the cap was starving the decoder.

2. Turn off quantization for a control run: 
- In `loadModel` (src/main/transcription/whisper-worker.ts (lines 62-93)), set quantized: false and run the 25‑minute clip once. If the transcript is suddenly accurate, we know the int8 models are the real bottleneck and you either need to ship the full-precision checkpoints or only quantize for short clips.

3. Split giant clips into smaller jobs: 
- Use FFmpeg to cut the WAV into ~5‑minute slices (ffmpeg -i bigfile.wav -f segment -segment_time 300 …), transcribe each slice with condition_on_previous_text=false, then offset timestamps before storing. If each slice matches the expected text, the degradation is purely from very long conditioning chains and we can automate that slicing path for >15‑minute files.

4. Instrument the diagnostics with model signals: 
- Record `avg_logprob`, `no_speech_prob`, and `compression_ratio` from `result.chunks` inside processSegments (src/main/transcription/whisper-worker.ts (lines 339-444)). Seeing those values plotted over time will tell you whether the model loses confidence gradually (pointing to conditioning drift) or whether certain minutes of audio are simply too quiet.

5. Verify the extracted audio stream: 
- Run `ffprobe` "temp/audio/57.wav" and confirm channel layout/levels. For multi-track movies, add .audioCodec('pcm_s16le').outputOptions(['-map 0:a:0']) and test both mono and stereo extractions. The “4 chunks with 680 s of silence” log strongly suggests that the current downmix sometimes picks the wrong track or cancels the dialogue channel; fixing the extractor would resolve those runs without touching Whisper.

6. Sanity-check against a reference implementation: 
- Run the same long clip through whisper.cpp/faster-whisper (even a short excerpt) and compare transcripts. If the reference also hallucinates, the source audio is genuinely hard; if it succeeds, the issue is isolated to the Xenova worker.

These checks should give an indication as the underlying cause:
(a) decoder limits
(b) quantized conditioning drift
(c) the audio that is being fed to the worker

From there, we can then decide whether to change the defaults in `whisper-worker.ts`, switch models, or patch the extractor.

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

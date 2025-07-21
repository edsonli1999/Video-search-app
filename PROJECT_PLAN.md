# Video Search Desktop Application - Complete Project Plan

## Project Overview
A cross-platform desktop application that enables users to search their personal video files by spoken content using local AI transcription, working completely offline.

## Current Status Summary
- ✅ **Infrastructure**: Electron app, SQLite database, video scanning, search UI
- ✅ **Database**: Full-text search ready with FTS5, transcript storage schema implemented
- ✅ **Video Management**: Folder selection, file scanning, metadata storage
- ❌ **CRITICAL MISSING**: Real transcription pipeline (currently mocked with dummy data)

### 🔧 Build Architecture Resolution
**Issue Resolved**: Fixed critical module resolution problem that was preventing proper application builds.

**Solution Implemented**: Hybrid build approach
- **Main Process**: Uses TypeScript compiler (`tsc`) to preserve module structure
- **Renderer Process**: Uses webpack for proper web-like bundling
- **Preload Script**: Compiled with TypeScript maintaining proper module resolution

**Why This Approach is Superior**:
1. **Node.js Compatibility**: Main process modules remain as separate files, allowing proper Node.js module resolution
2. **Native Module Support**: Better-sqlite3 and other native modules work correctly
3. **Dynamic Imports**: File system operations and dynamic requires function properly
4. **Debugging**: Readable, non-minified code in the main process for easier debugging

## Tech Stack
- **Frontend**: Electron + React + TypeScript
- **Backend**: Node.js + TypeScript
- **Database**: SQLite with FTS5 (Full-Text Search) - *Functional*
- **AI Transcription**: OpenAI Whisper (local implementation) - *Not implemented, currently mocked*
- **Video Processing**: FFmpeg - *Not implemented*
- **UI Framework**: Basic CSS (ShadCN planned for Phase 6)
- **Build Tools**: TypeScript Compiler (main), Webpack (renderer), Electron Builder

## Project Structure (Current)
```
video-search-app/
├── src/
│   ├── main/                 # Electron main process (TypeScript compiled)
│   │   ├── main.ts          ✅ Complete
│   │   ├── preload.ts       ✅ Complete (with inline types)
│   │   ├── database/
│   │   │   ├── schema.sql   ✅ Complete
│   │   │   └── database.ts  ✅ Complete and functional
│   │   ├── video/
│   │   │   └── video-scanner.ts ✅ Complete
│   │   ├── transcription/   ❌ TO BE CREATED (Phase 3)
│   │   │   ├── audio-extractor.ts
│   │   │   ├── whisper-transcriber.ts
│   │   │   └── transcription-queue.ts
│   │   └── ipc/
│   │       └── handlers.ts  🔄 Complete but with mock transcription
│   ├── renderer/             # React frontend (Webpack bundled)
│   │   ├── App.tsx          ✅ Complete UI implementation
│   │   ├── App.css          ✅ Basic styling
│   │   ├── index.tsx        ✅ Complete
│   │   └── index.html       ✅ Complete
│   └── shared/               # Shared types and utilities
│       └── types.ts         ✅ Complete
├── dist/                     # Build output
└── temp/                     ❌ TO BE CREATED (Phase 3)
    └── audio/               # Temporary audio files for transcription
```

## Database Schema (Implemented but Not Functional)
```sql
-- Videos table
CREATE TABLE videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    duration REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    transcription_status TEXT DEFAULT 'pending'
);

-- Transcripts table with FTS5
CREATE VIRTUAL TABLE transcripts USING fts5(
    video_id UNINDEXED,
    start_time UNINDEXED,
    end_time UNINDEXED,
    text,
    confidence UNINDEXED,
    content='transcript_segments',
    content_rowid='id'
);

-- Actual transcript segments
CREATE TABLE transcript_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL,
    confidence REAL,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- Search history
CREATE TABLE search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Development Phases

### ✅ Phase 1: Project Setup & Basic Structure (COMPLETE)
**Status**: All deliverables completed, build architecture resolved, database functional

### ✅ Phase 2: Video File Management (COMPLETE) 
**Status**: Core functionality complete, enhancements planned for later phases

### 🚨 Phase 3: Audio Extraction & Transcription Pipeline (CRITICAL - IN PROGRESS)

**Current Issue**: Core functionality is completely mocked - app appears functional but transcription generates dummy data.

**Implementation Location**: Replace mock handler in `src/main/ipc/handlers.ts` (lines 84-130)

#### 📋 Implementation Specifications

**1. Dependencies to Add**
```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0",  // Local Whisper implementation
    "events": "^3.3.0"                   // Progress event handling
  }
}
```

**2. Whisper Integration**
- **Library**: Use `@xenova/transformers` for local Whisper implementation
- **Model**: `whisper-base` for balance of speed/accuracy (fallback to `whisper-tiny` if memory issues)
- **Format**: Expects 16kHz mono WAV audio input
- **Output**: Timestamped transcript segments with confidence scores
- **Performance Target**: >1x real-time transcription speed

**3. FFmpeg Audio Extraction**
- **Input**: Video files from database (all supported formats)
- **Output**: `temp/audio/{videoId}.wav` (16kHz mono WAV)
- **Configuration**:
  ```typescript
  ffmpeg(videoPath)
    .audioFrequency(16000)
    .audioChannels(1)
    .audioCodec('pcm_s16le')
    .format('wav')
  ```
- **Cleanup**: Auto-delete temp files after successful transcription

**4. Progress Tracking System**
- **IPC Events**: Send `transcription-progress` events to renderer
- **Progress Stages**:
  - Audio Extraction: 0-30%
  - Whisper Transcription: 30-90% 
  - Database Storage: 90-100%
- **Data Format**: `{ videoId, stage, progress, message }`
- **UI Integration**: Update existing transcription status indicators

**5. Queue Management**
- **Implementation**: Simple array-based in-memory queue
- **Concurrency**: Process one video at a time initially
- **Status Flow**: 'queued' → 'processing' → 'completed'/'failed'
- **Queue Operations**: add, remove, getStatus, clearCompleted

**6. Error Handling Strategy**
- **Error Types**:
  - `AudioExtractionError`: FFmpeg failures, file corruption
  - `TranscriptionError`: Whisper model issues, memory problems
  - `DatabaseError`: Storage failures
- **Recovery**: Set video status to 'failed' with detailed error message
- **Partial Failures**: Clean up temp files even on failure
- **User Feedback**: Display specific error messages in UI

**7. File Management**
- **Temp Directory**: `{app-data}/temp/audio/`
- **Naming Convention**: `{videoId}.wav`
- **Size Limits**: Warn for videos >2GB, fail gracefully for >4GB
- **Disk Space**: Check available space before extraction
- **Cleanup Strategy**: Delete temp files after completion/failure

#### 🔧 Files to Create/Modify

**New Files**:
- `src/main/transcription/audio-extractor.ts` - FFmpeg wrapper
- `src/main/transcription/whisper-transcriber.ts` - Whisper integration  
- `src/main/transcription/transcription-queue.ts` - Queue management
- `src/main/transcription/index.ts` - Main transcription orchestrator

**Modified Files**:
- `src/main/ipc/handlers.ts` - Replace TRANSCRIBE_VIDEO handler (lines 84-130)
- `package.json` - Add new dependencies
- `src/renderer/App.tsx` - Add progress event listeners

#### ✅ Success Criteria
- [ ] Audio extraction from video files using FFmpeg
- [ ] Local Whisper transcription with timestamped segments
- [ ] Progress updates visible in UI during transcription
- [ ] Transcript segments stored in existing database schema
- [ ] Error handling with specific error messages
- [ ] Automatic cleanup of temporary files
- [ ] Queue system for multiple video transcription
- [ ] Performance: >1x real-time transcription speed

**Expected Implementation Time**: 4-6 hours for experienced developer

### 🔄 Phase 4: Search Implementation (READY FOR TRANSCRIPTS)
**Status**: Infrastructure complete, waiting for real transcript data from Phase 3

### 📋 Phase 5: Video Player Integration (PLANNED)
### 📋 Phase 6: UI/UX Polish (PLANNED)  
### 📋 Phase 7: Performance & Optimization (PLANNED)
### 📋 Phase 8: Testing & Distribution (PLANNED)

## Next Steps (Critical Priorities)

### 1. Implement Real Transcription (CRITICAL - Phase 3)
- **Priority**: URGENT
- **Issue**: Transcription is completely mocked with hardcoded data
- **Impact**: Core functionality is not operational despite working UI
- **Tasks**:
  - Research and implement FFmpeg integration for audio extraction
  - Set up Whisper integration (recommend whisper.cpp for better performance)
  - Replace mock transcription system with real implementation
  - Test transcription pipeline end-to-end

### 2. Enhanced Video Metadata Extraction (Phase 2 Enhancement)
- **Priority**: MEDIUM
- **Issue**: Currently only basic file metadata is stored
- **Tasks**:
  - Extract actual video metadata (duration, resolution, codec info)
  - Add video thumbnail generation (optional)
  - Improve error handling for corrupted video files
  - Enhance UI for video metadata display

### 3. Search Enhancement (Phase 4)
- **Priority**: LOW (ready for transcripts)
- **Issue**: Basic search works but could be enhanced
- **Tasks**:
  - Implement search result ranking and relevance scoring
  - Add search term highlighting in results
  - Add advanced search options (time range, specific videos)
  - Optimize search performance for large transcript datasets

### 4. Code Quality Improvements
- **Priority**: MEDIUM
- **Tasks**:
  - Add proper error handling and logging throughout
  - Implement proper TypeScript strict mode compliance
  - Add JSDoc comments for better documentation
  - Refactor inline types in preload.ts (consider moving back to shared types)

## Technical Considerations

### Critical Architecture Requirements
- **Main Process**: Always use TypeScript compiler, never webpack
- **Renderer Process**: Use webpack for proper web bundling  
- **Native Modules**: Ensure they remain unbundled and properly linked
- **Worker Threads**: Use for transcription to avoid blocking UI
- **Memory Management**: Monitor memory usage during transcription

### Performance Targets
- Application starts in <3 seconds ✅ 
- Video scanning: <1 second per 100 files ✅
- Transcription speed: >1x real-time ❌ (Phase 3)
- Memory usage: <500MB for 1000 videos ❌ (To be tested)
- Search response time: <200ms ✅

### Security & Validation
- Validate all file paths to prevent directory traversal
- Sanitize database inputs
- Handle malformed video files gracefully
- Check available disk space before operations

## Dependencies (Current)
```json
{
  "dependencies": {
    "better-sqlite3": "^9.6.0",
    "fluent-ffmpeg": "^2.1.2", 
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

## Assessment
**Infrastructure Status**: ✅ Solid foundation with functional database, UI, and search
**Critical Blocker**: ❌ Mock transcription prevents core functionality  
**Next Priority**: Implement Phase 3 transcription pipeline
**Timeline**: Once Phase 3 is complete, app will be feature-complete for core functionality

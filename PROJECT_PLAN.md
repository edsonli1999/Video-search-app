# Video Search Desktop Application - Complete Project Plan

## Project Overview
A cross-platform desktop application that enables users to search their personal video files by spoken content using local AI transcription, working completely offline.

## Current Status Summary
- ✅ **Infrastructure**: Electron app, SQLite database, video scanning, search UI
- ✅ **Database**: Full-text search ready with FTS5, transcript storage schema implemented
- ✅ **Video Management**: Folder selection, file scanning, metadata storage
- ✅ **Transcription Pipeline**: Native FFmpeg + Whisper working, needs accuracy improvements

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
- **AI Transcription**: Xenova/transformers (Whisper) - *Implemented, needs accuracy tuning*
- **Video Processing**: FFmpeg-static (native binaries) - *Implemented*
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
│   │   ├── transcription/   ✅ Complete
│   │   │   ├── audio-extractor.ts
│   │   │   ├── whisper-transcriber.ts
│   │   │   ├── transcription-queue.ts
│   │   │   └── index.ts
│   │   └── ipc/
│   │       └── handlers.ts  ✅ Complete with real transcription
│   ├── renderer/             # React frontend (Webpack bundled)
│   │   ├── App.tsx          ✅ Complete UI implementation
│   │   ├── App.css          ✅ Basic styling
│   │   ├── index.tsx        ✅ Complete
│   │   └── index.html       ✅ Complete
│   └── shared/               # Shared types and utilities
│       └── types.ts         ✅ Complete
├── dist/                     # Build output
└── temp/                     ✅ Auto-created during transcription
    └── audio/               # Temporary audio files (auto-cleanup)
```

## Database Schema (Implemented and Functional)
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

### ✅ Phase 3: Audio Extraction & Transcription Pipeline (COMPLETE + OPTIMIZED)

**Status**: ⭐ **FULLY FUNCTIONAL** - Core pipeline working smoothly with recent critical improvements

#### 🎉 **Implementation Complete + Recent Enhancements**

**FFmpeg Solution**: After evaluating WASM FFmpeg (browser-only limitation), implemented native FFmpeg using `ffmpeg-static` for automatic binary management across platforms.

**Current Architecture**:
- **Audio Extraction**: Native FFmpeg via `ffmpeg-static` + `fluent-ffmpeg` 
- **Transcription**: Xenova/transformers with whisper-base model **in worker thread**
- **Queue System**: Event-driven job processing with IPC notifications
- **Progress Tracking**: Real-time updates to frontend via IPC events
- **File Management**: Auto-cleanup of temp files after processing
- **Duplicate Prevention**: Automatic segment deduplication and merging

#### ✅ **Recently Completed Critical Improvements**
- ✅ **Worker Thread Implementation**: Transcription now runs in background without freezing UI
- ✅ **Duplicate Segment Prevention**: Smart deduplication system merges overlapping segments  
- ✅ **Re-transcription Database Clearing**: Proper cleanup of old segments before re-transcription
- ✅ **Enhanced Error Handling**: Better error reporting and recovery

#### ✅ **Previously Completed Features**
- ✅ Native FFmpeg integration (cross-platform, auto-configured)
- ✅ Whisper transcription with timestamped segments  
- ✅ Real-time progress updates in UI
- ✅ Transcript storage in database with FTS5 search
- ✅ Error handling with specific error messages
- ✅ Queue management with job status tracking
- ✅ Automatic temp file cleanup
- ✅ Re-transcription capability for testing/debugging

#### 🔧 **Future Optimizations** (Lower Priority)
- **Transcription Accuracy**: Fine-tune Whisper parameters, language detection
- **Performance**: Optimize audio preprocessing, consider larger Whisper models
- **User Experience**: Add transcription cancellation, batch processing UI

### 🔄 Phase 4: Search Implementation & UI Polish (IN PROGRESS)
**Status**: Infrastructure complete, FTS5 search working with real transcript data

#### 🐛 **Critical Issue Identified**
- **Search Input Bug**: Search triggers on every keystroke causing focus loss and poor UX
- **Priority**: CRITICAL - Must fix immediately for app usability

#### 📋 **Planned UI Improvements**
- **Tab-Based Interface**: Separate views for current folder vs all transcribed videos
- **Enhanced Navigation**: Better organization and video library management

### 📋 Phase 5: Video Player Integration (PLANNED)
### 📋 Phase 6: UI/UX Polish (PLANNED)  
### 📋 Phase 7: Performance & Optimization (PLANNED)
### 📋 Phase 8: Testing & Distribution (PLANNED)

## Next Steps (Critical Priorities)

### 1. 🚨 Fix Search Input Bug (Phase 4 - CRITICAL)
- **Priority**: HIGH - **BLOCKING UX ISSUE**
- **Issue**: Search input loses focus on every keystroke due to immediate `handleSearch()` calls
- **Tasks**:
  - Implement debounced search (300ms delay after typing stops)
  - Fix onChange handler to prevent focus loss
  - Improve search UX with proper loading states
  - Test search functionality thoroughly

### 2. 🎨 UI Tab Implementation (Phase 4 - UX Enhancement)
- **Priority**: MEDIUM
- **Issue**: Current single-view interface lacks organization
- **Tasks**:
  - Create tab-based navigation system
  - **Tab 1**: Current folder videos (filtered view)
  - **Tab 2**: All transcribed videos (master library)
  - Implement proper routing/state management between tabs
  - Enhance video display and filtering options

### 3. Enhanced Video Metadata Extraction (Phase 2 Enhancement)
- **Priority**: LOW-MEDIUM
- **Issue**: Currently only basic file metadata is stored
- **Tasks**:
  - Extract actual video metadata (duration, resolution, codec info)
  - Add video thumbnail generation (optional)
  - Improve error handling for corrupted video files
  - Enhance UI for video metadata display

### 4. Advanced Search Features (Phase 4 Enhancement)
- **Priority**: LOW (after basic search is fixed)
- **Issue**: Basic search works but could be enhanced
- **Tasks**:
  - Implement search result ranking and relevance scoring
  - Add search term highlighting in results
  - Add advanced search options (time range, specific videos)
  - Optimize search performance for large transcript datasets

### 5. Code Quality & Performance Improvements
- **Priority**: LOW
- **Tasks**:
  - Add proper error handling and logging throughout
  - Implement proper TypeScript strict mode compliance
  - Add JSDoc comments for better documentation
  - Refactor inline types in preload.ts (consider moving back to shared types)
  - Memory usage optimization for large video libraries

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
- Transcription speed: >1x real-time ✅ 
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
    "@xenova/transformers": "^2.17.2",
    "better-sqlite3": "^9.6.0",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "wavefile": "^11.0.0"
  }
}
```

## Assessment
**Infrastructure Status**: ✅ Solid foundation with functional database, UI, and search
**Core Functionality**: ✅ Complete transcription pipeline working end-to-end with worker threads
**Recent Progress**: ✅ Fixed app freezing, duplicate segments, and re-transcription issues
**Current Focus**: 🚨 Critical search input bug fix, then UI/UX tab implementation
**Timeline**: App has strong core functionality, needs UX polish to be production-ready
**Status**: Ready for Phase 4 completion (search + UI improvements)

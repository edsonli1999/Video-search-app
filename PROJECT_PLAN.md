# Video Search Desktop Application - Complete Project Plan

## Project Overview
A cross-platform desktop application that enables users to search their personal video files by spoken content using local AI transcription, working completely offline.

## Tech Stack
- **Frontend**: Electron + React + TypeScript
- **Backend**: Node.js + TypeScript
- **Database**: SQLite with FTS5 (Full-Text Search)
- **AI Transcription**: OpenAI Whisper (via whisper.cpp or faster-whisper)
- **Video Processing**: FFmpeg
- **UI Framework**: Material-UI or Tailwind CSS
- **State Management**: React Context/Redux Toolkit
- **Build Tools**: Webpack, Electron Builder

## Project Structure
```
video-search-app/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.ts
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   ├── database.ts
│   │   │   └── migrations/
│   │   ├── transcription/
│   │   │   ├── whisper.ts
│   │   │   └── audio-extractor.ts
│   │   ├── video/
│   │   │   └── video-processor.ts
│   │   └── ipc/
│   │       └── handlers.ts
│   ├── renderer/             # React frontend
│   │   ├── components/
│   │   │   ├── VideoSelector/
│   │   │   ├── SearchInterface/
│   │   │   ├── VideoPlayer/
│   │   │   ├── TranscriptViewer/
│   │   │   └── ProgressIndicator/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── index.tsx
│   └── shared/               # Shared types and utilities
│       ├── types.ts
│       └── constants.ts
├── assets/
├── build/
├── dist/
├── package.json
├── tsconfig.json
├── webpack.config.js
└── electron-builder.json
```

## Database Schema
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
    transcription_status TEXT DEFAULT 'pending' -- pending, processing, completed, failed
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

### Phase 1: Project Setup & Basic Structure (Week 1)
**Goals**: Set up development environment and basic Electron app
- [ ] Initialize Node.js project with TypeScript
- [ ] Configure Electron with React
- [ ] Set up build tools (Webpack, Electron Builder)
- [ ] Create basic window and navigation
- [ ] Set up SQLite database connection
- [ ] Implement basic database schema

**Deliverables**:
- Working Electron app that opens
- Database connection established
- Basic project structure in place

### Phase 2: Video File Management (Week 2)
**Goals**: Implement video file selection and management
- [ ] Create folder selection dialog
- [ ] Scan folders for video files (.mp4, .mkv, .avi, .mov, .webm)
- [ ] Store video metadata in database
- [ ] Display video list in UI
- [ ] Handle file path validation and error cases

**Deliverables**:
- Users can select video folders
- Video files are detected and listed
- Basic video metadata stored

### Phase 3: Audio Extraction & Transcription Pipeline (Week 3-4)
**Goals**: Implement core transcription functionality
- [ ] Integrate FFmpeg for audio extraction
- [ ] Set up Whisper integration (whisper.cpp or Python wrapper)
- [ ] Create transcription queue system
- [ ] Implement progress tracking
- [ ] Store transcripts with timestamps
- [ ] Handle transcription errors gracefully

**Deliverables**:
- Audio extraction from video files
- Working transcription pipeline
- Transcripts stored with timestamps
- Progress indication for users

### Phase 4: Search Implementation (Week 5)
**Goals**: Implement search functionality
- [ ] Full-text search using SQLite FTS5
- [ ] Search result ranking and relevance
- [ ] Highlight search terms in results
- [ ] Search history functionality
- [ ] Advanced search options (time range, specific videos)

**Deliverables**:
- Working keyword search
- Search results with timestamps
- Search history tracking

### Phase 5: Video Player Integration (Week 6)
**Goals**: Implement video playback with timestamp navigation
- [ ] Integrate video player component
- [ ] Implement seek-to-timestamp functionality
- [ ] Create transcript viewer with clickable timestamps
- [ ] Synchronize video playback with transcript
- [ ] Handle multiple video formats

**Deliverables**:
- Video player with timestamp navigation
- Synchronized transcript viewing
- Click-to-play functionality

### Phase 6: UI/UX Polish (Week 7)
**Goals**: Improve user interface and experience
- [ ] Responsive design implementation
- [ ] Dark/light theme support
- [ ] Keyboard shortcuts
- [ ] Settings panel (transcription quality, storage location)
- [ ] Error handling and user feedback
- [ ] Loading states and animations

**Deliverables**:
- Polished, user-friendly interface
- Settings and preferences
- Comprehensive error handling

### Phase 7: Performance & Optimization (Week 8)
**Goals**: Optimize performance and add advanced features
- [ ] Database indexing optimization
- [ ] Lazy loading for large video collections
- [ ] Background transcription processing
- [ ] Memory usage optimization
- [ ] Semantic search implementation (optional)
- [ ] Export/import functionality

**Deliverables**:
- Optimized performance
- Advanced search capabilities
- Data export/import features

### Phase 8: Testing & Distribution (Week 9-10)
**Goals**: Prepare for distribution
- [ ] Unit tests for core functionality
- [ ] Integration tests
- [ ] Cross-platform testing (Windows, macOS, Linux)
- [ ] Build automation and packaging
- [ ] Documentation and user guide
- [ ] Performance benchmarking

**Deliverables**:
- Tested, stable application
- Distribution packages for all platforms
- User documentation

## Technical Considerations

### Performance
- Use worker threads for transcription to avoid blocking UI
- Implement database connection pooling
- Cache frequently accessed data
- Optimize video file scanning with async operations

### Security
- Validate all file paths to prevent directory traversal
- Sanitize database inputs
- Handle malformed video files gracefully

### Scalability
- Design for large video collections (1000+ files)
- Implement pagination for search results
- Consider database partitioning for very large datasets

### Cross-Platform Compatibility
- Use path.join() for file paths
- Test on Windows, macOS, and Linux
- Handle platform-specific video codecs

## Dependencies
```json
{
  "main": {
    "electron": "^latest",
    "better-sqlite3": "^latest",
    "fluent-ffmpeg": "^latest",
    "node-whisper": "^latest"
  },
  "renderer": {
    "react": "^18",
    "react-dom": "^18",
    "@mui/material": "^latest",
    "react-player": "^latest"
  },
  "dev": {
    "typescript": "^latest",
    "webpack": "^latest",
    "electron-builder": "^latest"
  }
}
```

## Success Metrics
- Application starts in <3 seconds
- Video scanning completes in <1 second per 100 files
- Transcription processes at >1x real-time speed
- Search results return in <500ms
- Memory usage stays <500MB for 1000 videos
- Cross-platform compatibility verified

## Risk Mitigation
- **Whisper Integration**: Have fallback to cloud API if local fails
- **FFmpeg Issues**: Include pre-built binaries for all platforms
- **Database Performance**: Implement proper indexing from start
- **Large Files**: Set reasonable file size limits and warnings
- **Cross-Platform**: Test early and often on all target platforms

This plan provides a structured approach to building a robust, offline video search application with clear milestones and deliverables for each phase.

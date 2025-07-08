# Video Search App - MVP

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
- ✅ **Mock Transcription**: Simulated AI transcription with dummy data
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

### 2. **Mock Transcription Process**
- Currently uses dummy transcript data for MVP
- Simulates AI transcription with realistic delay
- Stores transcript segments with timestamps and confidence scores
- Updates video transcription status in real-time

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
├── main/                     # Electron Main Process (Backend)
│   ├── main.ts              # Application entry point
│   ├── preload.ts           # IPC bridge for security
│   ├── database/            # SQLite database management
│   │   ├── database.ts      # Database operations & fallback
│   │   └── schema.sql       # Database schema with FTS5
│   ├── ipc/                 # Inter-Process Communication
│   │   └── handlers.ts      # All IPC request handlers
│   └── video/               # Video processing logic
│       └── video-scanner.ts # File system scanning
├── renderer/                # React Frontend (UI)
│   ├── App.tsx             # Main React component
│   ├── App.css             # Styling
│   ├── index.tsx           # React entry point
│   └── types/              # TypeScript definitions
└── shared/                  # Shared Types & Constants
    └── types.ts            # Common interfaces & IPC channels
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

- **Mock Transcription**: Uses dummy data instead of real AI transcription
- **No Video Playback**: Cannot play videos or jump to timestamps
- **Basic Metadata**: No video duration or thumbnail extraction
- **No Semantic Search**: Only keyword-based search currently

## Next Steps (Full Implementation)

1. **Real AI Transcription**: 
   - Integrate OpenAI Whisper for speech-to-text
   - Add FFmpeg for audio extraction
   
2. **Enhanced Search**:
   - Add semantic search capabilities
   - Implement search suggestions and history
   
3. **Video Player Integration**:
   - Embed video player with timestamp navigation
   - Add thumbnail generation
   
4. **Performance Optimizations**:
   - Background transcription queue
   - Incremental indexing for large collections
   
5. **UI/UX Improvements**:
   - Dark mode support
   - Keyboard shortcuts
   - Better progress indicators

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

# Video Search App - MVP

A desktop application that helps users search their personal video files by spoken content through search indexing.

## Features (MVP)

- ✅ **Folder Selection**: Select a folder containing video files
- ✅ **Video Scanning**: Automatically detect video files (.mp4, .mkv, .avi, .mov, .webm, .m4v, .wmv, .flv)
- ✅ **Database Storage**: Store video metadata in local SQLite database
- ✅ **Mock Transcription**: Simulate transcription process with dummy data
- ✅ **Full-Text Search**: Search through transcripts using SQLite FTS5
- ✅ **Search Results**: Display search results with timestamps
- ✅ **Video Library**: View all scanned videos with transcription status
- ✅ **Responsive UI**: Clean, modern interface with status indicators

## Tech Stack

- **Frontend**: Electron + React (JavaScript)
- **Backend**: Node.js + TypeScript
- **Database**: SQLite with FTS5 (Full-Text Search)
- **UI Styling**: Custom CSS
- **Build Tools**: Webpack, TypeScript Compiler

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

## Git Repository Cleanup

If you have too many uncommitted changes, you can clean up your git repository:

```bash
# Remove untracked files and directories (be careful!)
git clean -fd

# Reset any staged changes
git reset HEAD .

# Check what files are still modified
git status

# Add only the files you want to commit
git add src/ package.json README.md PROJECT_PLAN.md .gitignore

# Commit your changes
git commit -m "Add MVP video search application"
```

The `.gitignore` file has been updated to exclude:
- `node_modules/` - Dependencies
- `dist/` - Build outputs  
- `*.db` - Database files
- IDE and OS specific files

## Development

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

## How to Use

1. **Launch the app** using `npm start`

2. **Select Video Folder**: Click "Select Video Folder" to choose a directory containing your video files

3. **Scan Videos**: The app will automatically scan the selected folder and detect supported video formats

4. **Transcribe Videos**: Click the "Transcribe" button on any video card to start the transcription process (currently uses mock data)

5. **Search Transcripts**: Use the search bar to find specific content within transcribed videos

6. **View Results**: Search results show matching segments with timestamps

## Project Structure

```
video-search-app/
├── src/
│   ├── main/                 # Electron main process (TypeScript)
│   │   ├── main.ts          # Main application entry
│   │   ├── preload.ts       # Preload script for IPC
│   │   ├── database/        # SQLite database management
│   │   ├── video/           # Video file scanning
│   │   └── ipc/             # IPC handlers
│   ├── renderer/            # React frontend (JavaScript)
│   │   ├── index.js         # React app entry
│   │   ├── App.js           # Main React component
│   │   ├── App.css          # Styling
│   │   └── types/           # TypeScript definitions
│   └── shared/              # Shared types and constants
├── dist/                    # Built application
├── package.json
├── tsconfig.json           # TypeScript config for renderer
├── tsconfig.main.json      # TypeScript config for main
└── webpack.config.js       # Webpack config for renderer
```

## Architecture Diagram
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Electron/     │    │   Node.js        │    │   SQLite        │
│   React UI      │◄──►│   Backend        │◄──►│   Database      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   FFmpeg +       │
                       │   Whisper        │
                       └──────────────────┘


## Database Schema

The app uses SQLite with the following tables:

- **videos**: Store video file metadata
- **transcript_segments**: Store transcript text with timestamps
- **transcripts**: FTS5 virtual table for full-text search
- **search_history**: Track user search queries

## Current Limitations (MVP)

- **Mock Transcription**: Uses dummy transcript data instead of real AI transcription
- **No Video Player**: Cannot play videos within the app yet
- **Basic UI**: Minimal styling and features
- **No Real-time Updates**: Manual refresh needed for some operations

## Next Steps (Full Implementation)

1. **Real AI Transcription**: Integrate OpenAI Whisper for actual speech-to-text
2. **Video Player**: Add video playback with timestamp navigation
3. **FFmpeg Integration**: Extract audio and get video metadata
4. **Semantic Search**: Add AI-powered semantic search capabilities
5. **Advanced UI**: Improve design, add dark mode, keyboard shortcuts
6. **Performance Optimization**: Handle large video collections efficiently
7. **Cross-platform Testing**: Ensure compatibility across Windows, macOS, Linux

## Troubleshooting

- **Build Errors**: Make sure all dependencies are installed with `npm install`
- **Database Issues**: Delete the database file in your user data directory to reset
- **Permission Errors**: Ensure the app has permission to read your video folders

## Contributing

This is an MVP implementation. For the full roadmap, see `PROJECT_PLAN.md`.

## License

MIT License

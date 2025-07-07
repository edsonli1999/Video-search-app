# Video Search App

A desktop application for searching video content by transcribing speech and enabling keyword search.

## Setup

1. **Install dependencies:**
   ```
   npm install
   pip install faster-whisper
   ```

2. **Download Whisper model:** The `faster-whisper` library will download the model automatically, or you can specify a local path.

3. **Run the app:**
   ```
   npm start
   ```

## Features

- Select a folder with video files (.mp4, .mkv, etc.)
- Automatically transcribe speech using local AI (Whisper)
- Store transcripts with timestamps in SQLite
- Search transcripts by keyword
- Display results with timestamps and play videos

## Files

- `main.js`: Electron main process
- `index.html`: UI
- `transcribe.py`: Python script for transcription
- `package.json`: Dependencies and scripts

## Next Steps

- Implement folder selection and batch processing
- Add video playback from timestamps
- Enhance search with semantic capabilities (optional)

## Requirements

- Node.js
- Python 3
- FFmpeg (for audio extraction in Whisper)

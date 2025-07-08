const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('better-sqlite3');
const { PythonShell } = require('python-shell');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('public/index.html');

  // Initialize database
  db = sqlite3('transcripts.db');
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY,
      video_path TEXT,
      transcript TEXT,
      timestamp REAL
    );
    CREATE INDEX IF NOT EXISTS idx_transcript ON transcripts(transcript);
  `);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC for transcription
ipcMain.handle('transcribe-video', async (event, videoPath) => {
  // Call Python script for transcription
  return new Promise((resolve, reject) => {
    PythonShell.run('scripts/transcribe.py', { args: [videoPath] }, (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
});

// IPC for search
ipcMain.handle('search-transcripts', (event, query) => {
  const stmt = db.prepare('SELECT * FROM transcripts WHERE transcript LIKE ?');
  return stmt.all(`%${query}%`);
});

// IPC for folder selection and processing
ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) return [];
  
  const fs = require('fs');
  const path = require('path');
  const folderPath = result.filePaths[0];
  const videoFiles = fs.readdirSync(folderPath).filter(file => 
    ['.mp4', '.mkv', '.avi'].includes(path.extname(file).toLowerCase())
  );
  
  const processed = [];
  for (const file of videoFiles) {
    const videoPath = path.join(folderPath, file);
    try {
      // Transcribe
      const transcriptData = await new Promise((resolve, reject) => {
        PythonShell.run('scripts/transcribe.py', { args: [videoPath] }, (err, results) => {
          if (err) reject(err);
          else resolve(JSON.parse(results[0]));
        });
      });
      
      // Insert into DB
      for (const segment of transcriptData) {
        const stmt = db.prepare('INSERT INTO transcripts (video_path, transcript, timestamp) VALUES (?, ?, ?)');
        stmt.run(videoPath, segment.text, segment.start);
      }
      processed.push(videoPath);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  return processed;
});

// IPC for inserting transcript
ipcMain.handle('insert-transcript', (event, { videoPath, transcript, timestamp }) => {
  const stmt = db.prepare('INSERT INTO transcripts (video_path, transcript, timestamp) VALUES (?, ?, ?)');
  stmt.run(videoPath, transcript, timestamp);
});

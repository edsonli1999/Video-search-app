import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc/handlers';
import { closeDatabase } from './database/database';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png'), // Optional: add app icon
    show: false // Don't show until ready
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Always open dev tools for debugging
  mainWindow.webContents.openDevTools();

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  console.log('🚀 App is ready');
  
  // Create window first, then set up IPC handlers with window reference
  createWindow();
  
  // Set up IPC handlers with main window reference
  if (mainWindow) {
    setupIpcHandlers(mainWindow);
  }

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

// Handle app termination
app.on('before-quit', () => {
  closeDatabase();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

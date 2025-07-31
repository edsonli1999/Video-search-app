const { contextBridge, ipcRenderer } = require('electron');

// Define IPC channels directly to avoid module resolution issues
const IPC_CHANNELS = {
  SELECT_FOLDER: 'select-folder',
  SCAN_VIDEOS: 'scan-videos',
  SEARCH_VIDEOS: 'search-videos',
  GET_VIDEOS: 'get-videos',
  TRANSCRIBE_VIDEO: 'transcribe-video',
  GET_TRANSCRIPT: 'get-transcript',
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder selection
  selectFolder: () => 
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),

  // Video operations
  scanVideos: (folderPath) => 
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_VIDEOS, folderPath),

  getVideos: () => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEOS),

  transcribeVideo: (videoId) => 
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_VIDEO, videoId),

  // Search operations
  searchVideos: (query) => 
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_VIDEOS, query),

  getTranscript: (videoId) => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_TRANSCRIPT, videoId),
}); 
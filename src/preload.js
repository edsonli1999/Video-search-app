const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  transcribeVideo: (videoPath) => ipcRenderer.invoke('transcribe-video', videoPath),
  searchTranscripts: (query) => ipcRenderer.invoke('search-transcripts', query),
  insertTranscript: (data) => ipcRenderer.invoke('insert-transcript', data),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});

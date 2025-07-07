import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, VideoFile, SearchResult, TranscriptSegment } from '../shared/types';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder selection
  selectFolder: (): Promise<string | null> => 
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),

  // Video operations
  scanVideos: (folderPath: string): Promise<VideoFile[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_VIDEOS, folderPath),

  getVideos: (): Promise<VideoFile[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEOS),

  transcribeVideo: (videoId: number): Promise<{ success: boolean; message: string }> => 
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_VIDEO, videoId),

  // Search operations
  searchVideos: (query: string): Promise<SearchResult[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_VIDEOS, query),

  getTranscript: (videoId: number): Promise<TranscriptSegment[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_TRANSCRIPT, videoId),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      scanVideos: (folderPath: string) => Promise<VideoFile[]>;
      getVideos: () => Promise<VideoFile[]>;
      transcribeVideo: (videoId: number) => Promise<{ success: boolean; message: string }>;
      searchVideos: (query: string) => Promise<SearchResult[]>;
      getTranscript: (videoId: number) => Promise<TranscriptSegment[]>;
    };
  }
}

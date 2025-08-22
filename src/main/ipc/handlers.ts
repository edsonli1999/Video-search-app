import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import { getDatabase } from '../database/database';
import { VideoScanner } from '../video/video-scanner';
import { TranscriptionOrchestrator } from '../transcription';

const db = getDatabase();
const videoScanner = new VideoScanner();

// Initialize transcription orchestrator
const transcriptionOrchestrator = new TranscriptionOrchestrator(db);

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // Set up transcription event listeners to notify frontend
  transcriptionOrchestrator.on('jobCompleted', (job) => {
    console.log(`📡 IPC: Notifying frontend that job ${job.id} completed for video ${job.videoId}`);
    mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETED, {
      videoId: job.videoId,
      jobId: job.id
    });
  });

  transcriptionOrchestrator.on('jobFailed', (job) => {
    console.log(`📡 IPC: Notifying frontend that job ${job.id} failed for video ${job.videoId}`);
    mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_FAILED, {
      videoId: job.videoId,
      jobId: job.id,
      error: job.error
    });
  });
  // Handle folder selection
  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Video Folder'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('Error selecting folder:', error);
      throw error;
    }
  });

  // Handle video scanning
  ipcMain.handle(IPC_CHANNELS.SCAN_VIDEOS, async (event, folderPath: string) => {
    try {
      const videos = await videoScanner.scanFolder(folderPath);
      return videos;
    } catch (error) {
      console.error('Error scanning videos:', error);
      throw error;
    }
  });

  // Handle getting all videos
  ipcMain.handle(IPC_CHANNELS.GET_VIDEOS, async () => {
    try {
      return db.getAllVideos();
    } catch (error) {
      console.error('Error getting videos:', error);
      throw error;
    }
  });

  // Handle search
  ipcMain.handle(IPC_CHANNELS.SEARCH_VIDEOS, async (event, query: string) => {
    console.log('🔍 IPC: SEARCH_VIDEOS handler called with query:', query);
    
    try {
      if (!query.trim()) {
        console.log('🔍 IPC: Empty query, returning empty array');
        return [];
      }
      
      console.log('🔍 IPC: Calling db.searchTranscripts with:', query);
      const results = db.searchTranscripts(query);
      console.log('🔍 IPC: Database search results:', results);
      console.log('🔍 IPC: Number of results from database:', results.length);
      
      if (results.length > 0) {
        console.log('🔍 IPC: First result from database:', results[0]);
      }
      
      return results;
    } catch (error) {
      console.error('🔍 IPC: Error searching videos:', error);
      throw error;
    }
  });

  // Handle getting transcript for a video
  ipcMain.handle(IPC_CHANNELS.GET_TRANSCRIPT, async (event, videoId: number) => {
    try {
      return db.getTranscriptSegments(videoId);
    } catch (error) {
      console.error('Error getting transcript:', error);
      throw error;
    }
  });

  // Handle transcription with real Whisper implementation
  ipcMain.handle(IPC_CHANNELS.TRANSCRIBE_VIDEO, async (event, videoId: number) => {
    try {
      console.log(`🎬 IPC: Starting transcription for video ${videoId}`);
      
      // Get video information
      const videos = db.getAllVideos();
      const video = videos.find(v => v.id === videoId);
      
      if (!video) {
        throw new Error(`Video with ID ${videoId} not found`);
      }

      // Initialize transcription orchestrator if not already done
      await transcriptionOrchestrator.initialize();

      // Queue the transcription job
      const jobId = await transcriptionOrchestrator.queueTranscription(videoId, video.filePath);
      
      console.log(`📋 IPC: Transcription queued with job ID: ${jobId}`);
      
      return { 
        success: true, 
        message: 'Transcription queued successfully',
        jobId 
      };
    } catch (error) {
      console.error('❌ IPC: Error queuing transcription:', error);
      db.updateVideoTranscriptionStatus(videoId, 'failed');
      throw error;
    }
  });
}

import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import { getDatabase } from '../database/database';
import { VideoScanner } from '../video/video-scanner';
import { TranscriptionPipeline } from '../transcription/transcription-pipeline';

const db = getDatabase();
const videoScanner = new VideoScanner();
const transcriptionPipeline = new TranscriptionPipeline();

export function setupIpcHandlers(): void {
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

  // Handle transcription - REAL IMPLEMENTATION using Whisper AI
  ipcMain.handle(IPC_CHANNELS.TRANSCRIBE_VIDEO, async (event, videoId: number) => {
    try {
      console.log(`🎙️ IPC: Starting real transcription for video ID: ${videoId}`);
      
      // Get video information from database
      const video = db.getVideoById(videoId);
      if (!video) {
        throw new Error(`Video with ID ${videoId} not found`);
      }

      console.log(`🎙️ IPC: Transcribing video: ${video.filePath}`);
      
      // Update status to processing
      db.updateVideoTranscriptionStatus(videoId, 'processing');

      // Set up progress tracking
      const progressHandler = (progress: any) => {
        console.log(`📊 IPC: Transcription progress - ${progress.stage}: ${progress.progress}% - ${progress.message}`);
        
        // Send progress updates to renderer (if needed for UI)
        event.sender.send('transcription-progress', {
          videoId,
          progress: progress.progress,
          stage: progress.stage,
          message: progress.message
        });
      };

      // Set up progress listener
      transcriptionPipeline.on('progress', progressHandler);

      try {
        // Process the video through the transcription pipeline
        const transcriptionResult = await transcriptionPipeline.processVideo(video.filePath, {
          modelName: 'base.en', // Use the downloaded model
          language: 'en',
          wordTimestamps: true,
          cleanupTempFiles: true, // Clean up audio files after transcription
        });

        console.log(`✅ IPC: Transcription completed for video ID: ${videoId}`);
        console.log(`📊 IPC: Generated ${transcriptionResult.segments.length} transcript segments`);

        // Convert transcription result to database format
        const segments = transcriptionResult.segments.map(segment => ({
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
          confidence: segment.confidence
        }));

        // Store transcript segments in database
        if (segments.length > 0) {
          db.insertTranscriptSegments(videoId, segments);
          console.log(`💾 IPC: Stored ${segments.length} transcript segments in database`);
        }

        // Update video metadata with duration if available
        if (transcriptionResult.duration) {
          db.updateVideoDuration(videoId, transcriptionResult.duration);
          console.log(`💾 IPC: Updated video duration to ${transcriptionResult.duration} seconds`);
        }

        // Update status to completed
        db.updateVideoTranscriptionStatus(videoId, 'completed');

        // Remove progress listener
        transcriptionPipeline.removeListener('progress', progressHandler);

        return { 
          success: true, 
          message: 'Transcription completed successfully',
          segmentCount: segments.length,
          duration: transcriptionResult.duration
        };

      } catch (transcriptionError) {
        console.error('❌ IPC: Transcription pipeline error:', transcriptionError);
        
        // Update status to failed
        db.updateVideoTranscriptionStatus(videoId, 'failed');
        
        // Remove progress listener
        transcriptionPipeline.removeListener('progress', progressHandler);
        
        throw transcriptionError;
      }

    } catch (error) {
      console.error('❌ IPC: Error in transcription handler:', error);
      
      // Ensure status is updated to failed
      try {
        db.updateVideoTranscriptionStatus(videoId, 'failed');
      } catch (dbError) {
        console.error('❌ IPC: Additional error updating transcription status:', dbError);
      }
      
      throw error;
    }
  });

  // Handle cleanup (optional - for cleaning up temp files)
  ipcMain.handle('cleanup-transcription-temp', async () => {
    try {
      await transcriptionPipeline.cleanup();
      return { success: true, message: 'Temporary files cleaned up' };
    } catch (error) {
      console.error('Error cleaning up transcription temp files:', error);
      throw error;
    }
  });

  // Handle getting available transcription models
  ipcMain.handle('get-transcription-models', async () => {
    try {
      return transcriptionPipeline.getAvailableModels();
    } catch (error) {
      console.error('Error getting transcription models:', error);
      throw error;
    }
  });
}

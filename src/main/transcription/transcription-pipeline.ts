import { AudioExtractor, AudioExtractionResult } from '../audio/audio-extractor';
import { TranscriptionService, TranscriptionResult, TranscriptionOptions } from './transcription-service';
import { EventEmitter } from 'events';

export interface TranscriptionProgress {
  stage: 'audio_extraction' | 'transcription' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  details?: any;
}

export interface PipelineOptions extends TranscriptionOptions {
  cleanupTempFiles?: boolean;
}

export class TranscriptionPipeline extends EventEmitter {
  private audioExtractor: AudioExtractor;
  private transcriptionService: TranscriptionService;

  constructor() {
    super();
    this.audioExtractor = new AudioExtractor();
    this.transcriptionService = new TranscriptionService();
  }

  /**
   * Process a video file through the complete transcription pipeline
   * @param videoPath Path to the video file
   * @param options Pipeline options
   * @returns Promise with transcription results
   */
  async processVideo(
    videoPath: string,
    options: PipelineOptions = {}
  ): Promise<TranscriptionResult> {
    let audioResult: AudioExtractionResult | null = null;

    try {
      console.log(`🎬 TranscriptionPipeline: Starting pipeline for ${videoPath}`);
      
      // Stage 1: Audio Extraction
      this.emitProgress({
        stage: 'audio_extraction',
        progress: 0,
        message: 'Starting audio extraction...',
      });

      audioResult = await this.audioExtractor.extractAudio(videoPath);
      
      this.emitProgress({
        stage: 'audio_extraction',
        progress: 100,
        message: 'Audio extraction completed',
        details: { audioPath: audioResult.audioPath, duration: audioResult.duration },
      });

      // Stage 2: Transcription
      this.emitProgress({
        stage: 'transcription',
        progress: 0,
        message: 'Starting transcription...',
      });

      const transcriptionResult = await this.transcriptionService.transcribeAudio(
        audioResult.audioPath,
        options
      );

      this.emitProgress({
        stage: 'transcription',
        progress: 100,
        message: 'Transcription completed',
        details: { segmentCount: transcriptionResult.segments.length },
      });

      // Stage 3: Processing Results
      this.emitProgress({
        stage: 'processing',
        progress: 50,
        message: 'Processing transcription results...',
      });

      // Add video duration from audio extraction if not set
      if (!transcriptionResult.duration && audioResult.duration) {
        transcriptionResult.duration = audioResult.duration;
      }

      // Cleanup temporary files if requested
      if (options.cleanupTempFiles !== false) {
        await this.audioExtractor.cleanupAudio(audioResult.audioPath);
      }

      this.emitProgress({
        stage: 'completed',
        progress: 100,
        message: 'Transcription pipeline completed successfully',
        details: {
          segmentCount: transcriptionResult.segments.length,
          duration: transcriptionResult.duration,
          language: transcriptionResult.language,
        },
      });

      console.log(`✅ TranscriptionPipeline: Pipeline completed for ${videoPath}`);
      console.log(`📊 TranscriptionPipeline: Generated ${transcriptionResult.segments.length} transcript segments`);
      
      return transcriptionResult;

    } catch (error) {
      console.error('❌ TranscriptionPipeline: Pipeline failed:', error);

      // Cleanup on error
      if (audioResult?.audioPath) {
        try {
          await this.audioExtractor.cleanupAudio(audioResult.audioPath);
        } catch (cleanupError) {
          console.error('❌ TranscriptionPipeline: Error during cleanup:', cleanupError);
        }
      }

      this.emitProgress({
        stage: 'failed',
        progress: 0,
        message: `Transcription pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : error },
      });

      throw error;
    }
  }

  /**
   * Process multiple videos in batch
   * @param videoPaths Array of video file paths
   * @param options Pipeline options
   * @returns Promise with array of transcription results
   */
  async processVideosBatch(
    videoPaths: string[],
    options: PipelineOptions = {}
  ): Promise<{ videoPath: string; result?: TranscriptionResult; error?: string }[]> {
    console.log(`🎬 TranscriptionPipeline: Starting batch processing for ${videoPaths.length} videos`);
    
    const results: { videoPath: string; result?: TranscriptionResult; error?: string }[] = [];

    for (let i = 0; i < videoPaths.length; i++) {
      const videoPath = videoPaths[i];
      
      try {
        console.log(`🎬 TranscriptionPipeline: Processing video ${i + 1}/${videoPaths.length}: ${videoPath}`);
        
        this.emit('batch-progress', {
          current: i + 1,
          total: videoPaths.length,
          videoPath,
          message: `Processing video ${i + 1} of ${videoPaths.length}`,
        });

        const result = await this.processVideo(videoPath, options);
        results.push({ videoPath, result });

        console.log(`✅ TranscriptionPipeline: Completed video ${i + 1}/${videoPaths.length}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ TranscriptionPipeline: Failed video ${i + 1}/${videoPaths.length}:`, errorMessage);
        results.push({ videoPath, error: errorMessage });
      }
    }

    console.log(`🎬 TranscriptionPipeline: Batch processing completed`);
    console.log(`📊 TranscriptionPipeline: Success: ${results.filter(r => r.result).length}, Failed: ${results.filter(r => r.error).length}`);

    return results;
  }

  /**
   * Get estimated processing time for a video
   * @param videoDurationSeconds Duration of the video in seconds
   * @param modelName Whisper model to use
   * @returns Estimated processing time in seconds
   */
  getEstimatedProcessingTime(videoDurationSeconds: number, modelName: string = 'base.en'): number {
    // Rough estimates based on model size and typical processing speeds
    const modelMultipliers = {
      'tiny': 0.1,
      'tiny.en': 0.1,
      'base': 0.2,
      'base.en': 0.2,
      'small': 0.4,
      'small.en': 0.4,
      'medium': 0.8,
      'medium.en': 0.8,
      'large-v1': 1.5,
      'large': 1.5,
      'large-v3-turbo': 1.0,
    };

    const multiplier = modelMultipliers[modelName as keyof typeof modelMultipliers] || 0.2;
    
    // Add overhead for audio extraction (usually ~10-20% of video duration)
    const audioExtractionTime = videoDurationSeconds * 0.15;
    const transcriptionTime = videoDurationSeconds * multiplier;
    
    return Math.ceil(audioExtractionTime + transcriptionTime);
  }

  /**
   * Cleanup all temporary files
   */
  async cleanup(): Promise<void> {
    await this.audioExtractor.cleanupAllTempFiles();
  }

  /**
   * Get available transcription models
   */
  getAvailableModels(): string[] {
    return this.transcriptionService.getAvailableModels();
  }

  /**
   * Emit progress update
   */
  private emitProgress(progress: TranscriptionProgress): void {
    this.emit('progress', progress);
    console.log(`📊 TranscriptionPipeline: ${progress.stage} - ${progress.progress}% - ${progress.message}`);
  }
} 
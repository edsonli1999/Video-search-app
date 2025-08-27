import { EventEmitter } from 'events';
import { AudioExtractor, AudioExtractionResult } from './audio-extractor';
import { WhisperTranscriber, TranscriptionResult, TranscriptionSegment } from './whisper-transcriber';
import { TranscriptionQueue, TranscriptionJob } from './transcription-queue';
import { VideoDatabase } from '../database/database';

export interface TranscriptionProgress {
  videoId: number;
  stage: 'audio_extraction' | 'transcription' | 'database_storage';
  progress: number;
  message: string;
}

export interface TranscriptionOptions {
  model?: string;
  language?: string;
  priority?: number;
  audioFormat?: 'wav' | 'mp3';
  sampleRate?: number;
}

export class TranscriptionOrchestrator extends EventEmitter {
  private audioExtractor: AudioExtractor;
  private whisperTranscriber: WhisperTranscriber;
  private queue: TranscriptionQueue;
  private database: VideoDatabase;
  private isInitialized = false;

  constructor(database: VideoDatabase, tempDir: string = 'temp/audio') {
    super();
    this.database = database;
    this.audioExtractor = new AudioExtractor(tempDir);
    this.whisperTranscriber = new WhisperTranscriber();
    // Pass the processing callback to the queue
    this.queue = new TranscriptionQueue((job) => this.processTranscriptionJob(job));
    
    this.setupEventListeners();
  }

  /**
   * Initialize the transcription system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🚀 Initializing transcription orchestrator...');
      
      // Load the Whisper model
      await this.whisperTranscriber.loadModel();
      
      this.isInitialized = true;
      console.log('✅ Transcription orchestrator initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize transcription orchestrator:', error);
      throw error;
    }
  }

  /**
   * Add a video to the transcription queue
   */
  async queueTranscription(
    videoId: number, 
    videoPath: string, 
    options: TranscriptionOptions = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Don't update status to processing yet - let processTranscriptionJob handle it
    // This allows proper re-transcription detection

    // Add to queue
    const jobId = this.queue.addJob(videoId, videoPath, options.priority || 0);
    
    console.log(`📋 Queued transcription for video ${videoId} (job: ${jobId})`);
    return jobId;
  }

  /**
   * Process a transcription job
   */
  async processTranscriptionJob(job: TranscriptionJob, options: TranscriptionOptions = {}): Promise<void> {
    const { videoId, videoPath } = job;
    
    try {
      // Check if this is a re-transcription BEFORE changing status
      const videos = this.database.getAllVideos();
      const video = videos.find(v => v.id === videoId);
      const isRetranscribe = video?.transcriptionStatus === 'completed';
      
      console.log(`${isRetranscribe ? '🔄 Re-transcribing' : '🎬 Starting transcription for'} video ${videoId}: ${videoPath}`);
      
      // Clear existing transcript segments for re-transcription
      if (isRetranscribe) {
        console.log(`🧹 Clearing existing transcript segments for video ${videoId}`);
        this.database.clearTranscriptSegments(videoId);
      }

      // Now update status to processing (after checking and clearing)
      this.database.updateVideoTranscriptionStatus(videoId, 'processing');

      // Stage 1: Audio Extraction (0-30%)
      this.emit('progress', {
        videoId,
        stage: 'audio_extraction',
        progress: 0,
        message: 'Extracting audio from video...'
      });

      const audioResult = await this.audioExtractor.extractAudio(videoPath, videoId, {
        outputFormat: options.audioFormat || 'wav',
        sampleRate: options.sampleRate || 16000
      });

      if (!audioResult.success) {
        throw new Error(`Audio extraction failed: ${audioResult.error}`);
      }

      this.emit('progress', {
        videoId,
        stage: 'audio_extraction',
        progress: 100,
        message: 'Audio extraction completed'
      });

      // Stage 2: Transcription (30-90%)
      this.emit('progress', {
        videoId,
        stage: 'transcription',
        progress: 0,
        message: 'Transcribing audio with Whisper...'
      });

      const transcriptionResult = await this.whisperTranscriber.transcribeAudio(
        audioResult.outputPath!,
        {
          model: options.model,
          language: options.language
        }
      );

      if (!transcriptionResult.success) {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      }

      this.emit('progress', {
        videoId,
        stage: 'transcription',
        progress: 100,
        message: 'Transcription completed'
      });

      // Stage 3: Database Storage (90-100%)
      this.emit('progress', {
        videoId,
        stage: 'database_storage',
        progress: 0,
        message: 'Storing transcript in database...'
      });

      // Handle transcription results (including 0 segments case)
      const segments = transcriptionResult.segments || [];
      const dbSegments = segments.map(segment => ({
        startTime: segment.start,
        endTime: segment.end,
        text: segment.text,
        confidence: segment.confidence
      }));

      // Store in database (even if 0 segments)
      if (dbSegments.length > 0) {
        this.database.insertTranscriptSegments(videoId, dbSegments);
      }
      this.database.updateVideoTranscriptionStatus(videoId, 'completed');

      this.emit('progress', {
        videoId,
        stage: 'database_storage',
        progress: 100,
        message: dbSegments.length > 0 
          ? 'Transcript stored successfully'
          : 'No speech detected, marked as completed'
      });

      console.log(`✅ Transcription completed for video ${videoId}: ${dbSegments.length} segments`);

    } catch (error) {
      console.error(`❌ Transcription failed for video ${videoId}:`, error);
      
      // Update database status
      this.database.updateVideoTranscriptionStatus(videoId, 'failed');
      
      // Clean up audio file
      this.audioExtractor.cleanupAudio(videoId);
      
      throw error;
    } finally {
      // Always clean up audio file
      this.audioExtractor.cleanupAudio(videoId);
    }
  }

  /**
   * Get transcription status for a video
   */
  getTranscriptionStatus(videoId: number): string {
    const videos = this.database.getAllVideos();
    const video = videos.find(v => v.id === videoId);
    return video?.transcriptionStatus || 'unknown';
  }

  /**
   * Get job status by video ID
   */
  getJobByVideoId(videoId: number): TranscriptionJob | null {
    return this.queue.getJobByVideoId(videoId);
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return this.queue.getStatus();
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return this.queue.getAllJobs();
  }

  /**
   * Remove a job from queue
   */
  removeJob(jobId: string): boolean {
    return this.queue.removeJob(jobId);
  }

  /**
   * Clear completed jobs
   */
  clearCompletedJobs(): number {
    return this.queue.clearCompletedJobs();
  }

  /**
   * Pause queue processing
   */
  pauseQueue(): void {
    this.queue.pause();
  }

  /**
   * Resume queue processing
   */
  resumeQueue(): void {
    this.queue.resume();
  }

  /**
   * Get available Whisper models
   */
  getAvailableModels() {
    return WhisperTranscriber.getAvailableModels();
  }

  /**
   * Get model info
   */
  getModelInfo(modelName: string) {
    return WhisperTranscriber.getModelInfo(modelName);
  }

  /**
   * Setup event listeners for progress tracking
   */
  private setupEventListeners(): void {
    // Listen to queue events
    this.queue.on('jobAdded', (job: TranscriptionJob) => {
      this.emit('jobAdded', job);
    });

    this.queue.on('jobStarted', (job: TranscriptionJob) => {
      this.emit('jobStarted', job);
    });

    this.queue.on('jobCompleted', (job: TranscriptionJob) => {
      this.emit('jobCompleted', job);
    });

    this.queue.on('jobFailed', (job: TranscriptionJob) => {
      this.emit('jobFailed', job);
    });

    this.queue.on('jobProgress', (progress: any) => {
      this.emit('jobProgress', progress);
    });

    // Listen to Whisper transcriber events
    this.whisperTranscriber.on('progress', (progress: any) => {
      this.emit('whisperProgress', progress);
    });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.whisperTranscriber.unloadModel();
    this.queue.clearAllJobs();
    console.log('🧹 Transcription orchestrator cleaned up');
  }
} 
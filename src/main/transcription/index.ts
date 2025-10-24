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
  // New options for handling large files
  chunkLength?: number;
  strideLength?: number;
  conditionOnPreviousText?: boolean;
  maxContextLength?: number;
  adaptiveChunking?: boolean;
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
    const { videoId, videoPath, abortController } = job;
    
    try {
      // Check for cancellation at start
      if (abortController?.signal.aborted) {
        throw new Error('Job was cancelled before processing started');
      }

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

      // Check for cancellation after clearing segments
      if (abortController?.signal.aborted) {
        throw new Error('Job was cancelled during setup');
      }

      // Now update status to processing (after checking and clearing)
      this.database.updateVideoTranscriptionStatus(videoId, 'processing');

      // Stage 1: Audio Extraction (0-30% of overall progress)
      this.emit('progress', {
        videoId,
        stage: 'audio_extraction',
        progress: 0,
        message: 'Starting audio extraction...'
      });

      // Listen to audio extraction progress
      const audioProgressHandler = (percent: number) => {
        // Map audio extraction progress to 0-30% of overall progress
        const overallProgress = Math.round(percent * 0.3);
        this.emit('progress', {
          videoId,
          stage: 'audio_extraction',
          progress: overallProgress,
          message: `Extracting audio: ${percent.toFixed(1)}%`
        });
      };

      this.audioExtractor.on('progress', audioProgressHandler);

      const audioResult = await this.audioExtractor.extractAudio(videoPath, videoId, {
        outputFormat: options.audioFormat || 'wav',
        sampleRate: options.sampleRate || 16000,
        abortSignal: abortController?.signal,
        onProgress: (percent) => {
          // Additional progress handling if needed
        }
      });

      // Remove the listener after extraction
      this.audioExtractor.removeListener('progress', audioProgressHandler);

      if (!audioResult.success) {
        throw new Error(`Audio extraction failed: ${audioResult.error}`);
      }

      // Check for cancellation after audio extraction
      if (abortController?.signal.aborted) {
        throw new Error('Job was cancelled after audio extraction');
      }

      this.emit('progress', {
        videoId,
        stage: 'audio_extraction',
        progress: 30,
        message: 'Audio extraction completed'
      });

      // Stage 2: Transcription (30-90% of overall progress)
      this.emit('progress', {
        videoId,
        stage: 'transcription',
        progress: 30,
        message: 'Starting transcription with Whisper...'
      });

      // Prepare whisper options - pass through undefined values to let worker use its defaults
      const whisperOptions = {
        model: options.model,
        language: options.language,
        abortSignal: abortController?.signal,
        // Pass through options only if they were explicitly provided
        ...(options.chunkLength !== undefined && { chunkLength: options.chunkLength }),
        ...(options.strideLength !== undefined && { strideLength: options.strideLength }),
        ...(options.conditionOnPreviousText !== undefined && { conditionOnPreviousText: options.conditionOnPreviousText }),
        ...(options.maxContextLength !== undefined && { maxContextLength: options.maxContextLength }),
        ...(options.adaptiveChunking !== undefined && { adaptiveChunking: options.adaptiveChunking })
      };

      // 🔍 DIAGNOSTIC LOGGING
      console.log(`🔍 ORCHESTRATOR: Passing options to WhisperTranscriber for video ${videoId}:`, JSON.stringify(whisperOptions, null, 2));

      // Listen to whisper progress events
      const whisperProgressHandler = (progressData: any) => {
        // Map whisper progress (0-100) to 30-90% of overall progress
        let whisperPercent = 0;
        
        if (progressData.stage === 'transcribing' && typeof progressData.progress === 'number') {
          whisperPercent = progressData.progress;
        } else if (progressData.stage === 'model-loaded') {
          whisperPercent = 10; // Model loading is about 10% of transcription
        }
        
        const overallProgress = Math.round(30 + (whisperPercent * 0.6));
        this.emit('progress', {
          videoId,
          stage: 'transcription',
          progress: overallProgress,
          message: progressData.message || `Transcribing: ${whisperPercent}%`
        });
      };

      this.whisperTranscriber.on('progress', whisperProgressHandler);

      const transcriptionResult = await this.whisperTranscriber.transcribeAudio(
        audioResult.outputPath!,
        whisperOptions
      );

      // Remove the listener after transcription
      this.whisperTranscriber.removeListener('progress', whisperProgressHandler);

      if (!transcriptionResult.success) {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      }

      // Check for cancellation after transcription
      if (abortController?.signal.aborted) {
        throw new Error('Job was cancelled after transcription');
      }

      this.emit('progress', {
        videoId,
        stage: 'transcription',
        progress: 90,
        message: 'Transcription completed'
      });

      // Stage 3: Database Storage (90-100% of overall progress)
      this.emit('progress', {
        videoId,
        stage: 'database_storage',
        progress: 90,
        message: 'Storing transcript in database...'
      });

      // Handle transcription results with validation
      const segments = transcriptionResult.segments || [];
      
      // Validate and fix segments before database insertion
      const dbSegments = segments
        .filter(segment => {
          // Ensure all required fields are present and valid
          const hasValidTimes = typeof segment.start === 'number' && 
                               typeof segment.end === 'number' &&
                               !isNaN(segment.start) && 
                               !isNaN(segment.end) &&
                               segment.end > segment.start;
          
          const hasText = segment.text && segment.text.trim().length > 0;
          
          if (!hasValidTimes || !hasText) {
            console.warn(`Skipping invalid segment:`, {
              start: segment.start,
              end: segment.end,
              text: segment.text?.substring(0, 50),
              hasValidTimes,
              hasText
            });
            return false;
          }
          
          return true;
        })
        .map(segment => ({
          startTime: Number(segment.start),
          endTime: Number(segment.end),
          text: segment.text.trim(),
          confidence: typeof segment.confidence === 'number' ? segment.confidence : 0.8
        }));

      console.log(`Validated ${dbSegments.length} segments from ${segments.length} original segments for database storage`);

      // Store in database (even if 0 segments)
      if (dbSegments.length > 0) {
        try {
          this.database.insertTranscriptSegments(videoId, dbSegments);
        } catch (dbError) {
          console.error('Database insertion error:', dbError);
          console.error('Failed segments sample:', dbSegments.slice(0, 3));
          throw new Error(`Database storage failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      }
      
      this.database.updateVideoTranscriptionStatus(videoId, 'completed');

      this.emit('progress', {
        videoId,
        stage: 'database_storage',
        progress: 100,
        message: dbSegments.length > 0 
          ? `Transcript stored successfully (${dbSegments.length} segments)`
          : 'No speech detected, marked as completed'
      });

      console.log(`✅ Transcription completed for video ${videoId}: ${dbSegments.length} segments`);

    } catch (error) {
      console.error(`❌ Transcription error for video ${videoId}:`, error);

      // Check if this was a cancellation
      if (abortController?.signal.aborted || (error instanceof Error && error.message.includes('cancelled'))) {
        console.log(`🛑 Transcription cancelled for video ${videoId}`);

        // Reset video status to pending on cancellation
        this.database.updateVideoTranscriptionStatus(videoId, 'pending');

        // Clean up any partial data
        this.database.clearTranscriptSegments(videoId);
      } else {
        // Regular failure
        this.database.updateVideoTranscriptionStatus(videoId, 'failed');
      }

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
   * Cleanup transcription resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up transcription resources...');
    
    // Terminate worker thread
    if (this.whisperTranscriber) {
      await this.whisperTranscriber.terminate();
    }
    
    console.log('✅ Transcription resources cleaned up');
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
   * Cancel a job (either queued or processing)
   */
  cancelJob(jobId: string): boolean {
    return this.queue.cancelJob(jobId);
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

    this.queue.on('jobCancelled', (job: TranscriptionJob) => {
      this.emit('jobCancelled', job);
    });

    this.queue.on('jobProgress', (progress: any) => {
      this.emit('jobProgress', progress);
    });
  }
}
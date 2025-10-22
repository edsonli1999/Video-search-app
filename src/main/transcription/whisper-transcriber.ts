import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface TranscriptionResult {
  success: boolean;
  segments?: TranscriptionSegment[];
  error?: string;
  duration?: number;
}

export interface TranscriptionOptions {
  model?: string;
  language?: string;
  task?: 'transcribe' | 'translate';
  chunkLength?: number;
  strideLength?: number;
  conditionOnPreviousText?: boolean;
  maxContextLength?: number;
  adaptiveChunking?: boolean;
  abortSignal?: AbortSignal;
}

export class WhisperTranscriber extends EventEmitter {
  private worker: Worker | null = null;
  private isModelLoaded = false;

  constructor() {
    super();
  }

  /**
   * Initialize the worker thread
   */
  private createWorker(): void {
    if (this.worker) {
      return; // Worker already exists
    }

    const workerPath = path.join(__dirname, 'whisper-worker.js');
    this.worker = new Worker(workerPath);

    this.worker.on('message', (message: { type: string; data?: any }) => {
      switch (message.type) {
        case 'progress':
          console.log(`🔧 Worker progress: ${message.data?.stage} - ${message.data?.message}`);
          this.emit('progress', message.data);
          break;
        case 'result':
          this.emit('transcription-result', message.data);
          break;
        case 'error':
          console.error('❌ Worker error:', message.data);
          this.emit('transcription-error', message.data);
          break;
        default:
          console.warn('Unknown message type from worker:', message.type);
      }
    });

    this.worker.on('error', (error) => {
      console.error('❌ Worker thread error:', error);
      this.emit('transcription-error', `Worker error: ${error.message}`);
    });

    this.worker.on('exit', (code) => {
      console.log(`🔧 Worker thread exited with code ${code}`);
      if (code !== 0) {
        console.error(`❌ Worker stopped with exit code ${code}`);
        this.emit('transcription-error', `Worker exited with code ${code}`);
      }
      this.worker = null;
      this.isModelLoaded = false;
    });
  }

  /**
   * Load Whisper model in worker thread
   */
  async loadModel(modelName?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isModelLoaded) {
        console.log(`✅ Whisper model already loaded`);
        resolve();
        return;
      }

      console.log(`🎯 Loading Whisper model in worker thread: ${modelName || 'Xenova/whisper-base'}`);
      this.createWorker();

      if (!this.worker) {
        reject(new Error('Failed to create worker thread'));
        return;
      }

      let timeout: NodeJS.Timeout;

      const handleProgress = (data: any) => {
        if (data.stage === 'model-loaded') {
          this.isModelLoaded = true;
          clearTimeout(timeout);
          this.removeListener('progress', handleProgress);
          this.removeListener('transcription-error', handleError);
          console.log(`✅ Whisper model loaded successfully in worker thread`);
          resolve();
        }
      };

      const handleError = (error: string) => {
        clearTimeout(timeout);
        this.removeListener('progress', handleProgress);
        this.removeListener('transcription-error', handleError);
        reject(new Error(error));
      };

      // Set up timeout for model loading (3 minutes)
      timeout = setTimeout(() => {
        this.removeListener('progress', handleProgress);
        this.removeListener('transcription-error', handleError);
        reject(new Error('Model loading timeout - check your internet connection'));
      }, 180000);

      this.on('progress', handleProgress);
      this.on('transcription-error', handleError);

      this.worker.postMessage({
        type: 'load-model',
        data: { model: modelName || 'Xenova/whisper-base' }
      });
    });
  }

  /**
   * Determine if file is large based on audio file size and duration
   */
  private isLargeFile(audioPath: string): boolean {
    try {
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      // Lower threshold: > 10MB is considered large
      // (Duration check will happen in worker where we have audio buffer)
      return fileSizeMB > 10;
    } catch {
      return false; // Default to false if we can't read file
    }
  }

  /**
   * Transcribe audio file using Whisper in worker thread
   */
  async transcribeAudio(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    console.log(`🎤 Starting worker-based transcription: ${audioPath}`);

    const { abortSignal } = options;

    // Auto-detect large file and adjust defaults if not explicitly set
    const isLarge = this.isLargeFile(audioPath);
    const effectiveOptions: TranscriptionOptions = {
      ...options,
      // Apply smart defaults for large files if not explicitly overridden
      chunkLength: options.chunkLength ?? (isLarge ? 20 : 30),
      strideLength: options.strideLength ?? (isLarge ? 2 : 5),
      conditionOnPreviousText: options.conditionOnPreviousText ?? !isLarge,
      maxContextLength: options.maxContextLength ?? 100,
      adaptiveChunking: options.adaptiveChunking ?? true
    };

    // 🔍 DIAGNOSTIC LOGGING
    console.log(`🔍 WHISPER TRANSCRIBER OPTIONS:`, JSON.stringify({
      audioPath,
      isLargeBySize: isLarge,
      originalOptions: options,
      effectiveOptions
    }, null, 2));

    if (isLarge) {
      console.log(`📦 Large file detected (>10MB). Using optimized settings: chunk=${effectiveOptions.chunkLength}s, stride=${effectiveOptions.strideLength}s, conditioning=${effectiveOptions.conditionOnPreviousText}`);
    }

    return new Promise((resolve, reject) => {
      // Check for cancellation at start
      if (abortSignal?.aborted) {
        resolve({
          success: false,
          error: 'Transcription was cancelled'
        });
        return;
      }

      // Ensure worker is created
      this.createWorker();

      if (!this.worker) {
        resolve({
          success: false,
          error: 'Failed to create worker thread'
        });
        return;
      }

      let timeout: NodeJS.Timeout;

      const handleResult = (data: any) => {
        clearTimeout(timeout);
        this.removeListener('transcription-result', handleResult);
        this.removeListener('transcription-error', handleError);
        console.log(`✅ Worker-based transcription completed: ${data.segments?.length || 0} segments`);
        resolve(data);
      };

      const handleError = (error: string) => {
        clearTimeout(timeout);
        this.removeListener('transcription-result', handleResult);
        this.removeListener('transcription-error', handleError);
        console.error(`❌ Worker-based transcription failed: ${error}`);
        resolve({
          success: false,
          error
        });
      };

      // Set up timeout for transcription (10 minutes for long videos)
      timeout = setTimeout(() => {
        this.removeListener('transcription-result', handleResult);
        this.removeListener('transcription-error', handleError);
        resolve({
          success: false,
          error: 'Transcription timeout - video may be too long'
        });
      }, 600000);

      this.on('transcription-result', handleResult);
      this.on('transcription-error', handleError);

      // Set up cancellation listener
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          console.log(`🛑 WhisperTranscriber: Cancelling transcription`);
          clearTimeout(timeout);
          this.removeListener('transcription-result', handleResult);
          this.removeListener('transcription-error', handleError);

          // Send cancel message to worker
          if (this.worker) {
            this.worker.postMessage({
              type: 'cancel'
            });
          }

          resolve({
            success: false,
            error: 'Transcription was cancelled'
          });
        });
      }

      // Send transcription request to worker with effective options
      console.log(`🔍 Sending to worker:`, JSON.stringify(effectiveOptions, null, 2));
      
      this.worker.postMessage({
        type: 'transcribe',
        data: {
          audioPath,
          options: effectiveOptions
        }
      });
    });
  }

  /**
   * Get available Whisper models
   */
  static getAvailableModels(): string[] {
    return [
      'Xenova/whisper-base',
      'Xenova/whisper-small',
      'Xenova/whisper-medium'
    ];
  }

  /**
   * Terminate the worker thread
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      console.log('🔧 Terminating worker thread...');
      await this.worker.terminate();
      this.worker = null;
      this.isModelLoaded = false;
      console.log('✅ Worker thread terminated');
    }
  }

  /**
   * Check if model is loaded
   */
  get isLoaded(): boolean {
    return this.isModelLoaded;
  }
}
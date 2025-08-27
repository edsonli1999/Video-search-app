import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import * as path from 'path';

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
   * Transcribe audio file using Whisper in worker thread
   */
  async transcribeAudio(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    console.log(`🎤 Starting worker-based transcription: ${audioPath}`);
    
    return new Promise((resolve, reject) => {
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

      // Send transcription request to worker
      this.worker.postMessage({
        type: 'transcribe',
        data: {
          audioPath,
          options
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
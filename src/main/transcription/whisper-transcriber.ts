import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs';
import { EventEmitter } from 'events';

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
  private model: any = null;
  private isModelLoaded = false;
  private defaultModel = 'Xenova/whisper-base';
  private fallbackModel = 'Xenova/whisper-tiny';

  constructor() {
    super();
    // Configure transformers to use local cache
    env.cacheDir = './models';
    env.allowLocalModels = true;
  }

  /**
   * Load the Whisper model
   */
  async loadModel(modelName?: string): Promise<void> {
    if (this.isModelLoaded) {
      return;
    }

    const modelToLoad = modelName || this.defaultModel;
    
    try {
      console.log(`🤖 Loading Whisper model: ${modelToLoad}`);
      this.emit('progress', { stage: 'loading_model', progress: 0, message: `Loading model: ${modelToLoad}` });
      
      this.model = await pipeline('automatic-speech-recognition', modelToLoad, {
        progress_callback: (progress: any) => {
          this.emit('progress', { 
            stage: 'loading_model', 
            progress: progress.progress * 100, 
            message: `Loading model: ${Math.round(progress.progress * 100)}%` 
          });
        }
      });
      
      this.isModelLoaded = true;
      console.log(`✅ Whisper model loaded successfully: ${modelToLoad}`);
      this.emit('progress', { stage: 'loading_model', progress: 100, message: 'Model loaded successfully' });
    } catch (error) {
      console.error(`❌ Failed to load model ${modelToLoad}:`, error);
      
      // Try fallback model if main model fails
      if (modelToLoad !== this.fallbackModel) {
        console.log(`🔄 Trying fallback model: ${this.fallbackModel}`);
        await this.loadModel(this.fallbackModel);
      } else {
        throw new Error(`Failed to load any Whisper model: ${error}`);
      }
    }
  }

  /**
   * Transcribe audio file using Whisper
   */
  async transcribeAudio(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      // Ensure model is loaded
      if (!this.isModelLoaded) {
        await this.loadModel(options.model);
      }

      // Check if audio file exists
      if (!fs.existsSync(audioPath)) {
        return {
          success: false,
          error: `Audio file not found: ${audioPath}`
        };
      }

      console.log(`🎤 Starting transcription: ${audioPath}`);
      this.emit('progress', { stage: 'transcribing', progress: 0, message: 'Starting transcription' });

      const {
        language = 'auto',
        task = 'transcribe',
        chunkLength = 30,
        strideLength = 5
      } = options;

      // Get audio file info
      const audioBuffer = fs.readFileSync(audioPath);
      
      // Configure transcription options
      const transcriptionOptions = {
        language,
        task,
        chunk_length_s: chunkLength,
        stride_length_s: strideLength,
        return_timestamps: true,
        return_segments: true
      };

      console.log(`🎤 Transcription options:`, transcriptionOptions);

      // Perform transcription
      const result = await this.model(audioBuffer, transcriptionOptions);
      
      console.log(`✅ Transcription completed for: ${audioPath}`);
      this.emit('progress', { stage: 'transcribing', progress: 100, message: 'Transcription completed' });

      // Process and format segments
      const segments = this.processSegments(result);
      
      return {
        success: true,
        segments,
        duration: result.duration || 0
      };

    } catch (error) {
      console.error(`❌ Transcription error for ${audioPath}:`, error);
      return {
        success: false,
        error: `Transcription failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Process and format transcription segments
   */
  private processSegments(result: any): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];

    if (result.chunks && Array.isArray(result.chunks)) {
      // Handle chunked output
      result.chunks.forEach((chunk: any) => {
        if (chunk.timestamp && chunk.text) {
          segments.push({
            start: chunk.timestamp[0],
            end: chunk.timestamp[1],
            text: chunk.text.trim(),
            confidence: chunk.score || 0.8
          });
        }
      });
    } else if (result.segments && Array.isArray(result.segments)) {
      // Handle segment output
      result.segments.forEach((segment: any) => {
        segments.push({
          start: segment.start || 0,
          end: segment.end || 0,
          text: segment.text.trim(),
          confidence: segment.avg_logprob || 0.8
        });
      });
    } else if (result.text) {
      // Handle single text output (no timestamps)
      segments.push({
        start: 0,
        end: result.duration || 0,
        text: result.text.trim(),
        confidence: 0.8
      });
    }

    // Filter out empty segments and normalize confidence scores
    return segments
      .filter(segment => segment.text.length > 0)
      .map(segment => ({
        ...segment,
        confidence: Math.max(0, Math.min(1, segment.confidence)) // Clamp between 0 and 1
      }));
  }

  /**
   * Get available Whisper models
   */
  static getAvailableModels(): string[] {
    return [
      'Xenova/whisper-tiny',
      'Xenova/whisper-base',
      'Xenova/whisper-small',
      'Xenova/whisper-medium',
      'Xenova/whisper-large',
      'Xenova/whisper-large-v2'
    ];
  }

  /**
   * Get model info (size, performance characteristics)
   */
  static getModelInfo(modelName: string): { size: string; speed: string; accuracy: string } {
    const modelInfo: { [key: string]: { size: string; speed: string; accuracy: string } } = {
      'Xenova/whisper-tiny': { size: '39MB', speed: 'Fastest', accuracy: 'Low' },
      'Xenova/whisper-base': { size: '74MB', speed: 'Fast', accuracy: 'Medium' },
      'Xenova/whisper-small': { size: '244MB', speed: 'Medium', accuracy: 'Good' },
      'Xenova/whisper-medium': { size: '769MB', speed: 'Slow', accuracy: 'High' },
      'Xenova/whisper-large': { size: '1550MB', speed: 'Very Slow', accuracy: 'Very High' },
      'Xenova/whisper-large-v2': { size: '1550MB', speed: 'Very Slow', accuracy: 'Best' }
    };

    return modelInfo[modelName] || { size: 'Unknown', speed: 'Unknown', accuracy: 'Unknown' };
  }

  /**
   * Unload model to free memory
   */
  unloadModel(): void {
    if (this.model) {
      this.model = null;
      this.isModelLoaded = false;
      console.log('🧹 Whisper model unloaded');
    }
  }
} 
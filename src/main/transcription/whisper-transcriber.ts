import * as fs from 'fs';
import { EventEmitter } from 'events';
import { WaveFile } from 'wavefile';

// Define types for the dynamically imported module
type Pipeline = any;
type Env = {
  cacheDir: string;
  allowLocalModels: boolean;
};

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
  private pipeline: Pipeline | null = null;
  private env: Env | null = null;
  private transformersModule: any = null;

  constructor() {
    super();
    // Don't initialize in constructor to avoid immediate loading
  }

  /**
   * Initialize transformers module dynamically
   */
  private async initializeTransformers(): Promise<void> {
    if (this.transformersModule) {
      return; // Already initialized
    }

    try {
      console.log('🔄 Loading transformers module...');
      
      // Use Function constructor to ensure dynamic import is not transformed
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      this.transformersModule = await dynamicImport('@xenova/transformers');
      
      this.pipeline = this.transformersModule.pipeline;
      this.env = this.transformersModule.env;
      
      // Configure transformers to use local cache
      if (this.env) {
        this.env.cacheDir = './models';
        this.env.allowLocalModels = true;
      }
      
      console.log('✅ Transformers module loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load transformers module:', error);
      throw new Error(`Failed to initialize transformers: ${error}`);
    }
  }

  /**
   * Ensure transformers is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.transformersModule) {
      await this.initializeTransformers();
    }
  }

  /**
   * Load the Whisper model
   */
  async loadModel(modelName?: string): Promise<void> {
    if (this.isModelLoaded) {
      return;
    }

    // Ensure transformers is initialized
    await this.ensureInitialized();

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    const modelToLoad = modelName || this.defaultModel;
    
    try {
      console.log(`🤖 Loading Whisper model: ${modelToLoad}`);
      this.emit('progress', { stage: 'loading_model', progress: 0, message: `Loading model: ${modelToLoad}` });
      
      this.model = await this.pipeline('automatic-speech-recognition', modelToLoad, {
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
        language = 'en',  // Default to English instead of 'auto'
        task = 'transcribe',
        chunkLength = 30,
        strideLength = 5
      } = options;

      // Manual audio reading for Node.js environment (no AudioContext available)
      const audioBuffer = this.readWAVFileManually(audioPath);
      
      // Configure transcription options
      const transcriptionOptions = {
        language, // Always include language parameter
        task,
        chunk_length_s: chunkLength,
        stride_length_s: strideLength,
        return_timestamps: true,
        return_segments: true
      };

      console.log(`🎤 Transcription options:`, transcriptionOptions);

      // Perform transcription
      const result = await this.model(audioBuffer, transcriptionOptions);
      
      // DEBUG: Log the raw Whisper result
      console.log(`🔍 DEBUG: Raw Whisper result structure:`, JSON.stringify(result, null, 2));
      console.log(`🔍 DEBUG: Result has 'chunks'?`, !!result.chunks);
      console.log(`🔍 DEBUG: Result has 'segments'?`, !!result.segments);
      console.log(`🔍 DEBUG: Result has 'text'?`, !!result.text);
      console.log(`🔍 DEBUG: Result keys:`, Object.keys(result));
      
      console.log(`✅ Transcription completed for: ${audioPath}`);
      this.emit('progress', { stage: 'transcribing', progress: 100, message: 'Transcription completed' });

      // Process and format segments
      const segments = this.processSegments(result);
      
      console.log(`🔍 DEBUG: Final processed segments: ${segments.length}`);
      if (segments.length > 0) {
        console.log(`🔍 DEBUG: First segment:`, segments[0]);
      }
      
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
    console.log(`🔍 DEBUG: processSegments called with result:`, Object.keys(result));
    const segments: TranscriptionSegment[] = [];

    if (result.chunks && Array.isArray(result.chunks)) {
      console.log(`🔍 DEBUG: Processing ${result.chunks.length} chunks`);
      // Handle chunked output
      result.chunks.forEach((chunk: any, index: number) => {
        console.log(`🔍 DEBUG: Chunk ${index}:`, chunk);
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
      console.log(`🔍 DEBUG: Processing ${result.segments.length} segments`);
      // Handle segment output
      result.segments.forEach((segment: any, index: number) => {
        console.log(`🔍 DEBUG: Segment ${index}:`, segment);
        segments.push({
          start: segment.start || 0,
          end: segment.end || 0,
          text: segment.text.trim(),
          confidence: segment.avg_logprob || 0.8
        });
      });
    } else if (result.text) {
      console.log(`🔍 DEBUG: Processing single text result: "${result.text}"`);
      // Handle single text output (no timestamps)
      segments.push({
        start: 0,
        end: result.duration || 0,
        text: result.text.trim(),
        confidence: 0.8
      });
    } else {
      console.log(`🔍 DEBUG: No recognized result format found. Available keys:`, Object.keys(result));
    }

    console.log(`🔍 DEBUG: Found ${segments.length} segments before filtering`);
    
    // Filter out empty segments and normalize confidence scores
    const filteredSegments = segments
      .filter(segment => segment.text.length > 0)
      .map(segment => ({
        ...segment,
        confidence: Math.max(0, Math.min(1, segment.confidence)) // Clamp between 0 and 1
      }));
    
    console.log(`🔍 DEBUG: ${filteredSegments.length} segments after filtering`);
    return filteredSegments;
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
   * Manually read WAV file for Node.js environment using wavefile package
   * Following the exact pattern from HuggingFace Node.js documentation
   */
  private readWAVFileManually(filePath: string): Float32Array {
    console.log(`🎵 Reading WAV file manually: ${filePath}`);
    
    try {
      // Read the entire WAV file
      const buffer = fs.readFileSync(filePath);
      
      // Create WaveFile instance and load the buffer
      const wav = new WaveFile(buffer);
      
      // Convert to the format expected by Whisper (32-bit float, 16kHz)
      wav.toBitDepth('32f'); // Pipeline expects input as a Float32Array
      wav.toSampleRate(16000); // Whisper expects audio with a sampling rate of 16000
      
      // Get the audio samples
      let audioData: any = wav.getSamples();
      
      console.log(`🎵 WAV file processed, audio data type: ${Array.isArray(audioData) ? 'multi-channel array' : 'single array'}`);
      
      // Handle multi-channel audio (convert to mono)
      if (Array.isArray(audioData)) {
        if (audioData.length > 1) {
          // Merge channels (into first channel to save memory)
          const SCALING_FACTOR = Math.sqrt(2);
          console.log(`🎵 Converting ${audioData.length} channels to mono`);
          
          for (let i = 0; i < audioData[0].length; ++i) {
            audioData[0][i] = SCALING_FACTOR * (audioData[0][i] + audioData[1][i]) / 2;
          }
        }
        
        // Select first channel
        audioData = audioData[0];
      }
      
      console.log(`✅ WAV file converted to Float32Array: ${audioData.length} samples at 16kHz`);
      return audioData;
      
    } catch (error) {
      console.error(`❌ Error reading WAV file: ${error}`);
      throw new Error(`Failed to read WAV file: ${error}`);
    }
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
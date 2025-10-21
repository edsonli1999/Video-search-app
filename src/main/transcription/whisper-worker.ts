import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

// Types for communication
interface WorkerMessage {
  type: 'load-model' | 'transcribe' | 'progress' | 'result' | 'error';
  data?: any;
}

interface TranscriptionRequest {
  audioPath: string;
  options: {
    model?: string;
    language?: string;
    task?: string;
    chunkLength?: number;
    strideLength?: number;
  };
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

class WhisperWorker {
  private model: any = null;
  private transformersModule: any = null;
  private isModelLoaded = false;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  private async initialize() {
    try {
      // Load transformers module
      this.sendMessage('progress', { stage: 'loading-module', message: 'Loading transformers module...' });
      
      // Use Function constructor to create a proper dynamic import that TypeScript won't transform
      const importFunction = new Function('specifier', 'return import(specifier)');
      const transformers = await importFunction('@xenova/transformers');
      this.transformersModule = { pipeline: transformers.pipeline };
      
      this.isInitialized = true;
      this.sendMessage('progress', { stage: 'module-loaded', message: 'Transformers module loaded successfully' });
    } catch (error) {
      this.sendMessage('error', `Failed to load transformers: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Re-throw to mark initialization as failed
    }
  }

  private sendMessage(type: string, data?: any) {
    if (parentPort) {
      parentPort.postMessage({ type, data });
    }
  }

  async loadModel(modelName: string = 'Xenova/whisper-base'): Promise<void> {
    try {
      // Wait for initialization to complete before proceeding
      if (this.initializationPromise) {
        await this.initializationPromise;
      }

      // Check if transformers module is properly loaded
      if (!this.isInitialized || !this.transformersModule) {
        throw new Error('Transformers module not properly initialized');
      }

      if (this.isModelLoaded && this.model) {
        this.sendMessage('progress', { stage: 'model-ready', message: 'Model already loaded' });
        return;
      }

      this.sendMessage('progress', { stage: 'loading-model', message: `Loading Whisper model: ${modelName}` });

      // Set model cache directory
      const modelCacheDir = path.join(process.cwd(), 'models');
      process.env.TRANSFORMERS_CACHE = modelCacheDir;

      // Create pipeline for automatic speech recognition
      this.model = await this.transformersModule.pipeline(
        'automatic-speech-recognition',
        modelName,
        {
          quantized: true,
          cache_dir: modelCacheDir
        }
      );

      this.isModelLoaded = true;
      this.sendMessage('progress', { stage: 'model-loaded', message: `Whisper model loaded successfully: ${modelName}` });
    } catch (error) {
      this.isModelLoaded = false;
      this.sendMessage('error', `Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async transcribeAudio(request: TranscriptionRequest): Promise<void> {
    try {
      const { audioPath, options } = request;

      // Wait for initialization to complete first
      if (this.initializationPromise) {
        await this.initializationPromise;
      }

      // Ensure model is loaded
      if (!this.isModelLoaded) {
        await this.loadModel(options.model);
      }

      // Check if audio file exists
      if (!fs.existsSync(audioPath)) {
        this.sendMessage('error', `Audio file not found: ${audioPath}`);
        return;
      }

      this.sendMessage('progress', { stage: 'transcribing', progress: 0, message: 'Starting transcription' });

      const {
        language = 'en',
        task = 'transcribe',
        chunkLength = 30,
        strideLength = 5
      } = options;

      // Manual audio reading for Node.js environment
      const audioBuffer = this.readWAVFileManually(audioPath);
      
      // Configure transcription options
      const transcriptionOptions = {
        language,
        task,
        chunk_length_s: chunkLength,
        stride_length_s: strideLength,
        return_timestamps: true,
        return_segments: true
      };

      this.sendMessage('progress', { stage: 'transcribing', progress: 50, message: 'Processing with Whisper...' });

      // Perform transcription
      const result = await this.model(audioBuffer, transcriptionOptions);
      
      this.sendMessage('progress', { stage: 'transcribing', progress: 90, message: 'Processing segments...' });

      // Process segments with validation
      const segments = this.processSegments(result);
      
      this.sendMessage('progress', { stage: 'transcribing', progress: 100, message: 'Transcription completed' });
      
      // Send result back to main thread
      this.sendMessage('result', {
        success: true,
        segments
      });

    } catch (error) {
      this.sendMessage('error', `Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private readWAVFileManually(filePath: string): Float32Array {
    const buffer = fs.readFileSync(filePath);
    
    // Skip WAV header (44 bytes) and read PCM data
    const headerSize = 44;
    const pcmData = buffer.slice(headerSize);
    
    // Convert 16-bit PCM to Float32Array
    const samples = new Float32Array(pcmData.length / 2);
    for (let i = 0; i < samples.length; i++) {
      // Read 16-bit little-endian signed integer
      const int16 = pcmData.readInt16LE(i * 2);
      // Convert to float32 in range [-1, 1]
      samples[i] = int16 / 32768.0;
    }
    
    return samples;
  }

  private processSegments(result: any): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    let lastEndTime = 0; // Track the last end time for fixing missing timestamps

    if (result.chunks && Array.isArray(result.chunks)) {
      // Handle chunked output
      result.chunks.forEach((chunk: any, index: number) => {
        if (chunk.text && chunk.text.trim()) {
          let startTime = 0;
          let endTime = 0;
          
          // Handle various timestamp formats
          if (chunk.timestamp) {
            if (Array.isArray(chunk.timestamp)) {
              // timestamp is [start, end] array
              startTime = chunk.timestamp[0] ?? lastEndTime;
              endTime = chunk.timestamp[1] ?? (startTime + 1); // Default to 1 second duration if no end
            } else if (typeof chunk.timestamp === 'object') {
              // timestamp might be {start: x, end: y} object
              startTime = chunk.timestamp.start ?? chunk.timestamp[0] ?? lastEndTime;
              endTime = chunk.timestamp.end ?? chunk.timestamp[1] ?? (startTime + 1);
            } else if (typeof chunk.timestamp === 'number') {
              // Single timestamp value - use as start
              startTime = chunk.timestamp;
              endTime = startTime + 1; // Default 1 second duration
            }
          } else {
            // No timestamp at all - estimate based on position
            startTime = lastEndTime;
            endTime = startTime + 1;
          }
          
          // Ensure valid times
          startTime = Math.max(0, startTime || 0);
          endTime = Math.max(startTime + 0.1, endTime || (startTime + 1)); // Minimum 0.1 second duration
          
          segments.push({
            start: startTime,
            end: endTime,
            text: chunk.text.trim(),
            confidence: chunk.score || 0.8
          });
          
          lastEndTime = endTime;
        }
      });
    } else if (result.segments && Array.isArray(result.segments)) {
      // Handle segment output
      result.segments.forEach((segment: any) => {
        if (segment.text && segment.text.trim()) {
          const startTime = Math.max(0, segment.start ?? segment.start_time ?? lastEndTime);
          const endTime = Math.max(startTime + 0.1, segment.end ?? segment.end_time ?? (startTime + 1));
          
          segments.push({
            start: startTime,
            end: endTime,
            text: segment.text.trim(),
            confidence: segment.avg_logprob ?? segment.confidence ?? 0.8
          });
          
          lastEndTime = endTime;
        }
      });
    } else if (result.text) {
      // Handle single text output (no timestamps)
      segments.push({
        start: 0,
        end: result.duration || 10, // Default to 10 seconds if no duration
        text: result.text.trim(),
        confidence: 0.8
      });
    }

    // Deduplicate and validate segments
    const deduplicatedSegments = this.deduplicateSegments(segments);
    
    // Final validation: ensure all segments have valid timestamps
    const validatedSegments = deduplicatedSegments
      .filter(segment => {
        const isValid = segment.text.length > 0 && 
                       typeof segment.start === 'number' && 
                       typeof segment.end === 'number' &&
                       !isNaN(segment.start) &&
                       !isNaN(segment.end) &&
                       segment.end > segment.start;
        
        if (!isValid) {
          console.warn('Filtering out invalid segment:', segment);
        }
        
        return isValid;
      })
      .map(segment => ({
        start: Number(segment.start),
        end: Number(segment.end),
        text: segment.text,
        confidence: Math.max(0, Math.min(1, segment.confidence))
      }));
    
    console.log(`Processed ${validatedSegments.length} valid segments from ${segments.length} raw segments`);
    
    return validatedSegments;
  }

  private deduplicateSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
    if (segments.length === 0) return segments;

    // Sort segments by start time
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const deduplicated: TranscriptionSegment[] = [];
    let duplicatesFound = 0;
    
    for (const segment of sorted) {
      // Check if this segment overlaps significantly with any existing segment
      const overlapping = deduplicated.find(existing => 
        this.segmentsOverlap(existing, segment) && 
        this.textsSimilar(existing.text, segment.text)
      );
      
      if (overlapping) {
        duplicatesFound++;
        // Merge segments: keep the one with better confidence and extend time range
        const merged = this.mergeSegments(overlapping, segment);
        const index = deduplicated.indexOf(overlapping);
        deduplicated[index] = merged;
      } else {
        deduplicated.push(segment);
      }
    }
    
    if (duplicatesFound > 0) {
      this.sendMessage('progress', { stage: 'deduplication', message: `Merged ${duplicatesFound} duplicate segments` });
    }
    
    return deduplicated;
  }

  private segmentsOverlap(seg1: TranscriptionSegment, seg2: TranscriptionSegment): boolean {
    const overlap = Math.min(seg1.end, seg2.end) - Math.max(seg1.start, seg2.start);
    const minDuration = Math.min(seg1.end - seg1.start, seg2.end - seg2.start);
    return overlap > 0 && overlap / minDuration > 0.5;
  }

  private textsSimilar(text1: string, text2: string): boolean {
    const clean1 = text1.toLowerCase().trim();
    const clean2 = text2.toLowerCase().trim();
    
    if (clean1 === clean2) return true;
    if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
    
    const longer = clean1.length > clean2.length ? clean1 : clean2;
    const shorter = clean1.length > clean2.length ? clean2 : clean1;
    const commonChars = [...shorter].filter(char => longer.includes(char)).length;
    return commonChars / shorter.length > 0.8;
  }

  private mergeSegments(seg1: TranscriptionSegment, seg2: TranscriptionSegment): TranscriptionSegment {
    const primary = seg1.confidence >= seg2.confidence ? seg1 : seg2;
    const secondary = primary === seg1 ? seg2 : seg1;
    
    return {
      start: Math.min(seg1.start, seg2.start),
      end: Math.max(seg1.end, seg2.end),
      text: primary.text.length >= secondary.text.length ? primary.text : secondary.text,
      confidence: Math.max(seg1.confidence, seg2.confidence)
    };
  }
}

// Helper function to send messages to parent
function sendMessage(type: string, data?: any) {
  if (parentPort) {
    parentPort.postMessage({ type, data });
  }
}

// Initialize worker and set up message handling
const worker = new WhisperWorker();

if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case 'load-model':
          await worker.loadModel(message.data?.model);
          break;
        case 'transcribe':
          await worker.transcribeAudio(message.data);
          break;
        default:
          sendMessage('error', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      sendMessage('error', `Worker error: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
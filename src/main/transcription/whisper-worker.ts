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
    conditionOnPreviousText?: boolean;
    maxContextLength?: number;
    adaptiveChunking?: boolean;
  };
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

interface LoopDetectionResult {
  segments: TranscriptionSegment[];
  removedSegments: Array<{
    index: number;
    start: number;
    end: number;
    text: string;
  }>;
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
    const diagnosticTimestamp = Date.now();
    
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

      // Get file size and calculate duration to determine if this is a "large" video
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      // Read audio to calculate duration
      const audioBuffer = this.readWAVFileManually(audioPath);
      const sampleRate = 16000; // Standard rate we use
      const durationSeconds = audioBuffer.length / sampleRate;
      
      // Lower threshold: consider large if > 10MB OR > 15 minutes (900s)
      const isLargeFile = fileSizeMB > 10 || durationSeconds > 900;

      const {
        language = 'en',
        task = 'transcribe',
        // Adaptive defaults for large files - now with bigger chunks and more overlap
        chunkLength = isLargeFile ? 30 : 30,  // Same chunk size for both now
        strideLength = isLargeFile ? 5 : 5,    // Same overlap for both now
        conditionOnPreviousText = options.conditionOnPreviousText !== undefined 
          ? options.conditionOnPreviousText 
          : true, // Enable conditioning for all files by default
        maxContextLength = 100,  // Limit context to prevent loops
        adaptiveChunking = true
      } = options;

      // 🔍 DIAGNOSTIC LOGGING - File Analysis
      const diagnosticInfo = {
        timestamp: diagnosticTimestamp,
        audioPath,
        fileSizeMB: fileSizeMB.toFixed(2),
        durationSeconds: durationSeconds.toFixed(2),
        isLargeFile,
        chunkingStrategy: {
          chunkLength,
          strideLength,
          conditionOnPreviousText,
          maxContextLength,
          adaptiveChunking
        },
        detectionThresholds: {
          fileSizeMB: 10,
          durationSeconds: 900
        }
      };

      console.log('🔍 WHISPER WORKER DIAGNOSTICS:', JSON.stringify(diagnosticInfo, null, 2));
      
      this.sendMessage('progress', { 
        stage: 'transcribing', 
        progress: 5, 
        message: `File: ${fileSizeMB.toFixed(1)}MB, ${durationSeconds.toFixed(0)}s - Using ${isLargeFile ? 'LARGE' : 'STANDARD'} file strategy (chunk=${chunkLength}s, stride=${strideLength}s, conditioning=${conditionOnPreviousText})` 
      });

      // Configure transcription options
      const transcriptionOptions: any = {
        language,
        task,
        chunk_length_s: chunkLength,
        stride_length_s: strideLength,
        return_timestamps: true,
        return_segments: true,
        condition_on_previous_text: conditionOnPreviousText,
      };

      // Add max_new_tokens to prevent runaway generation
      if (isLargeFile) {
        transcriptionOptions.max_new_tokens = maxContextLength;
      }

      console.log('🔍 TRANSCRIPTION OPTIONS SENT TO MODEL:', JSON.stringify(transcriptionOptions, null, 2));

      this.sendMessage('progress', { stage: 'transcribing', progress: 50, message: 'Processing with Whisper...' });

      // Perform transcription
      const result = await this.model(audioBuffer, transcriptionOptions);
      
      // 🔍 DIAGNOSTIC LOGGING - Raw Whisper Output
      const rawChunkCount = result.chunks?.length || result.segments?.length || 0;
      const rawChunkSample = this.extractChunkSample(result, 10);
      
      console.log(`🔍 RAW WHISPER OUTPUT: ${rawChunkCount} chunks/segments received`);
      
      this.sendMessage('progress', { 
        stage: 'transcribing', 
        progress: 90, 
        message: `Processing ${rawChunkCount} segments...` 
      });

      // Process segments with enhanced validation and loop detection
      const processResult = this.processSegments(result, { detectLoops: isLargeFile });
      const segments = processResult.segments;
      const removedSegments = processResult.removedSegments;
      
      // 🔍 DIAGNOSTIC LOGGING - Post-processing results
      console.log(`🔍 POST-PROCESSING: ${segments.length} segments after deduplication/loop detection (from ${rawChunkCount} raw)`);
      if (removedSegments.length > 0) {
        console.log(`🔍 LOOP DETECTION: Removed ${removedSegments.length} segments`);
      }
      
      // Save diagnostic data to temp file
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const diagnosticFile = path.join(tempDir, `whisper-diagnostic-${diagnosticTimestamp}.json`);
      const diagnosticData = {
        ...diagnosticInfo,
        transcriptionOptions,
        rawOutput: {
          chunkCount: rawChunkCount,
          chunkSample: rawChunkSample,
          fullResult: {
            hasChunks: !!result.chunks,
            hasSegments: !!result.segments,
            hasText: !!result.text,
            chunkCount: result.chunks?.length,
            segmentCount: result.segments?.length
          }
        },
        loopDetection: {
          enabled: isLargeFile,
          removedCount: removedSegments.length,
          removedSample: removedSegments.slice(0, 5).map(seg => ({
            text: seg.text.substring(0, 100) + (seg.text.length > 100 ? '...' : ''),
            startTime: seg.start,
            endTime: seg.end,
            originalIndex: seg.index
          }))
        },
        finalOutput: {
          segmentCount: segments.length,
          reductionPercentage: ((rawChunkCount - segments.length) / rawChunkCount * 100).toFixed(1) + '%'
        }
      };
      
      fs.writeFileSync(diagnosticFile, JSON.stringify(diagnosticData, null, 2));
      console.log(`🔍 Diagnostic data saved to: ${diagnosticFile}`);
      
      this.sendMessage('progress', { stage: 'transcribing', progress: 100, message: 'Transcription completed' });
      
      // Send result back to main thread
      this.sendMessage('result', {
        success: true,
        segments
      });

    } catch (error) {
      console.error('🔍 TRANSCRIPTION ERROR:', error);
      this.sendMessage('error', `Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractChunkSample(result: any, sampleSize: number = 10): any[] {
    const sample: any[] = [];
    
    if (result.chunks && Array.isArray(result.chunks)) {
      const chunks = result.chunks.slice(0, sampleSize);
      chunks.forEach((chunk: any, index: number) => {
        sample.push({
          index,
          timestamp: chunk.timestamp,
          text: chunk.text?.substring(0, 100) || '',
          textLength: chunk.text?.length || 0,
          score: chunk.score
        });
      });
    } else if (result.segments && Array.isArray(result.segments)) {
      const segments = result.segments.slice(0, sampleSize);
      segments.forEach((segment: any, index: number) => {
        sample.push({
          index,
          start: segment.start ?? segment.start_time,
          end: segment.end ?? segment.end_time,
          text: segment.text?.substring(0, 100) || '',
          textLength: segment.text?.length || 0,
          confidence: segment.avg_logprob ?? segment.confidence
        });
      });
    }
    
    return sample;
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

  private processSegments(result: any, options: { detectLoops?: boolean } = {}): { segments: TranscriptionSegment[], removedSegments: any[] } {
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

    console.log(`🔍 BEFORE DEDUPLICATION: ${segments.length} segments`);

    // Apply enhanced deduplication and loop detection
    let removedSegments: any[] = [];
    let deduplicatedSegments: TranscriptionSegment[];
    
    if (options.detectLoops) {
      const loopResult = this.deduplicateAndDetectLoops(segments);
      deduplicatedSegments = loopResult.segments;
      removedSegments = loopResult.removedSegments;
    } else {
      deduplicatedSegments = this.deduplicateSegments(segments);
    }
    
    console.log(`🔍 AFTER DEDUPLICATION: ${deduplicatedSegments.length} segments`);

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
          console.warn('🔍 Filtering out invalid segment:', segment);
        }
        
        return isValid;
      })
      .map(segment => ({
        start: Number(segment.start),
        end: Number(segment.end),
        text: segment.text,
        confidence: Math.max(0, Math.min(1, segment.confidence))
      }));
    
    console.log(`🔍 FINAL VALIDATED: ${validatedSegments.length} segments from ${segments.length} raw segments`);
    
    return {
      segments: validatedSegments,
      removedSegments
    };
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
      console.log(`🔍 DEDUPLICATION: Merged ${duplicatesFound} duplicate segments`);
      this.sendMessage('progress', { stage: 'deduplication', message: `Merged ${duplicatesFound} duplicate segments` });
    }
    
    return deduplicated;
  }

  private deduplicateAndDetectLoops(segments: TranscriptionSegment[]): LoopDetectionResult {
    if (segments.length === 0) return { segments, removedSegments: [] };

    // First, do standard deduplication
    let processed = this.deduplicateSegments(segments);

    console.log(`🔍 LOOP DETECTION: Starting with ${processed.length} segments after deduplication`);

    // Then, detect and remove looping patterns
    const loopDetectionWindow = 3; // Reduced from 5 to be less aggressive
    const loopsToRemove: number[] = [];
    const removedSegments: any[] = [];

    for (let i = 0; i < processed.length - loopDetectionWindow; i++) {
      const currentSegment = processed[i];
      const currentText = currentSegment.text.toLowerCase();
      
      // Check if this text appears multiple times in the next few segments
      let repetitions = 0;
      const repetitionIndices: number[] = [];
      
      for (let j = i + 1; j < Math.min(i + loopDetectionWindow, processed.length); j++) {
        const candidateSegment = processed[j];
        // Also check timestamp proximity - loops usually happen in close time ranges
        const timeDiff = Math.abs(candidateSegment.start - currentSegment.end);
        const isTimeClose = timeDiff < 5.0; // Within 5 seconds
        
        if (this.textsSimilar(currentText, candidateSegment.text.toLowerCase(), 0.9) && isTimeClose) {
          repetitions++;
          repetitionIndices.push(j);
        }
      }
      
      // Only mark for removal if we found at least 2 repetitions (3 total occurrences)
      if (repetitions >= 2) {
        console.log(`🔍 LOOP DETECTED at segment ${i}: "${currentText.substring(0, 50)}..." repeated ${repetitions} times at indices [${repetitionIndices.join(', ')}]`);
        this.sendMessage('progress', { 
          stage: 'loop-detection', 
          message: `Detected potential loop: "${currentText.substring(0, 50)}..." repeated ${repetitions} times` 
        });
        
        // Add indices to removal list
        loopsToRemove.push(...repetitionIndices);
      }
    }

    // Remove detected loops and capture removed segments
    if (loopsToRemove.length > 0) {
      const uniqueIndices = [...new Set(loopsToRemove)].sort((a, b) => b - a);
      console.log(`🔍 LOOP REMOVAL: Removing ${uniqueIndices.length} looping segments at indices: [${uniqueIndices.slice(0, 10).join(', ')}${uniqueIndices.length > 10 ? '...' : ''}]`);
      
      // Capture removed segments before deletion
      for (const index of uniqueIndices) {
        if (processed[index]) {
          removedSegments.push({
            index,
            start: processed[index].start,
            end: processed[index].end,
            text: processed[index].text
          });
        }
      }
      
      // Remove segments in reverse order to maintain indices
      for (const index of uniqueIndices) {
        processed.splice(index, 1);
      }
      
      this.sendMessage('progress', { 
        stage: 'loop-detection', 
        message: `Removed ${uniqueIndices.length} looping segments` 
      });
    } else {
      console.log(`🔍 LOOP DETECTION: No loops found`);
    }

    return {
      segments: processed,
      removedSegments
    };
  }

  private segmentsOverlap(seg1: TranscriptionSegment, seg2: TranscriptionSegment): boolean {
    const overlap = Math.min(seg1.end, seg2.end) - Math.max(seg1.start, seg2.start);
    const minDuration = Math.min(seg1.end - seg1.start, seg2.end - seg2.start);
    return overlap > 0 && overlap / minDuration > 0.5;
  }

  private textsSimilar(text1: string, text2: string, threshold: number = 0.8): boolean {
    const clean1 = text1.toLowerCase().trim();
    const clean2 = text2.toLowerCase().trim();
    
    // Exact match
    if (clean1 === clean2) return true;
    
    // One contains the other (for very short segments)
    if (clean1.length < 10 || clean2.length < 10) {
      if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
    }
    
    // Use token-based Jaccard similarity instead of character-based
    const tokens1 = this.tokenize(clean1);
    const tokens2 = this.tokenize(clean2);
    
    if (tokens1.length === 0 || tokens2.length === 0) return false;
    
    // Calculate Jaccard similarity
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return false;
    
    const jaccardSimilarity = intersection.size / union.size;
    
    // For very similar sizes, also check token order similarity
    if (Math.abs(tokens1.length - tokens2.length) <= 2) {
      const orderSimilarity = this.calculateOrderSimilarity(tokens1, tokens2);
      // Weighted average: 70% Jaccard, 30% order
      const combinedSimilarity = (jaccardSimilarity * 0.7) + (orderSimilarity * 0.3);
      return combinedSimilarity > threshold;
    }
    
    return jaccardSimilarity > threshold;
  }

  private tokenize(text: string): string[] {
    // Simple tokenization: split on whitespace and punctuation
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
      .split(/\s+/)               // Split on whitespace
      .filter(token => token.length > 0);  // Remove empty tokens
  }

  private calculateOrderSimilarity(tokens1: string[], tokens2: string[]): number {
    // Calculate how many tokens appear in the same relative order
    const maxLen = Math.max(tokens1.length, tokens2.length);
    if (maxLen === 0) return 0;
    
    let matches = 0;
    const minLen = Math.min(tokens1.length, tokens2.length);
    
    for (let i = 0; i < minLen; i++) {
      if (tokens1[i] === tokens2[i]) {
        matches++;
      }
    }
    
    return matches / maxLen;
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
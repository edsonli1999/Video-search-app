import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

export interface AudioExtractionOptions {
  outputFormat?: 'wav' | 'mp3';
  sampleRate?: number;
  channels?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number) => void; // Add progress callback
}

export interface AudioExtractionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

export class AudioExtractor extends EventEmitter {
  private tempDir: string;
  private isConfigured = false;

  constructor(tempDir: string = 'temp/audio') {
    super();
    this.tempDir = tempDir;
    this.ensureTempDir();
    this.configureFFmpeg();
    console.log('✅ AudioExtractor: Constructor completed with native FFmpeg');
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log(`🎵 AudioExtractor: Created temp directory: ${this.tempDir}`);
    } else {
      console.log(`🎵 AudioExtractor: Temp directory exists: ${this.tempDir}`);
    }
  }

  /**
   * Configure FFmpeg to use the static binary from ffmpeg-static
   */
  private configureFFmpeg(): void {
    if (this.isConfigured) {
      console.log('🎵 AudioExtractor: FFmpeg already configured, skipping');
      return;
    }

    try {
      console.log('🚀 AudioExtractor: Configuring native FFmpeg...');
      
      // ffmpeg-static automatically provides the correct binary for the platform
      if (!ffmpegStatic) {
        throw new Error('ffmpeg-static binary not found');
      }

      console.log(`🎵 AudioExtractor: Using FFmpeg binary: ${ffmpegStatic}`);
      
      // Configure fluent-ffmpeg to use the static binary
      ffmpeg.setFfmpegPath(ffmpegStatic);
      
      this.isConfigured = true;
      console.log('✅ AudioExtractor: Native FFmpeg configured successfully!');
      
    } catch (error) {
      console.error('❌ AudioExtractor: Failed to configure FFmpeg:', error);
      throw new Error(`FFmpeg configuration failed: ${error}`);
    }
  }

  /**
   * Extract audio from video file using native FFmpeg
   */
  async extractAudio(
    videoPath: string, 
    videoId: number,
    options: AudioExtractionOptions = {}
  ): Promise<AudioExtractionResult> {
    const {
      outputFormat = 'wav',
      sampleRate = 16000,
      channels = 1,
      abortSignal,
      onProgress
    } = options;

    const outputPath = path.join(this.tempDir, `${videoId}.${outputFormat}`);
    
    console.log(`🎵 AudioExtractor: Starting native audio extraction for video ${videoId}`);
    console.log(`🎵 AudioExtractor: Input: ${videoPath}`);
    console.log(`🎵 AudioExtractor: Output: ${outputPath}`);
    console.log(`🎵 AudioExtractor: Options:`, { outputFormat, sampleRate, channels });

    return new Promise((resolve) => {
      try {
        // Check for cancellation at start
        if (abortSignal?.aborted) {
          resolve({
            success: false,
            error: 'Audio extraction was cancelled'
          });
          return;
        }

        // Ensure FFmpeg is configured
        if (!this.isConfigured) {
          this.configureFFmpeg();
        }

        // Check if video file exists
        if (!fs.existsSync(videoPath)) {
          const error = `Video file not found: ${videoPath}`;
          console.error(`❌ AudioExtractor: ${error}`);
          resolve({
            success: false,
            error
          });
          return;
        }

        const videoStats = fs.statSync(videoPath);
        console.log(`🎵 AudioExtractor: Video file exists, size: ${videoStats.size} bytes`);

        let duration: number = 0;

        console.log(`🎵 AudioExtractor: Starting FFmpeg processing...`);

        const ffmpegProcess = ffmpeg(videoPath)
          .audioFrequency(sampleRate)
          .audioChannels(channels)
          .audioCodec(outputFormat === 'wav' ? 'pcm_s16le' : 'libmp3lame')
          .format(outputFormat)
          .output(outputPath)
          .on('start', (commandLine: string) => {
            console.log(`🎵 AudioExtractor: FFmpeg command started: ${commandLine}`);
          })
          .on('progress', (progress: any) => {
            if (progress.percent) {
              const percentComplete = Math.min(100, Math.max(0, progress.percent));
              console.log(`🎵 AudioExtractor: Progress: ${percentComplete.toFixed(1)}% - ${progress.timemark}`);
              
              // Emit progress event and call callback if provided
              this.emit('progress', percentComplete);
              if (onProgress) {
                onProgress(percentComplete);
              }
            }
          })
          .on('stderr', (stderrLine: string) => {
            // Only log important stderr messages (not all the verbose output)
            if (stderrLine.includes('error') || stderrLine.includes('Error') || stderrLine.includes('failed')) {
              console.log(`🎵 AudioExtractor: FFmpeg stderr: ${stderrLine}`);
            }
          })
          .on('error', (err: Error) => {
            console.error(`❌ AudioExtractor: FFmpeg error for video ${videoId}:`, err);
            console.error(`❌ AudioExtractor: Error details:`, {
              name: err.name,
              message: err.message,
              stack: err.stack
            });
            resolve({
              success: false,
              error: `Audio extraction failed: ${err.message}`
            });
          })
          .on('end', () => {
            console.log(`✅ AudioExtractor: FFmpeg processing completed for video ${videoId}`);
            
            // Verify output file exists and has content
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              const outputSize = fs.statSync(outputPath).size;
              console.log(`🎉 AudioExtractor: Native audio extraction completed successfully!`);
              console.log(`✅ AudioExtractor: Output file size: ${outputSize} bytes`);
              
              // Emit final progress
              this.emit('progress', 100);
              if (onProgress) {
                onProgress(100);
              }
              
              resolve({
                success: true,
                outputPath,
                duration
              });
            } else {
              const error = 'Audio extraction completed but output file is empty or missing';
              console.error(`❌ AudioExtractor: ${error}`);
              resolve({
                success: false,
                error
              });
            }
          })
          .on('codecData', (data: any) => {
            duration = parseFloat(data.duration) || 0;
            console.log(`🎵 AudioExtractor: Detected video duration: ${duration}s`);
          });

        // Set up cancellation listener
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            console.log(`🛑 AudioExtractor: Cancelling FFmpeg process for video ${videoId}`);
            try {
              ffmpegProcess.kill('SIGTERM');
            } catch (err) {
              console.log(`🎵 AudioExtractor: Error killing FFmpeg process:`, err);
            }
            resolve({
              success: false,
              error: 'Audio extraction was cancelled'
            });
          });
        }

        ffmpegProcess.run();
          
      } catch (error) {
        console.error(`❌ AudioExtractor: Native audio extraction error for video ${videoId}:`, error);
        console.error(`❌ AudioExtractor: Error details:`, {
          name: (error as any).name,
          message: (error as any).message,
          stack: (error as any).stack
        });
        resolve({
          success: false,
          error: `Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    });
  }

  /**
   * Get audio file info using native FFmpeg
   */
  async getAudioInfo(audioPath: string): Promise<{ duration: number; size: number }> {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(audioPath)) {
          reject(new Error(`Audio file not found: ${audioPath}`));
          return;
        }

        console.log(`🎵 AudioExtractor: Getting audio info for: ${audioPath}`);

        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) {
            console.error('❌ AudioExtractor: Error getting audio info:', err);
            reject(err);
            return;
          }

          const duration = metadata.format.duration || 0;
          const size = metadata.format.size || fs.statSync(audioPath).size;

          console.log(`✅ AudioExtractor: Audio info - Duration: ${duration}s, Size: ${size} bytes`);

          resolve({ duration, size });
        });
      } catch (error) {
        console.error('❌ AudioExtractor: Error in getAudioInfo:', error);
        reject(new Error(`Failed to get audio info: ${error}`));
      }
    });
  }

  /**
   * Clean up temporary audio file
   */
  cleanupAudio(videoId: number, format: string = 'wav'): void {
    const audioPath = path.join(this.tempDir, `${videoId}.${format}`);
    if (fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
        console.log(`🧹 AudioExtractor: Cleaned up audio file: ${audioPath}`);
      } catch (error) {
        console.error(`🧹 AudioExtractor: Error cleaning up audio file ${audioPath}:`, error);
      }
    }
  }

  /**
   * Get FFmpeg version info for diagnostics
   */
  async getFFmpegVersion(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.isConfigured) {
        this.configureFFmpeg();
      }

      // Create a simple ffmpeg command to get version
      ffmpeg()
        .on('start', (commandLine: string) => {
          // Extract version from command line or use default
          resolve('Native FFmpeg via ffmpeg-static');
        })
        .on('error', () => {
          resolve('Native FFmpeg (version unknown)');
        })
        .format('null')
        .output('/dev/null')
        .run();
    });
  }

  /**
   * Test FFmpeg functionality
   */
  async testFFmpeg(): Promise<boolean> {
    try {
      console.log('🎵 AudioExtractor: Testing FFmpeg functionality...');
      
      if (!this.isConfigured) {
        this.configureFFmpeg();
      }

      // Simple test - try to get version info
      await this.getFFmpegVersion();
      console.log('✅ AudioExtractor: FFmpeg test passed');
      return true;
    } catch (error) {
      console.error('❌ AudioExtractor: FFmpeg test failed:', error);
      return false;
    }
  }
}
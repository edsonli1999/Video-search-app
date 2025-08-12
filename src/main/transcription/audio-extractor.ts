import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';

export interface AudioExtractionOptions {
  outputFormat?: 'wav' | 'mp3';
  sampleRate?: number;
  channels?: number;
  audioCodec?: string;
}

export interface AudioExtractionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

export class AudioExtractor {
  private tempDir: string;

  constructor(tempDir: string = 'temp/audio') {
    this.tempDir = tempDir;
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract audio from video file for transcription
   * Outputs 16kHz mono WAV format optimized for Whisper
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
      audioCodec = 'pcm_s16le'
    } = options;

    const outputPath = path.join(this.tempDir, `${videoId}.${outputFormat}`);

    return new Promise((resolve) => {
      // Check if video file exists
      if (!fs.existsSync(videoPath)) {
        resolve({
          success: false,
          error: `Video file not found: ${videoPath}`
        });
        return;
      }

      // Check available disk space (rough estimate: 1MB per minute of audio)
      const stats = fs.statSync(videoPath);
      const estimatedSize = stats.size * 0.1; // Rough estimate for audio size
      const availableSpace = this.getAvailableDiskSpace();
      
      if (availableSpace < estimatedSize) {
        resolve({
          success: false,
          error: `Insufficient disk space. Available: ${this.formatBytes(availableSpace)}, Estimated needed: ${this.formatBytes(estimatedSize)}`
        });
        return;
      }

      let duration: number = 0;

      ffmpeg(videoPath)
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .audioCodec(audioCodec)
        .format(outputFormat)
        .output(outputPath)
        .on('start', (commandLine: string) => {
          console.log(`🎵 Audio extraction started for video ${videoId}:`, commandLine);
        })
        .on('progress', (progress: any) => {
          if (progress.percent) {
            console.log(`🎵 Audio extraction progress for video ${videoId}: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('stderr', (stderrLine: string) => {
          console.log(`🎵 FFmpeg stderr for video ${videoId}:`, stderrLine);
        })
        .on('error', (err: Error) => {
          console.error(`🎵 Audio extraction error for video ${videoId}:`, err);
          resolve({
            success: false,
            error: `Audio extraction failed: ${err.message}`
          });
        })
        .on('end', () => {
          console.log(`🎵 Audio extraction completed for video ${videoId}: ${outputPath}`);
          
          // Verify output file exists and has content
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            resolve({
              success: true,
              outputPath,
              duration
            });
          } else {
            resolve({
              success: false,
              error: 'Audio extraction completed but output file is empty or missing'
            });
          }
        })
        .on('codecData', (data: any) => {
          duration = parseFloat(data.duration);
        })
        .run();
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
        console.log(`🧹 Cleaned up audio file: ${audioPath}`);
      } catch (error) {
        console.error(`🧹 Error cleaning up audio file ${audioPath}:`, error);
      }
    }
  }

  /**
   * Get available disk space in bytes
   */
  private getAvailableDiskSpace(): number {
    try {
      const stats = fs.statSync(this.tempDir);
      // This is a rough estimate - in a real implementation you'd use a proper disk space library
      return 1024 * 1024 * 1024; // Assume 1GB available for now
    } catch (error) {
      console.error('Error checking disk space:', error);
      return 0;
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get audio file info
   */
  getAudioInfo(audioPath: string): Promise<{ duration: number; size: number }> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(audioPath)) {
        reject(new Error(`Audio file not found: ${audioPath}`));
        return;
      }

      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const duration = metadata.format.duration || 0;
        const size = metadata.format.size || 0;

        resolve({ duration, size });
      });
    });
  }
} 
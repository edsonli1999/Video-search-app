import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
const ffmpegStatic = require('ffmpeg-static');

export interface AudioExtractionResult {
  audioPath: string;
  duration: number;
}

export class AudioExtractor {
  private tempDir: string;

  constructor() {
    // Create temp directory for audio files
    this.tempDir = path.join(__dirname, '../../../temp');
    this.ensureTempDir();

    // Set ffmpeg path if using static binary
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract audio from video file and convert to WAV format required by Whisper
   * @param videoPath Path to the input video file
   * @returns Promise with audio file path and duration
   */
  async extractAudio(videoPath: string): Promise<AudioExtractionResult> {
    return new Promise((resolve, reject) => {
      try {
        // Generate unique filename for extracted audio
        const videoName = path.basename(videoPath, path.extname(videoPath));
        const audioPath = path.join(this.tempDir, `${videoName}_${Date.now()}.wav`);

        console.log(`🎵 AudioExtractor: Extracting audio from ${videoPath}`);
        console.log(`🎵 AudioExtractor: Output path: ${audioPath}`);

        const command = ffmpeg(videoPath)
          .audioCodec('pcm_s16le') // Use PCM 16-bit little-endian for Whisper compatibility
          .audioFrequency(16000)   // Whisper requires 16kHz sample rate
          .audioChannels(1)        // Convert to mono
          .format('wav')
          .on('start', (commandLine: string) => {
            console.log(`🎵 AudioExtractor: FFmpeg command: ${commandLine}`);
          })
          .on('progress', (progress: any) => {
            if (progress.percent) {
              console.log(`🎵 AudioExtractor: Progress: ${Math.round(progress.percent)}%`);
            }
          })
          .on('end', () => {
            console.log(`✅ AudioExtractor: Audio extraction completed: ${audioPath}`);
            
            // Get duration using ffprobe
            ffmpeg.ffprobe(audioPath, (err: any, metadata: any) => {
              if (err) {
                console.error('❌ AudioExtractor: Error getting audio duration:', err);
                reject(err);
                return;
              }
              
              const duration = metadata.format.duration || 0;
              console.log(`🎵 AudioExtractor: Audio duration: ${duration} seconds`);
              
              resolve({
                audioPath,
                duration
              });
            });
          })
          .on('error', (err: any, stdout: any, stderr: any) => {
            console.error('❌ AudioExtractor: FFmpeg error:', err);
            console.error('❌ AudioExtractor: FFmpeg stderr:', stderr);
            reject(err);
          });

        command.save(audioPath);

      } catch (error) {
        console.error('❌ AudioExtractor: Unexpected error:', error);
        reject(error);
      }
    });
  }

  /**
   * Clean up temporary audio file
   * @param audioPath Path to the temporary audio file
   */
  async cleanupAudio(audioPath: string): Promise<void> {
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🗑️ AudioExtractor: Cleaned up audio file: ${audioPath}`);
      }
    } catch (error) {
      console.error('❌ AudioExtractor: Error cleaning up audio file:', error);
    }
  }

  /**
   * Clean up all temporary audio files
   */
  async cleanupAllTempFiles(): Promise<void> {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          if (file.endsWith('.wav')) {
            const filePath = path.join(this.tempDir, file);
            fs.unlinkSync(filePath);
            console.log(`🗑️ AudioExtractor: Cleaned up temp file: ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ AudioExtractor: Error cleaning up temp files:', error);
    }
  }
} 
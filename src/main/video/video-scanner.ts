import * as fs from 'fs';
import * as path from 'path';
import { VideoFile, SUPPORTED_VIDEO_FORMATS } from '../../shared/types';
import { getDatabase } from '../database/database';

export class VideoScanner {
  private db = getDatabase();

  async scanFolder(folderPath: string): Promise<VideoFile[]> {
    const videoFiles: VideoFile[] = [];
    
    try {
      await this.scanDirectory(folderPath, videoFiles);
      
      // Store new videos in database
      for (const video of videoFiles) {
        const existing = this.db.getVideoByPath(video.filePath);
        if (!existing) {
          const videoId = this.db.insertVideo(video);
          video.id = videoId;
        } else {
          // Update existing video info if needed
          videoFiles[videoFiles.indexOf(video)] = existing;
        }
      }
      
      return videoFiles;
    } catch (error) {
      console.error('Error scanning folder:', error);
      throw error;
    }
  }

  private async scanDirectory(dirPath: string, videoFiles: VideoFile[]): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, videoFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          if (SUPPORTED_VIDEO_FORMATS.includes(ext as any)) {
            try {
              const stats = await fs.promises.stat(fullPath);
              
              const videoFile: VideoFile = {
                filePath: fullPath,
                fileName: entry.name,
                fileSize: stats.size,
                transcriptionStatus: 'pending'
              };
              
              videoFiles.push(videoFile);
            } catch (statError) {
              console.warn(`Could not get stats for ${fullPath}:`, statError);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  async getVideoMetadata(filePath: string): Promise<{ duration?: number }> {
    // For MVP, we'll return empty metadata
    // In a full implementation, this would use FFmpeg to get video duration
    return {};
  }

  isVideoFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_VIDEO_FORMATS.includes(ext as any);
  }

  async validateVideoFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile() && this.isVideoFile(filePath);
    } catch {
      return false;
    }
  }
}

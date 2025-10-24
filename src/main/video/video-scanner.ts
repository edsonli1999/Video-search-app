import * as fs from 'fs';
import * as path from 'path';
import { VideoFile, SUPPORTED_VIDEO_FORMATS } from '../../shared/types';
import { getDatabase } from '../database/database';

export class VideoScanner {
  private db = getDatabase();

  async scanFolder(folderPath: string): Promise<VideoFile[]> {
    console.log(`📂 Starting folder scan: ${folderPath}`);
    
    try {
      // Step 1: Get all existing videos from this folder in the database
      const existingVideos = this.db.getVideosByFolder(folderPath, true); // Include deleted
      const seenPaths = new Set<string>();
      
      console.log(`📊 Found ${existingVideos.length} existing videos in database for this folder`);
      
      // Step 2: Scan the directory and collect all video files
      const videoFiles: VideoFile[] = [];
      await this.scanDirectory(folderPath, videoFiles);
      
      console.log(`🔍 Found ${videoFiles.length} video files in filesystem`);
      
      // Step 3: Process each found video file
      for (const video of videoFiles) {
        seenPaths.add(video.filePath);
        
        const existing = this.db.getVideoByPath(video.filePath);
        if (!existing) {
          // New video - insert it
          const videoId = this.db.insertVideo(video);
          video.id = videoId;
          console.log(`✨ Added new video: ${video.fileName}`);
        } else if (existing.deleted) {
          // Previously deleted video is back - restore it
          this.db.restoreVideo(existing.id!);
          video.id = existing.id;
          video.transcriptionStatus = existing.transcriptionStatus;
          console.log(`♻️ Restored previously deleted video: ${video.fileName}`);
        } else {
          // Existing video - use its data
          video.id = existing.id;
          video.transcriptionStatus = existing.transcriptionStatus;
          video.createdAt = existing.createdAt;
          video.updatedAt = existing.updatedAt;
        }
      }
      
      // Step 4: Find videos that no longer exist in the filesystem
      const missingVideos = existingVideos.filter(v => !seenPaths.has(v.filePath) && !v.deleted);
      
      if (missingVideos.length > 0) {
        console.log(`🗑️ Found ${missingVideos.length} videos that no longer exist in filesystem:`);
        for (const missing of missingVideos) {
          console.log(`  - ${missing.fileName} (${missing.filePath})`);
          try {
            // Soft delete to preserve transcript history
            this.db.softDeleteVideo(missing.id!);
            console.log(`  ✓ Marked as deleted: ${missing.fileName}`);
          } catch (error) {
            console.error(`  ✗ Failed to mark as deleted: ${missing.fileName}`, error);
          }
        }
      }
      
      console.log(`✅ Folder scan completed. Active videos: ${videoFiles.length}`);
      
      return videoFiles;
    } catch (error) {
      console.error('❌ Error scanning folder:', error);
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
              console.warn(`⚠️ Could not get stats for ${fullPath}:`, statError);
              // Skip files we can't stat (permission issues, etc.)
            }
          }
        }
      }
    } catch (error) {
      if ((error as any).code === 'EACCES') {
        console.warn(`⚠️ Permission denied for directory ${dirPath}, skipping...`);
        // Don't throw, just skip directories we can't access
      } else {
        console.error(`❌ Error reading directory ${dirPath}:`, error);
        throw error;
      }
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
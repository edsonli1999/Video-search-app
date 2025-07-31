const fs = require('fs');
const path = require('path');
const { SUPPORTED_VIDEO_FORMATS } = require('../../shared/types.js');
const { getDatabase } = require('../database/database.js');

class VideoScanner {
  constructor() {
    this.db = getDatabase();
  }

  async scanFolder(folderPath) {
    const videoFiles = [];
    
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

  async scanDirectory(dirPath, videoFiles) {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, videoFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          if (SUPPORTED_VIDEO_FORMATS.includes(ext)) {
            try {
              const stats = await fs.promises.stat(fullPath);
              
              const videoFile = {
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

  async getVideoMetadata(filePath) {
    // For MVP, we'll return empty metadata
    // In a full implementation, this would use FFmpeg to get video duration
    return {};
  }

  isVideoFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_VIDEO_FORMATS.includes(ext);
  }

  async validateVideoFile(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile() && this.isVideoFile(filePath);
    } catch {
      return false;
    }
  }
}

module.exports = {
  VideoScanner
}; 
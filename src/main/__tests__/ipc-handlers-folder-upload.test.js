const os = require('os');
const fs = require('fs');
const path = require('path');

// Mock Electron APIs that can't be reliably tested
// Force database to use memory mode by making app.getPath fail
jest.mock('electron', () => ({
  dialog: { showOpenDialog: jest.fn() },
  ipcMain: { handle: jest.fn() },
  app: { 
    getPath: jest.fn().mockImplementation(() => {
      // Return invalid path to force memory mode
      throw new Error('Test environment - using memory mode');
    })
  }
}));

describe('IPC Handlers - Folder Selection and Video Scanning', () => {
  let tempDir;
  let handlers = {};

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-handlers-test-'));
    
    // Reset all mocks and clear require cache to get fresh database instance
    jest.clearAllMocks();
    delete require.cache[require.resolve('../ipc/handlers')];
    delete require.cache[require.resolve('../database/database')];
    
    // Setup handlers by importing and extracting them
    const { setupIpcHandlers } = require('../ipc/handlers');
    const { ipcMain } = require('electron');
    
    setupIpcHandlers();
    
    // Extract handler functions from mock calls
    handlers = {};
    ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
      handlers[channel] = handler;
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('SELECT_FOLDER Handler', () => {
    test('should successfully return selected folder path', async () => {
      const { dialog } = require('electron');
      const expectedPath = '/users/test/videos';
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [expectedPath]
      });

      const result = await handlers['select-folder']();

      expect(result).toBe(expectedPath);
      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory'],
        title: 'Select Video Folder'
      });
    });

    test('should return null when dialog is cancelled', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const result = await handlers['select-folder']();

      expect(result).toBeNull();
    });

    test('should return null when no file paths selected', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      const result = await handlers['select-folder']();

      expect(result).toBeNull();
    });

    test('should handle dialog errors gracefully', async () => {
      const { dialog } = require('electron');
      const dialogError = new Error('Dialog failed to open');
      
      dialog.showOpenDialog.mockRejectedValue(dialogError);

      await expect(handlers['select-folder']()).rejects.toThrow('Dialog failed to open');
    });

    test('should handle system permission errors during dialog', async () => {
      const { dialog } = require('electron');
      const permissionError = Object.assign(new Error('Access denied'), { code: 'EACCES' });
      
      dialog.showOpenDialog.mockRejectedValue(permissionError);

      await expect(handlers['select-folder']()).rejects.toThrow('Access denied');
    });

    test('should handle multiple selected paths by returning first one', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/one', '/path/two', '/path/three']
      });

      const result = await handlers['select-folder']();

      expect(result).toBe('/path/one');
    });

    test('should handle dialog returning undefined filePaths', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: undefined
      });

      const result = await handlers['select-folder']();

      expect(result).toBeNull();
    });

    test('should handle dialog returning null result', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue(null);

      const result = await handlers['select-folder']();

      expect(result).toBeNull();
    });
  });

  describe('SCAN_VIDEOS Handler', () => {
    test('should successfully scan folder with video files', async () => {
      // Create test video files
      const videoFiles = [
        { name: 'movie.mp4', size: 1024 },
        { name: 'documentary.mkv', size: 2048 },
        { name: 'clip.avi', size: 512 },
        { name: 'presentation.mov', size: 768 },
        { name: 'stream.webm', size: 256 }
      ];

      videoFiles.forEach(file => {
        fs.writeFileSync(path.join(tempDir, file.name), Buffer.alloc(file.size));
      });

      // Also create non-video files that should be ignored
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'text content');
      fs.writeFileSync(path.join(tempDir, 'image.jpg'), Buffer.alloc(100));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(5); // Only video files
      
      const foundNames = result.map(v => v.fileName).sort();
      const expectedNames = videoFiles.map(f => f.name).sort();
      expect(foundNames).toEqual(expectedNames);

      // Verify file properties
      result.forEach(video => {
        expect(video.filePath).toContain(tempDir);
        expect(video.transcriptionStatus).toBe('pending');
        expect(typeof video.fileName).toBe('string');
        expect(typeof video.fileSize).toBe('number');
        expect(video.fileSize).toBeGreaterThan(0);
      });
    });

    test('should handle nested directories recursively', async () => {
      // Create nested structure
      const level1 = path.join(tempDir, 'movies');
      const level2 = path.join(level1, '2024');
      const level3 = path.join(level2, 'action');
      
      fs.mkdirSync(level1, { recursive: true });
      fs.mkdirSync(level2, { recursive: true });
      fs.mkdirSync(level3, { recursive: true });

      // Place videos at different levels
      fs.writeFileSync(path.join(tempDir, 'root.mp4'), Buffer.alloc(1000));
      fs.writeFileSync(path.join(level1, 'level1.mkv'), Buffer.alloc(2000));
      fs.writeFileSync(path.join(level2, 'level2.avi'), Buffer.alloc(3000));
      fs.writeFileSync(path.join(level3, 'level3.mov'), Buffer.alloc(4000));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(4);
      
      // Verify all levels were scanned
      const fileSizes = result.map(v => v.fileSize).sort();
      expect(fileSizes).toEqual([1000, 2000, 3000, 4000]);
    });

    test('should return empty array for folder with no video files', async () => {
      // Create non-video files only
      fs.writeFileSync(path.join(tempDir, 'document.pdf'), 'pdf content');
      fs.writeFileSync(path.join(tempDir, 'image.png'), Buffer.alloc(100));
      fs.writeFileSync(path.join(tempDir, 'audio.mp3'), Buffer.alloc(200));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toEqual([]);
    });

    test('should return empty array for empty folder', async () => {
      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toEqual([]);
    });

    test('should handle non-existent folder path', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      await expect(handlers['scan-videos'](null, nonExistentPath))
        .rejects.toThrow();
    });

    test('should handle scanning a file instead of directory', async () => {
      const filePath = path.join(tempDir, 'not-a-directory.txt');
      fs.writeFileSync(filePath, 'content');

      await expect(handlers['scan-videos'](null, filePath))
        .rejects.toThrow();
    });

    test('should handle permission denied errors', async () => {
      // Create a video file first
      fs.writeFileSync(path.join(tempDir, 'video.mp4'), Buffer.alloc(100));

      // Mock readdir to simulate permission error
      const originalReaddir = fs.promises.readdir;
      fs.promises.readdir = jest.fn().mockRejectedValue(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' })
      );

      await expect(handlers['scan-videos'](null, tempDir))
        .rejects.toThrow('Permission denied');

      fs.promises.readdir = originalReaddir;
    });

    test('should handle file stat errors gracefully', async () => {
      // Create a video file
      const videoPath = path.join(tempDir, 'video.mp4');
      fs.writeFileSync(videoPath, Buffer.alloc(100));

      // Mock stat to fail for this specific file
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockImplementation(async (filePath) => {
        if (filePath === videoPath) {
          throw new Error('File disappeared during scan');
        }
        return originalStat(filePath);
      });

      // Should continue scanning and not crash, but file won't be included
      const result = await handlers['scan-videos'](null, tempDir);
      expect(result).toEqual([]);

      fs.promises.stat = originalStat;
    });

    test('should handle mixed case video extensions', async () => {
      const mixedCaseFiles = [
        'video.MP4',
        'movie.MKV',
        'clip.AVI',
        'stream.WeBm'
      ];

      mixedCaseFiles.forEach(fileName => {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      });

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(mixedCaseFiles.length);
      
      const foundNames = result.map(v => v.fileName).sort();
      expect(foundNames).toEqual(mixedCaseFiles.sort());
    });

    test('should handle files with special characters in names', async () => {
      const specialFiles = [
        'movie with spaces.mp4',
        'movie-with-dashes.mkv',
        'movie_with_underscores.avi',
        'movie(with)parentheses.mov',
        'movie[with]brackets.webm',
        'movie&with&ampersands.m4v'
      ];

      specialFiles.forEach(fileName => {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      });

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(specialFiles.length);
      
      const foundNames = result.map(v => v.fileName).sort();
      expect(foundNames).toEqual(specialFiles.sort());
    });

    test('should handle extremely deep directory nesting', async () => {
      // Create deep nesting (15 levels)
      let currentDir = tempDir;
      for (let i = 0; i < 15; i++) {
        currentDir = path.join(currentDir, `level-${i}`);
        fs.mkdirSync(currentDir);
      }

      // Place video at deepest level
      fs.writeFileSync(path.join(currentDir, 'deep-video.mp4'), Buffer.alloc(500));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('deep-video.mp4');
      expect(result[0].fileSize).toBe(500);
    });

    test('should handle null or undefined folder path', async () => {
      await expect(handlers['scan-videos'](null, null))
        .rejects.toThrow();

      await expect(handlers['scan-videos'](null, undefined))
        .rejects.toThrow();
    });

    test('should handle empty string folder path', async () => {
      await expect(handlers['scan-videos'](null, ''))
        .rejects.toThrow();
    });

    test('should integrate with database correctly for new videos', async () => {
      fs.writeFileSync(path.join(tempDir, 'new-video.mp4'), Buffer.alloc(1000));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined(); // Real database assigns an ID
      expect(result[0].filePath).toBe(path.join(tempDir, 'new-video.mp4'));
      expect(result[0].fileName).toBe('new-video.mp4');
      expect(result[0].fileSize).toBe(1000);
      expect(result[0].transcriptionStatus).toBe('pending');
    });

    test('should integrate with database correctly for existing videos', async () => {
      const videoPath = path.join(tempDir, 'existing-video.mp4');
      fs.writeFileSync(videoPath, Buffer.alloc(1000));

      // First scan to add video to database
      const firstScanResult = await handlers['scan-videos'](null, tempDir);
      expect(firstScanResult).toHaveLength(1);
      const originalVideo = firstScanResult[0];

      // Second scan should find existing video and not create duplicate
      const secondScanResult = await handlers['scan-videos'](null, tempDir);
      
      expect(secondScanResult).toHaveLength(1);
      expect(secondScanResult[0].id).toBe(originalVideo.id); // Same ID
      expect(secondScanResult[0].filePath).toBe(videoPath);
      expect(secondScanResult[0].fileName).toBe('existing-video.mp4');
    });

    test('should handle database transaction integrity', async () => {
      // Create multiple videos to test that database operations work correctly
      fs.writeFileSync(path.join(tempDir, 'video1.mp4'), Buffer.alloc(100));
      fs.writeFileSync(path.join(tempDir, 'video2.mkv'), Buffer.alloc(200));

      const result = await handlers['scan-videos'](null, tempDir);

      expect(result).toHaveLength(2);
      
      // Verify each video has unique ID and correct properties
      const ids = result.map(v => v.id);
      expect(new Set(ids).size).toBe(2); // All IDs are unique
      
      result.forEach(video => {
        expect(video.id).toBeGreaterThan(0);
        expect(video.filePath).toContain(tempDir);
        expect(video.transcriptionStatus).toBe('pending');
      });
    });

    test('should persist videos in database across operations', async () => {
      fs.writeFileSync(path.join(tempDir, 'persistent.mp4'), Buffer.alloc(300));

      // Scan videos
      const scanResult = await handlers['scan-videos'](null, tempDir);
      expect(scanResult).toHaveLength(1);

      // Verify video persists via getAllVideos handler
      const allVideos = await handlers['get-videos']();
      expect(allVideos).toHaveLength(1);
      expect(allVideos[0].id).toBe(scanResult[0].id);
      expect(allVideos[0].fileName).toBe('persistent.mp4');
    });

    test('should handle concurrent file system operations', async () => {
      // Create many files to test concurrent operations
      const videoCount = 50;
      for (let i = 0; i < videoCount; i++) {
        fs.writeFileSync(
          path.join(tempDir, `video-${i.toString().padStart(3, '0')}.mp4`), 
          Buffer.alloc(100 + i)
        );
      }

      const startTime = Date.now();
      const result = await handlers['scan-videos'](null, tempDir);
      const endTime = Date.now();

      expect(result).toHaveLength(videoCount);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all files were processed correctly
      result.forEach((video, index) => {
        expect(video.fileName).toBe(`video-${index.toString().padStart(3, '0')}.mp4`);
        expect(video.fileSize).toBe(100 + index);
      });
    });
  });

  describe('Handler Integration Edge Cases', () => {
    test('should handle folder selection followed by immediate scanning', async () => {
      const { dialog } = require('electron');
      
      // Setup test folder with videos
      fs.writeFileSync(path.join(tempDir, 'video1.mp4'), Buffer.alloc(500));
      fs.writeFileSync(path.join(tempDir, 'video2.mkv'), Buffer.alloc(750));

      // Mock dialog to return our test directory
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [tempDir]
      });

      // Test the workflow
      const selectedFolder = await handlers['select-folder']();
      expect(selectedFolder).toBe(tempDir);

      const scannedVideos = await handlers['scan-videos'](null, selectedFolder);
      expect(scannedVideos).toHaveLength(2);
      expect(scannedVideos.map(v => v.fileName)).toEqual(
        expect.arrayContaining(['video1.mp4', 'video2.mkv'])
      );
    });

    test('should handle cancelled folder selection gracefully', async () => {
      const { dialog } = require('electron');
      
      dialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const selectedFolder = await handlers['select-folder']();
      expect(selectedFolder).toBeNull();

      // Scanning with null path should fail appropriately
      await expect(handlers['scan-videos'](null, selectedFolder))
        .rejects.toThrow();
    });
  });
}); 
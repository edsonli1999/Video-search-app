const fs = require('fs');
const path = require('path');
const os = require('os');
const { VideoScanner } = require('../video/video-scanner');

// Mock only the database dependency
const mockDatabase = {
  getVideoByPath: jest.fn(),
  insertVideo: jest.fn()
};

jest.mock('../database/database.js', () => ({
  getDatabase: () => mockDatabase
}));

describe('VideoScanner', () => {
  let scanner;
  let tempDir;

  beforeEach(() => {
    // Create real temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-scanner-test-'));
    scanner = new VideoScanner();
    
    // Reset database mocks
    jest.clearAllMocks();
    mockDatabase.getVideoByPath.mockReturnValue(null); // Default: no existing videos
    mockDatabase.insertVideo.mockReturnValue(1); // Default: return ID 1
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Directory Scanning', () => {
    test('should scan directory and find video files', async () => {
      // Create test files with different video formats
      const videoFiles = [
        'movie.mp4',
        'documentary.mkv', 
        'clip.avi',
        'presentation.mov',
        'stream.webm'
      ];

      // Create actual files in temp directory
      for (const fileName of videoFiles) {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(1024)); // 1KB files
      }

      // Also create non-video files that should be ignored
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'text file');
      fs.writeFileSync(path.join(tempDir, 'image.jpg'), Buffer.alloc(512));

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(5); // Only video files
      
      // Verify each video file was found
      const foundNames = results.map(v => v.fileName).sort();
      expect(foundNames).toEqual(videoFiles.sort());

      // Verify file properties are set correctly
      results.forEach(video => {
        expect(video.filePath).toContain(tempDir);
        expect(video.fileSize).toBe(1024);
        expect(video.transcriptionStatus).toBe('pending');
        expect(typeof video.fileName).toBe('string');
      });
    });

    test('should handle empty directories gracefully', async () => {
      const results = await scanner.scanFolder(tempDir);
      
      expect(results).toEqual([]);
      expect(mockDatabase.getVideoByPath).not.toHaveBeenCalled();
      expect(mockDatabase.insertVideo).not.toHaveBeenCalled();
    });

    test('should ignore directories with no video files', async () => {
      // Create non-video files
      fs.writeFileSync(path.join(tempDir, 'document.pdf'), 'content');
      fs.writeFileSync(path.join(tempDir, 'image.png'), Buffer.alloc(100));
      fs.mkdirSync(path.join(tempDir, 'empty-folder'));

      const results = await scanner.scanFolder(tempDir);
      
      expect(results).toEqual([]);
    });
  });

  describe('Recursive Directory Scanning', () => {
    test('should recursively scan subdirectories', async () => {
      // Create nested directory structure
      const level1Dir = path.join(tempDir, 'movies');
      const level2Dir = path.join(level1Dir, '2024');
      const level3Dir = path.join(level2Dir, 'action');
      
      fs.mkdirSync(level1Dir);
      fs.mkdirSync(level2Dir);
      fs.mkdirSync(level3Dir);

      // Place video files at different levels
      fs.writeFileSync(path.join(tempDir, 'root-movie.mp4'), Buffer.alloc(1000));
      fs.writeFileSync(path.join(level1Dir, 'level1-movie.mkv'), Buffer.alloc(2000));
      fs.writeFileSync(path.join(level2Dir, 'level2-movie.avi'), Buffer.alloc(3000));
      fs.writeFileSync(path.join(level3Dir, 'level3-movie.mov'), Buffer.alloc(4000));

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(4);
      
      // Verify files from all levels were found
      const expectedSizes = [1000, 2000, 3000, 4000];
      const actualSizes = results.map(v => v.fileSize).sort((a, b) => a - b);
      expect(actualSizes).toEqual(expectedSizes);
    });

    test('should handle very deep directory nesting', async () => {
      // Create deep nesting (10 levels)
      let currentDir = tempDir;
      for (let i = 0; i < 10; i++) {
        currentDir = path.join(currentDir, `level-${i}`);
        fs.mkdirSync(currentDir);
      }

      // Place a video file at the deepest level
      fs.writeFileSync(path.join(currentDir, 'deep-video.mp4'), Buffer.alloc(1234));

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0].fileName).toBe('deep-video.mp4');
      expect(results[0].fileSize).toBe(1234);
      expect(results[0].filePath).toContain('level-9'); // Should reach deepest level
    });
  });

  describe('Large Directory Handling', () => {
    test('should handle directories with many files (1000+ files)', async () => {
      const numFiles = 1500;
      const videoFormats = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
      
      // Create many files (mix of video and non-video)
      for (let i = 0; i < numFiles; i++) {
        const isVideo = i % 3 === 0; // Every 3rd file is a video
        const ext = isVideo ? videoFormats[i % videoFormats.length] : '.txt';
        const fileName = `file-${i.toString().padStart(4, '0')}${ext}`;
        
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      }

      const startTime = Date.now();
      const results = await scanner.scanFolder(tempDir);
      const endTime = Date.now();

      // Should find approximately 500 video files (every 3rd file)
      expect(results.length).toBeGreaterThan(450);
      expect(results.length).toBeLessThan(550);

      // Performance check: should complete within reasonable time (< 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify all results are valid video files
      results.forEach(video => {
        expect(video.fileName).toMatch(/\.(mp4|mkv|avi|mov|webm)$/);
        expect(video.fileSize).toBe(100);
      });
    }, 10000); // 10 second timeout for this test
  });

  describe('Cross-Platform Path Handling', () => {
    test('should handle different path separators correctly', async () => {
      // Create subdirectory with video file
      const subDir = path.join(tempDir, 'sub folder');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'test video.mp4'), Buffer.alloc(500));

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(1);
      
      // Verify path is properly constructed for current platform
      const expectedPath = path.join(tempDir, 'sub folder', 'test video.mp4');
      expect(results[0].filePath).toBe(expectedPath);
      
      // Verify path is absolute
      expect(path.isAbsolute(results[0].filePath)).toBe(true);
    });

    test('should handle special characters in file names', async () => {
      const specialNames = [
        'movie with spaces.mp4',
        'movie-with-dashes.mkv',
        'movie_with_underscores.avi',
        'movie(with)parentheses.mov',
        'movie[with]brackets.webm'
      ];

      // Create files with special characters
      for (const fileName of specialNames) {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      }

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(specialNames.length);
      
      const foundNames = results.map(v => v.fileName).sort();
      expect(foundNames).toEqual(specialNames.sort());
    });
  });

  describe('File Format Validation', () => {
    test('should recognize all supported video formats', async () => {
      const supportedFormats = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv', '.flv'];
      
      // Create one file for each supported format
      supportedFormats.forEach((ext, index) => {
        const fileName = `video${index}${ext}`;
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      });

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(supportedFormats.length);
      
      // Verify each format was detected
      const foundExtensions = results.map(v => path.extname(v.fileName)).sort();
      expect(foundExtensions).toEqual(supportedFormats.sort());
    });

    test('should ignore unsupported file formats', async () => {
      const unsupportedFiles = [
        'document.pdf',
        'image.jpg',
        'audio.mp3',
        'archive.zip',
        'video.mpg', // Not in supported list
        'video.xvid' // Not in supported list
      ];

      // Create unsupported files
      unsupportedFiles.forEach(fileName => {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      });

      const results = await scanner.scanFolder(tempDir);

      expect(results).toEqual([]);
    });

    test('should handle case-insensitive file extensions', async () => {
      // Create files with mixed case extensions
      const mixedCaseFiles = [
        'video.MP4',
        'video.MKV', 
        'video.AVI',
        'video.MOV'
      ];

      mixedCaseFiles.forEach(fileName => {
        fs.writeFileSync(path.join(tempDir, fileName), Buffer.alloc(100));
      });

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(mixedCaseFiles.length);
    });
  });

  describe('Error Handling', () => {
    test('should handle permission denied errors gracefully', async () => {
      const restrictedDir = path.join(tempDir, 'restricted');
      fs.mkdirSync(restrictedDir);
      
      // Create a video file in the restricted directory first
      fs.writeFileSync(path.join(restrictedDir, 'video.mp4'), Buffer.alloc(100));
      
      // On Windows, we can't really restrict permissions easily in tests
      // So we'll simulate by mocking fs.promises.readdir for this specific case
      const originalReaddir = fs.promises.readdir;
      fs.promises.readdir = jest.fn().mockImplementation(async (dirPath, options) => {
        if (dirPath === restrictedDir) {
          throw new Error('EACCES: permission denied');
        }
        return originalReaddir(dirPath, options);
      });

      // Should throw error when trying to scan
      await expect(scanner.scanFolder(tempDir)).rejects.toThrow('EACCES: permission denied');

      // Restore original function
      fs.promises.readdir = originalReaddir;
    });

    test('should handle non-existent directory', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      await expect(scanner.scanFolder(nonExistentPath)).rejects.toThrow();
    });

    test('should handle corrupted file stats gracefully', async () => {
      // Create a video file
      const videoPath = path.join(tempDir, 'video.mp4');
      fs.writeFileSync(videoPath, Buffer.alloc(100));

      // Mock fs.promises.stat to fail for this specific file
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockImplementation(async (filePath) => {
        if (filePath === videoPath) {
          throw new Error('ENOENT: file disappeared during scan');
        }
        return originalStat(filePath);
      });

      // Should continue scanning and not crash, but file won't be included
      const results = await scanner.scanFolder(tempDir);
      expect(results).toEqual([]);

      // Restore original function
      fs.promises.stat = originalStat;
    });

    test('should handle scanning a file instead of directory', async () => {
      // Create a regular file
      const filePath = path.join(tempDir, 'not-a-directory.txt');
      fs.writeFileSync(filePath, 'content');

      await expect(scanner.scanFolder(filePath)).rejects.toThrow();
    });
  });

  describe('Database Integration', () => {
    test('should check for existing videos in database', async () => {
      fs.writeFileSync(path.join(tempDir, 'movie.mp4'), Buffer.alloc(1000));

      // Mock database to return existing video
      const existingVideo = {
        id: 42,
        filePath: path.join(tempDir, 'movie.mp4'),
        fileName: 'movie.mp4',
        fileSize: 1000,
        transcriptionStatus: 'completed'
      };
      mockDatabase.getVideoByPath.mockReturnValue(existingVideo);

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(existingVideo); // Should return existing video data
      expect(mockDatabase.insertVideo).not.toHaveBeenCalled(); // Should not insert
    });

    test('should insert new videos into database', async () => {
      fs.writeFileSync(path.join(tempDir, 'new-movie.mp4'), Buffer.alloc(2000));

      mockDatabase.getVideoByPath.mockReturnValue(null); // No existing video
      mockDatabase.insertVideo.mockReturnValue(123); // Return new ID

      const results = await scanner.scanFolder(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(123); // Should have assigned ID
      expect(mockDatabase.insertVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: path.join(tempDir, 'new-movie.mp4'),
          fileName: 'new-movie.mp4',
          fileSize: 2000,
          transcriptionStatus: 'pending'
        })
      );
    });
  });

  describe('Utility Methods', () => {
    test('isVideoFile should correctly identify video files', () => {
      expect(scanner.isVideoFile('movie.mp4')).toBe(true);
      expect(scanner.isVideoFile('movie.MKV')).toBe(true); // Case insensitive
      expect(scanner.isVideoFile('document.pdf')).toBe(false);
      expect(scanner.isVideoFile('image.jpg')).toBe(false);
    });

    test('validateVideoFile should validate existing video files', async () => {
      const videoPath = path.join(tempDir, 'test.mp4');
      fs.writeFileSync(videoPath, Buffer.alloc(100));

      expect(await scanner.validateVideoFile(videoPath)).toBe(true);
    });

    test('validateVideoFile should reject non-existent files', async () => {
      const nonExistentPath = path.join(tempDir, 'missing.mp4');

      expect(await scanner.validateVideoFile(nonExistentPath)).toBe(false);
    });

    test('validateVideoFile should reject non-video files', async () => {
      const textPath = path.join(tempDir, 'document.txt');
      fs.writeFileSync(textPath, 'content');

      expect(await scanner.validateVideoFile(textPath)).toBe(false);
    });
  });
}); 
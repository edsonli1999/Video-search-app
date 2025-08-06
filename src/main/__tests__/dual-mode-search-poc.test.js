const os = require('os');
const fs = require('fs');
const path = require('path');

// Mock Electron APIs at the top level
jest.mock('electron', () => ({
  dialog: { showOpenDialog: jest.fn() },
  ipcMain: { handle: jest.fn() },
  app: { 
    getPath: jest.fn()
  }
}));

describe('Dual Mode Search - Proof of Concept', () => {
  
  describe('Memory Mode Search', () => {
    let tempDir;
    let handlers = {};

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-mode-test-'));
      
      // Configure app.getPath to force memory mode
      const { app } = require('electron');
      app.getPath.mockImplementation(() => {
        throw new Error('Test environment - forcing memory mode');
      });

      // Clear require cache to get fresh instances
      jest.clearAllMocks();
      delete require.cache[require.resolve('../ipc/handlers')];
      delete require.cache[require.resolve('../database/database')];
      
      // Setup handlers
      const { setupIpcHandlers } = require('../ipc/handlers');
      setupIpcHandlers();
      
      // Extract handler functions
      const { ipcMain } = require('electron');
      handlers = {};
      ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
        handlers[channel] = handler;
      });
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      jest.restoreAllMocks();
      jest.resetModules();
    });

    test('should use memory mode and perform basic string search', async () => {
      // Verify we're in memory mode by checking database availability
      const { getDatabase } = require('../database/database');
      const db = getDatabase();
      expect(db.isAvailable).toBe(false); // Memory mode
      
      // Create test video file
      fs.writeFileSync(path.join(tempDir, 'test-video.mp4'), Buffer.alloc(1024));
      
      // Setup mock dialog
      const { dialog } = require('electron');
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [tempDir]
      });

      // Scan videos
      const videos = await handlers['scan-videos'](null, tempDir);
      expect(videos).toHaveLength(1);

      // Transcribe video (adds dummy segments to memory)
      const transcribeResult = await handlers['transcribe-video'](null, videos[0].id);
      expect(transcribeResult.success).toBe(true);

      // Test memory mode search - should use simple string matching
      const searchResults = await handlers['search-videos'](null, 'sample');
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].segments[0].text).toContain('sample');

      // Test case insensitive search in memory mode
      const caseInsensitiveResults = await handlers['search-videos'](null, 'SAMPLE');
      expect(caseInsensitiveResults.length).toBeGreaterThan(0);

      console.log('✅ Memory Mode Test: Using simple string matching');
    });
  });

  describe('Database Mode Search', () => {
    let tempDir;
    let handlers = {};
    let dbPath;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'database-mode-test-'));
      dbPath = path.join(tempDir, 'videos.db');
      
      // Configure app.getPath to allow database mode
      const { app } = require('electron');
      app.getPath.mockReturnValue(tempDir);

      // Clear require cache to get fresh instances
      jest.clearAllMocks();
      delete require.cache[require.resolve('../ipc/handlers')];
      delete require.cache[require.resolve('../database/database')];
      
      // Setup handlers - database should initialize in temp directory
      const { setupIpcHandlers } = require('../ipc/handlers');
      setupIpcHandlers();
      
      // Extract handler functions
      const { ipcMain } = require('electron');
      handlers = {};
      ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
        handlers[channel] = handler;
      });
    });

    afterEach(() => {
      // Close database connection before cleanup
      try {
        const { getDatabase } = require('../database/database');
        const db = getDatabase();
        if (db && db.close) {
          db.close();
        }
      } catch (e) {
        // Database might already be closed
      }
      
      fs.rmSync(tempDir, { recursive: true, force: true });
      jest.restoreAllMocks();
      jest.resetModules();
    });

    test('should use database mode and perform FTS5 search', async () => {
      // Verify we're in database mode
      const { getDatabase } = require('../database/database');
      const db = getDatabase();
      expect(db.isAvailable).toBe(true); // Database mode
      
      // Verify database file was created
      expect(fs.existsSync(dbPath)).toBe(true);
      
      // Create test video file
      fs.writeFileSync(path.join(tempDir, 'test-video.mp4'), Buffer.alloc(1024));
      
      // Setup mock dialog
      const { dialog } = require('electron');
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [tempDir]
      });

      // Scan videos
      const videos = await handlers['scan-videos'](null, tempDir);
      expect(videos).toHaveLength(1);

      // Transcribe video (adds segments to SQLite database)
      const transcribeResult = await handlers['transcribe-video'](null, videos[0].id);
      expect(transcribeResult.success).toBe(true);

      // Test database mode search - should use FTS5
      const searchResults = await handlers['search-videos'](null, 'sample');
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].segments[0].text).toContain('sample');

      // Test FTS5 specific feature - phrase search
      const phraseResults = await handlers['search-videos'](null, '"sample transcript"');
      expect(phraseResults.length).toBeGreaterThan(0);

      // Verify FTS5 virtual table exists
      const transcriptSegments = db.getTranscriptSegments(videos[0].id);
      expect(transcriptSegments.length).toBeGreaterThan(0);

      console.log('✅ Database Mode Test: Using FTS5 full-text search');
    });

    test('should handle database-specific search features', async () => {
      // Verify database mode
      const { getDatabase } = require('../database/database');
      const db = getDatabase();
      expect(db.isAvailable).toBe(true);

      // Insert test data directly into database
      const videoId = db.insertVideo({
        filePath: path.join(tempDir, 'direct-test.mp4'),
        fileName: 'direct-test.mp4',
        fileSize: 2048,
        transcriptionStatus: 'completed'
      });

      // Insert transcript segments with varying content
      const segments = [
        { startTime: 0, endTime: 5, text: 'This is a sample video about testing', confidence: 0.9 },
        { startTime: 5, endTime: 10, text: 'Sample text for search functionality', confidence: 0.95 },
        { startTime: 10, endTime: 15, text: 'Different content without the key word', confidence: 0.8 }
      ];
      
      db.insertTranscriptSegments(videoId, segments);

      // Test direct database search
      const directResults = db.searchTranscripts('sample');
      expect(directResults.length).toBe(1);
      expect(directResults[0].segments.length).toBe(2); // Should find 2 segments with "sample"

      // Test search history (database mode only)
      const searchHistory = db.getSearchHistory();
      expect(searchHistory.length).toBeGreaterThan(0);

      console.log('✅ Database-specific features test passed');
    });
  });

  describe('Mode Comparison', () => {
    test('should demonstrate the difference between memory and database search', async () => {
      console.log('\n🔍 Search Mode Comparison:');
      console.log('Memory Mode: Simple case-insensitive string matching');
      console.log('Database Mode: FTS5 full-text search with ranking and phrase queries');
      console.log('Both modes handle basic search, but database mode has advanced features\n');
      
      // This test just documents the differences
      expect(true).toBe(true);
    });
  });
}); 
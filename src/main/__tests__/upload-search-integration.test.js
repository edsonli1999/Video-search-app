/**
 * REAL Integration Test - Tests actual app functionality
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

// Only mock Electron APIs we can't control
jest.mock('electron', () => ({
    dialog: { showOpenDialog: jest.fn() },
    app: { getPath: () => require('os').tmpdir() }, // ✅ Use require() directly in mock
    ipcMain: { handle: jest.fn() },
  }));

describe('Real Upload and Search Integration', () => {
  let tempDir;

  beforeEach(() => {
    // Setup real temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-test-'));
    
    // Create real test video files
    fs.writeFileSync(path.join(tempDir, 'movie.mp4'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(tempDir, 'documentary.mkv'), Buffer.alloc(2048));
    fs.mkdirSync(path.join(tempDir, 'subfolder'));
    fs.writeFileSync(path.join(tempDir, 'subfolder', 'clip.avi'), Buffer.alloc(512));
    fs.writeFileSync(path.join(tempDir, 'not-video.txt'), 'text file');

    // Let the real database system work - no mocking needed!
    // The database will automatically use temporary directories
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('complete upload and search workflow with real data', async () => {
    const { dialog } = require('electron');
    const { setupIpcHandlers } = require('../ipc/handlers');

    // Mock only the dialog to return our test directory
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [tempDir],
    });

    // Setup real IPC handlers
    setupIpcHandlers();

    // Extract the real handler functions
    const { ipcMain } = require('electron');
    const handlers = {};
    ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
      handlers[channel] = handler;
    });

    // Test 1: Real folder selection
    const selectedFolder = await handlers['select-folder']();
    expect(selectedFolder).toBe(tempDir);

    // Test 2: Real video scanning with real files
    const scannedVideos = await handlers['scan-videos'](null, selectedFolder);
    
    // Should find 3 real video files, ignore .txt
    expect(scannedVideos).toHaveLength(3);
    expect(scannedVideos.map(v => v.fileName)).toEqual(
      expect.arrayContaining(['movie.mp4', 'documentary.mkv', 'clip.avi'])
    );

    // Test 3: Verify real database storage
    const allVideos = await handlers['get-videos']();
    expect(allVideos).toHaveLength(3);

    // Test 4: Real transcription process
    const videoToTranscribe = scannedVideos[0];
    const transcriptionResult = await handlers['transcribe-video'](
      null, 
      videoToTranscribe.id
    );
    
    expect(transcriptionResult.success).toBe(true);

    // Test 5a: Search for words that EXIST in transcript (should find results)
    const successfulSearch = await handlers['search-videos'](null, 'sample');
    expect(successfulSearch.length).toBeGreaterThan(0);
    expect(successfulSearch[0].videoId).toBe(videoToTranscribe.id);
    expect(successfulSearch[0].segments[0].text).toContain('sample');

    // Test 5b: Search for words that DON'T exist (should find nothing)
    const noResultsSearch1 = await handlers['search-videos'](null, 'nonexistent');
    expect(noResultsSearch1).toHaveLength(0);

    const noResultsSearch2 = await handlers['search-videos'](null, 'cryptocurrency');
    expect(noResultsSearch2).toHaveLength(0);

    const noResultsSearch3 = await handlers['search-videos'](null, 'pizza delivery');
    expect(noResultsSearch3).toHaveLength(0);

    // Test 5c: Search for partial words that should work
    const partialSearch = await handlers['search-videos'](null, 'testing');
    expect(partialSearch.length).toBeGreaterThan(0);
    expect(partialSearch[0].segments[0].text).toContain('testing');

    // Test 5d: Case insensitive search (should work)
    const caseInsensitiveSearch = await handlers['search-videos'](null, 'SAMPLE');
    expect(caseInsensitiveSearch.length).toBeGreaterThan(0);

    // Test 5e: Empty/whitespace searches (should return nothing)
    const emptySearch = await handlers['search-videos'](null, '');
    expect(emptySearch).toHaveLength(0);

    const whitespaceSearch = await handlers['search-videos'](null, '   ');
    expect(whitespaceSearch).toHaveLength(0);

    // Test 5f: Special characters (should return nothing)
    const specialCharsSearch = await handlers['search-videos'](null, '@#$%^&*');
    expect(specialCharsSearch).toHaveLength(0);

    // Test 5g: Very long nonsense search (should return nothing)
    const longNonsenseSearch = await handlers['search-videos'](null, 'supercalifragilisticexpialidocious');
    expect(longNonsenseSearch).toHaveLength(0);
  });

  test('search functionality with no transcribed videos', async () => {
    const { dialog } = require('electron');
    const { setupIpcHandlers } = require('../ipc/handlers');

    // Mock dialog to return test directory
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [tempDir],
    });

    setupIpcHandlers();
    const { ipcMain } = require('electron');
    const handlers = {};
    ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
      handlers[channel] = handler;
    });

    // Scan videos but DON'T transcribe them
    await handlers['scan-videos'](null, tempDir);

    // Search should return empty results since no transcripts exist
    const searchResults = await handlers['search-videos'](null, 'anything');
    expect(searchResults).toHaveLength(0);
  });

  test('error handling with invalid folder paths', async () => {
    const { setupIpcHandlers } = require('../ipc/handlers');
    
    setupIpcHandlers();
    const { ipcMain } = require('electron');
    const handlers = {};
    ipcMain.handle.mock.calls.forEach(([channel, handler]) => {
      handlers[channel] = handler;
    });

    // Test scanning non-existent directory
    await expect(
      handlers['scan-videos'](null, '/path/that/does/not/exist')
    ).rejects.toThrow();

    // Test scanning a file instead of directory (should fail)
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'content');
    
    await expect(
      handlers['scan-videos'](null, testFile)
    ).rejects.toThrow();
  });
}); 
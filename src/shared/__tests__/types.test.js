const { IPC_CHANNELS, SUPPORTED_VIDEO_FORMATS } = require('../types');

describe('Shared Types', () => {
  describe('IPC_CHANNELS', () => {
    test('should contain all required IPC channel names', () => {
      expect(IPC_CHANNELS).toBeDefined();
      expect(IPC_CHANNELS.SELECT_FOLDER).toBe('select-folder');
      expect(IPC_CHANNELS.SCAN_VIDEOS).toBe('scan-videos');
      expect(IPC_CHANNELS.SEARCH_VIDEOS).toBe('search-videos');
      expect(IPC_CHANNELS.GET_VIDEOS).toBe('get-videos');
      expect(IPC_CHANNELS.TRANSCRIBE_VIDEO).toBe('transcribe-video');
      expect(IPC_CHANNELS.GET_TRANSCRIPT).toBe('get-transcript');
    });

    test('should have string values for all channels', () => {
      Object.values(IPC_CHANNELS).forEach(channel => {
        expect(typeof channel).toBe('string');
        expect(channel.length).toBeGreaterThan(0);
      });
    });
  });

  describe('SUPPORTED_VIDEO_FORMATS', () => {
    test('should contain common video formats', () => {
      expect(SUPPORTED_VIDEO_FORMATS).toBeDefined();
      expect(Array.isArray(SUPPORTED_VIDEO_FORMATS)).toBe(true);
      expect(SUPPORTED_VIDEO_FORMATS.length).toBeGreaterThan(0);
    });

    test('should include .mp4 format', () => {
      expect(SUPPORTED_VIDEO_FORMATS).toContain('.mp4');
    });

    test('should include .mkv format', () => {
      expect(SUPPORTED_VIDEO_FORMATS).toContain('.mkv');
    });

    test('all formats should start with a dot', () => {
      SUPPORTED_VIDEO_FORMATS.forEach(format => {
        expect(format).toMatch(/^\./);
      });
    });

    test('all formats should be lowercase', () => {
      SUPPORTED_VIDEO_FORMATS.forEach(format => {
        expect(format).toBe(format.toLowerCase());
      });
    });
  });

  // Simple dummy test to verify Jest is working
  describe('Basic Jest functionality', () => {
    test('should run basic assertions', () => {
      expect(1 + 1).toBe(2);
      expect('hello').toBe('hello');
      expect(true).toBeTruthy();
      expect(false).toBeFalsy();
    });

    test('should handle arrays', () => {
      const testArray = [1, 2, 3];
      expect(testArray).toHaveLength(3);
      expect(testArray).toContain(2);
    });

    test('should handle objects', () => {
      const testObject = { name: 'test', value: 42 };
      expect(testObject).toHaveProperty('name');
      expect(testObject.name).toBe('test');
      expect(testObject).toMatchObject({ name: 'test' });
    });
  });
}); 
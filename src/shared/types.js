/**
 * @typedef {Object} VideoFile
 * @property {number} [id] - Unique identifier for the video
 * @property {string} filePath - Full path to the video file
 * @property {string} fileName - Name of the video file
 * @property {number} fileSize - Size of the file in bytes
 * @property {number} [duration] - Duration of the video in seconds
 * @property {string} [createdAt] - ISO timestamp when record was created
 * @property {string} [updatedAt] - ISO timestamp when record was last updated
 * @property {'pending'|'processing'|'completed'|'failed'} transcriptionStatus - Current transcription status
 */

/**
 * @typedef {Object} TranscriptSegment
 * @property {number} [id] - Unique identifier for the segment
 * @property {number} videoId - ID of the associated video
 * @property {number} startTime - Start time of the segment in seconds
 * @property {number} endTime - End time of the segment in seconds
 * @property {string} text - Transcribed text content
 * @property {number} [confidence] - Confidence score for the transcription (0-1)
 */

/**
 * @typedef {Object} SearchResult
 * @property {number} videoId - ID of the video containing the search match
 * @property {string} videoPath - Full path to the video file
 * @property {string} videoName - Name of the video file
 * @property {TranscriptSegment[]} segments - Array of matching transcript segments
 * @property {number} [relevanceScore] - Relevance score for the search result
 */

/**
 * @typedef {Object} AppState
 * @property {VideoFile[]} videos - Array of all video files
 * @property {string|null} selectedFolder - Currently selected folder path
 * @property {boolean} isScanning - Whether the app is currently scanning for videos
 * @property {boolean} isTranscribing - Whether the app is currently transcribing videos
 * @property {string} searchQuery - Current search query string
 * @property {SearchResult[]} searchResults - Array of search results
 * @property {VideoFile|null} currentVideo - Currently selected video
 */

// IPC Channel names
const IPC_CHANNELS = {
  SELECT_FOLDER: 'select-folder',
  SCAN_VIDEOS: 'scan-videos',
  SEARCH_VIDEOS: 'search-videos',
  GET_VIDEOS: 'get-videos',
  TRANSCRIBE_VIDEO: 'transcribe-video',
  GET_TRANSCRIPT: 'get-transcript',
};

// Supported video formats
const SUPPORTED_VIDEO_FORMATS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.m4v',
  '.wmv',
  '.flv'
];

module.exports = {
  IPC_CHANNELS,
  SUPPORTED_VIDEO_FORMATS
}; 
export interface VideoFile {
  id?: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  createdAt?: string;
  updatedAt?: string;
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface TranscriptSegment {
  id?: number;
  videoId: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

export interface SearchResult {
  videoId: number;
  videoPath: string;
  videoName: string;
  segments: TranscriptSegment[];
  relevanceScore?: number;
}

export interface AppState {
  videos: VideoFile[];
  selectedFolder: string | null;
  isScanning: boolean;
  isTranscribing: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  currentVideo: VideoFile | null;
}

// IPC Channel names
export const IPC_CHANNELS = {
  SELECT_FOLDER: 'select-folder',
  SCAN_VIDEOS: 'scan-videos',
  SEARCH_VIDEOS: 'search-videos',
  GET_VIDEOS: 'get-videos',
  TRANSCRIBE_VIDEO: 'transcribe-video',
  GET_TRANSCRIPT: 'get-transcript',
} as const;

// Supported video formats
export const SUPPORTED_VIDEO_FORMATS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.m4v',
  '.wmv',
  '.flv'
] as const;

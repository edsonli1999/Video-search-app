import React, { useState, useEffect } from 'react';
import { VideoFile, SearchResult, TranscriptSegment } from '../shared/types';
import './App.css';

// Extended types for the electron API with new methods
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      scanVideos: (folderPath: string) => Promise<VideoFile[]>;
      getVideos: () => Promise<VideoFile[]>;
      transcribeVideo: (videoId: number) => Promise<{ success: boolean; message: string }>;
      cancelTranscription: (videoId: number) => Promise<{ success: boolean; message: string }>;
      searchVideos: (query: string) => Promise<SearchResult[]>;
      getTranscript: (videoId: number) => Promise<TranscriptSegment[]>;
      onTranscriptionCompleted: (callback: (data: { videoId: number; jobId: string }) => void) => void;
      onTranscriptionFailed: (callback: (data: { videoId: number; jobId: string; error: string }) => void) => void;
      onTranscriptionCancelled: (callback: (data: { videoId: number; jobId: string }) => void) => void;
      onTranscriptionProgress: (callback: (data: { videoId: number; stage: string; progress: number; message: string }) => void) => void;
    };
  }
}

const App: React.FC = () => {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => {
    // Load selected folder from localStorage on startup
    return localStorage.getItem('selectedVideoFolder');
  });
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

  // Progress tracking state
  const [transcriptionProgress, setTranscriptionProgress] = useState<{
    [videoId: number]: {
      stage: string;
      progress: number;
      message: string;
    }
  }>({});

  // Helper function to get stage display name
  const getStageDisplayName = (stage: string): string => {
    switch (stage) {
      case 'audio_extraction':
        return 'Extracting Audio';
      case 'transcription':
        return 'Transcribing';
      case 'database_storage':
        return 'Saving Results';
      default:
        return stage.charAt(0).toUpperCase() + stage.slice(1);
    }
  };

  console.log('🔍 App render - searchQuery:', searchQuery);
  console.log('🔍 App render - searchResults:', searchResults);
  console.log('🔍 App render - searchResults.length:', searchResults.length);
  console.log('🔍 App render - isSearching:', isSearching);

  // Manual search function - triggered by button click or Enter key
  const performSearch = async () => {
    if (!searchQuery.trim()) {
      console.log('🔍 Empty query, clearing results');
      setSearchResults([]);
      return;
    }

    console.log('🔍 Starting manual search for:', searchQuery);
    setIsSearching(true);
    try {
      console.log('🔍 Calling window.electronAPI.searchVideos with:', searchQuery);
      const results = await window.electronAPI.searchVideos(searchQuery);
      console.log('🔍 Search results received:', results);
      console.log('🔍 Number of results:', results.length);
      
      if (results.length > 0) {
        console.log('🔍 First result details:', results[0]);
      }
      
      setSearchResults(results);
      console.log('🔍 Search results state updated');
    } catch (error) {
      console.error('🔍 Error searching:', error);
    } finally {
      console.log('🔍 Setting isSearching to false');
      setIsSearching(false);
    }
  };

  // Handle Enter key press in search input
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      console.log('🔍 Enter key pressed, triggering search');
      performSearch();
    }
  };

  // Load existing videos on app start and set up event listeners
  useEffect(() => {
    loadVideos();
    
    // Listen for transcription completion events
    window.electronAPI.onTranscriptionCompleted((data) => {
      console.log(`🎉 Frontend: Transcription completed for video ${data.videoId}`);
      // Clear progress on completion
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideos(); // Reload videos to update status
    });
    
    window.electronAPI.onTranscriptionFailed((data) => {
      console.log(`❌ Frontend: Transcription failed for video ${data.videoId}:`, data.error);
      // Clear progress on failure
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideos(); // Reload videos to update status
    });

    window.electronAPI.onTranscriptionCancelled((data) => {
      console.log(`🛑 Frontend: Transcription cancelled for video ${data.videoId}`);
      // Clear progress on cancellation
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideos(); // Reload videos to update status
    });

    window.electronAPI.onTranscriptionProgress((data) => {
      console.log(`📊 Frontend: Progress update for video ${data.videoId}: ${data.stage} - ${data.progress}%`);
      setTranscriptionProgress(prev => ({
        ...prev,
        [data.videoId]: {
          stage: data.stage,
          progress: data.progress,
          message: data.message
        }
      }));
    });
  }, []);

  const loadVideos = async () => {
    console.log('🔍 loadVideos called');
    try {
      const allVideos = await window.electronAPI.getVideos();
      console.log('🔍 Videos loaded:', allVideos);
      console.log('🔍 Number of videos:', allVideos.length);
      
      // Log transcription status of each video
      allVideos.forEach((video, index) => {
        console.log(`🔍 Video ${index + 1}: ${video.fileName} - Status: ${video.transcriptionStatus}`);
      });
      
      setVideos(allVideos);
    } catch (error) {
      console.error('🔍 Error loading videos:', error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setSelectedFolder(folderPath);
        // Save to localStorage for persistence
        localStorage.setItem('selectedVideoFolder', folderPath);
        
        setIsScanning(true);
        
        const scannedVideos = await window.electronAPI.scanVideos(folderPath);
        setVideos(scannedVideos);
        setIsScanning(false);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setIsScanning(false);
    }
  };

  const handleSearch = async (query: string) => {
    console.log('🔍 handleSearch called with query:', query);
    
    if (!query.trim()) {
      console.log('🔍 Empty query, clearing results');
      setSearchResults([]);
      return;
    }

    console.log('🔍 Starting search, setting isSearching to true');
    setIsSearching(true);
    try {
      console.log('🔍 Calling window.electronAPI.searchVideos with:', query);
      const results = await window.electronAPI.searchVideos(query);
      console.log('🔍 Search results received:', results);
      console.log('🔍 Number of results:', results.length);
      
      if (results.length > 0) {
        console.log('🔍 First result details:', results[0]);
      }
      
      setSearchResults(results);
      console.log('🔍 Search results state updated');
    } catch (error) {
      console.error('🔍 Error searching:', error);
    } finally {
      console.log('🔍 Setting isSearching to false');
      setIsSearching(false);
    }
  };

  const handleTranscribeVideo = async (video: VideoFile, isRetranscribe: boolean = false) => {
    if (!video.id) return;

    try {
      console.log(`${isRetranscribe ? '🔄 Re-transcribing' : '🎬 Transcribing'} video ${video.id}: ${video.fileName}`);
      
      // Update video status locally
      setVideos(prev => prev.map(v => 
        v.id === video.id ? { ...v, transcriptionStatus: 'processing' } : v
      ));

      const result = await window.electronAPI.transcribeVideo(video.id);
      
      if (result.success) {
        console.log(`📋 Frontend: ${isRetranscribe ? 'Re-transcription' : 'Transcription'} job queued for video ${video.id}`);
        // Don't reload immediately - wait for completion event
      }
    } catch (error) {
      console.error('Error transcribing video:', error);
      // Revert status on error
      setVideos(prev => prev.map(v =>
        v.id === video.id ? { ...v, transcriptionStatus: 'failed' } : v
      ));
    }
  };

  const handleCancelTranscription = async (video: VideoFile) => {
    if (!video.id) return;

    try {
      console.log(`🛑 Cancelling transcription for video ${video.id}: ${video.fileName}`);

      const result = await window.electronAPI.cancelTranscription(video.id);

      if (result.success) {
        console.log(`🛑 Frontend: Cancellation request sent for video ${video.id}`);
        // Clear progress immediately for better UX
        setTranscriptionProgress(prev => {
          const updated = { ...prev };
          if (video.id) {
            delete updated[video.id];
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Error cancelling transcription:', error);
    }
  };

  const handleViewTranscript = async (video: VideoFile) => {
    if (!video.id) return;

    try {
      setIsLoadingTranscript(true);
      setCurrentVideo(video);
      
      console.log(`📝 Loading transcript for video ${video.id}`);
      const segments = await window.electronAPI.getTranscript(video.id);
      console.log(`📝 Loaded ${segments.length} transcript segments`);
      
      setTranscriptSegments(segments);
    } catch (error) {
      console.error('Error loading transcript:', error);
      setTranscriptSegments([]);
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  const handleCloseTranscript = () => {
    setCurrentVideo(null);
    setTranscriptSegments([]);
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Video Search App</h1>
        <div className="header-actions">
          <button onClick={handleSelectFolder} disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Select Video Folder'}
          </button>
        </div>
      </header>

      <main className="app-main">
        {selectedFolder && (
          <div className="folder-info">
            <p><strong>Selected Folder:</strong> {selectedFolder}</p>
            <p><strong>Videos Found:</strong> {videos.length}</p>
          </div>
        )}

        <div className="search-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search video transcripts... (Press Enter or click Search)"
              value={searchQuery}
              onChange={(e) => {
                console.log('🔍 Input onChange - new value:', e.target.value);
                setSearchQuery(e.target.value);
              }}
              onKeyPress={handleSearchKeyPress}
              disabled={isSearching}
            />
            <button 
              onClick={performSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="search-btn"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            {searchQuery && (
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                disabled={isSearching}
                className="clear-btn"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              <h3>Search Results ({searchResults.length})</h3>
              {searchResults.map((result) => {
                console.log('🔍 Rendering search result:', result);
                return (
                <div key={result.videoId} className="search-result">
                  <h4>{result.videoName}</h4>
                  <div className="result-segments">
                      {result.segments.map((segment) => {
                        console.log('🔍 Rendering segment:', segment);
                        return (
                      <div key={segment.id} className="segment">
                        <span className="timestamp">
                          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                        </span>
                        <p className="segment-text">{segment.text}</p>
                      </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="videos-section">
          <h2>Video Library ({videos.length})</h2>
          <div className="videos-grid">
            {videos.map((video) => (
              <div key={video.id || video.filePath} className="video-card">
                <div className="video-info">
                  <h3 className="video-title">{video.fileName}</h3>
                  <p className="video-size">{formatFileSize(video.fileSize)}</p>
                  <p className="video-path">{video.filePath}</p>
                </div>
                
                <div className="video-actions">
                  {video.transcriptionStatus === 'processing' && video.id && transcriptionProgress[video.id] ? (
                    <div className="progress-section">
                      <div className="progress-info">
                        <div className="progress-stage">{getStageDisplayName(transcriptionProgress[video.id].stage)}</div>
                        <div className="progress-message">{transcriptionProgress[video.id].message}</div>
                      </div>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{ width: `${transcriptionProgress[video.id].progress}%` }}
                        />
                        <span className="progress-text">{Math.round(transcriptionProgress[video.id].progress)}%</span>
                      </div>
                      <button
                        onClick={() => handleCancelTranscription(video)}
                        className="cancel-btn"
                        title="Cancel transcription"
                      >
                        🛑 Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={`status status-${video.transcriptionStatus}`}>
                        {video.transcriptionStatus}
                      </div>

                      {video.transcriptionStatus === 'pending' && (
                        <button
                          onClick={() => handleTranscribeVideo(video)}
                          className="transcribe-btn"
                        >
                          Transcribe
                        </button>
                      )}

                      {video.transcriptionStatus === 'processing' && (
                        <button
                          onClick={() => handleCancelTranscription(video)}
                          className="cancel-btn"
                          title="Cancel transcription"
                        >
                          🛑 Cancel
                        </button>
                      )}
                    </>
                  )}

                  {video.transcriptionStatus === 'completed' && (
                    <div className="completed-actions">
                      <button 
                        onClick={() => handleViewTranscript(video)}
                        className="view-btn"
                      >
                        View Transcript
                      </button>
                      <button 
                        onClick={() => handleTranscribeVideo(video, true)}
                        className="retranscribe-btn"
                        title="Re-transcribe this video (useful for testing/debugging)"
                      >
                        🔄 Re-transcribe
                      </button>
                    </div>
                  )}
                  
                  {video.transcriptionStatus === 'failed' && (
                    <button 
                      onClick={() => handleTranscribeVideo(video, true)}
                      className="retry-btn"
                      title="Retry transcription"
                    >
                      🔄 Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript Modal */}
        {currentVideo && (
          <div className="transcript-modal-overlay" onClick={handleCloseTranscript}>
            <div className="transcript-modal" onClick={(e) => e.stopPropagation()}>
              <div className="transcript-header">
                <h2>Transcript: {currentVideo.fileName}</h2>
                <button 
                  onClick={handleCloseTranscript}
                  className="close-btn"
                  aria-label="Close transcript"
                >
                  ✕
                </button>
              </div>
              
              <div className="transcript-content">
                {isLoadingTranscript ? (
                  <div className="loading">Loading transcript...</div>
                ) : transcriptSegments.length > 0 ? (
                  <div className="transcript-segments">
                    {transcriptSegments.map((segment, index) => (
                      <div key={segment.id || index} className="segment">
                        <span className="timestamp">
                          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                        </span>
                        <p className="segment-text">{segment.text}</p>
                        {segment.confidence && (
                          <span className="confidence">
                            Confidence: {Math.round(segment.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-transcript">
                    No transcript segments found. 
                    {currentVideo.transcriptionStatus === 'completed' 
                      ? ' The video may have been silent or contain no speech.'
                      : ' Please transcribe this video first.'
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

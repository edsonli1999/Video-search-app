import React, { useState, useEffect, useMemo } from 'react';
import { VideoFile, SearchResult, TranscriptSegment } from '../shared/types';
import './App.css';

// Extended types for the electron API with new methods
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      scanVideos: (folderPath: string) => Promise<VideoFile[]>;
      getVideos: () => Promise<VideoFile[]>;
      getVideosByStatus: (status: VideoFile['transcriptionStatus']) => Promise<VideoFile[]>;
      getVideosByFolder: (folderPath: string) => Promise<VideoFile[]>;
      getVideosByStatusAndFolder: (status: VideoFile['transcriptionStatus'], folderPath: string) => Promise<VideoFile[]>;
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

type TabType = 'new-session' | 'completed' | 'failed';

interface FolderStatistics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('new-session');
  const [newSessionVideos, setNewSessionVideos] = useState<VideoFile[]>([]);
  const [completedVideos, setCompletedVideos] = useState<VideoFile[]>([]);
  const [failedVideos, setFailedVideos] = useState<VideoFile[]>([]);
  
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => {
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

  // Memoized folder statistics - only recalculates when newSessionVideos changes
  const folderStatistics = useMemo<FolderStatistics>(() => {
    const stats = {
      total: newSessionVideos.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    // Single pass through the array to count all statuses
    newSessionVideos.forEach(video => {
      switch (video.transcriptionStatus) {
        case 'pending':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
      }
    });

    return stats;
  }, [newSessionVideos]);

  // Memoized folder name extraction
  const folderName = useMemo(() => {
    if (!selectedFolder) return null;
    return selectedFolder.split(/[/\\]/).pop() || selectedFolder;
  }, [selectedFolder]);

  // Load videos by status - updated to show ALL videos in folder for new session
  const loadVideosByStatus = async () => {
    try {
      // Always load completed and failed videos globally
      const [completed, failed] = await Promise.all([
        window.electronAPI.getVideosByStatus('completed'),
        window.electronAPI.getVideosByStatus('failed')
      ]);
      
      // For new session, show ALL videos from the selected folder
      let newSession: VideoFile[] = [];
      if (selectedFolder) {
        // Get ALL videos from the selected folder, regardless of status
        newSession = await window.electronAPI.getVideosByFolder(selectedFolder);
        console.log(`📂 Loaded ALL videos from folder: ${selectedFolder} (${newSession.length} total)`);
      }
      
      setCompletedVideos(completed);
      setFailedVideos(failed);
      setNewSessionVideos(newSession);
      
      console.log(`📊 Loaded videos - Folder: ${newSession.length}, Completed (global): ${completed.length}, Failed (global): ${failed.length}`);
    } catch (error) {
      console.error('Error loading videos by status:', error);
    }
  };

  // Manual search function
  const performSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await window.electronAPI.searchVideos(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Enter key press in search input
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  // Load existing videos on app start and set up event listeners
  useEffect(() => {
    loadVideosByStatus();
    
    // Listen for transcription events
    window.electronAPI.onTranscriptionCompleted((data) => {
      console.log(`🎉 Frontend: Transcription completed for video ${data.videoId}`);
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideosByStatus(); // Reload videos to update status
    });
    
    window.electronAPI.onTranscriptionFailed((data) => {
      console.log(`❌ Frontend: Transcription failed for video ${data.videoId}:`, data.error);
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideosByStatus();
    });

    window.electronAPI.onTranscriptionCancelled((data) => {
      console.log(`🛑 Frontend: Transcription cancelled for video ${data.videoId}`);
      setTranscriptionProgress(prev => {
        const updated = { ...prev };
        delete updated[data.videoId];
        return updated;
      });
      loadVideosByStatus();
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

  // Reload videos when selected folder changes
  useEffect(() => {
    loadVideosByStatus();
  }, [selectedFolder]);

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setSelectedFolder(folderPath);
        localStorage.setItem('selectedVideoFolder', folderPath);
        
        setIsScanning(true);
        await window.electronAPI.scanVideos(folderPath);
        setIsScanning(false);
        
        // Reload videos after scanning - will now show ALL videos in the folder
        await loadVideosByStatus();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setIsScanning(false);
    }
  };

  const handleClearFolder = () => {
    setSelectedFolder(null);
    localStorage.removeItem('selectedVideoFolder');
    // This will trigger the useEffect to reload videos
  };

  const handleTranscribeVideo = async (video: VideoFile, isRetranscribe: boolean = false) => {
    if (!video.id) return;

    try {
      console.log(`${isRetranscribe ? '🔄 Re-transcribing' : '🎬 Transcribing'} video ${video.id}: ${video.fileName}`);
      
      const result = await window.electronAPI.transcribeVideo(video.id);
      
      if (result.success) {
        console.log(`📋 Frontend: ${isRetranscribe ? 'Re-transcription' : 'Transcription'} job queued for video ${video.id}`);
        // Update local state to reflect processing status
        loadVideosByStatus();
      }
    } catch (error) {
      console.error('Error transcribing video:', error);
    }
  };

  const handleCancelTranscription = async (video: VideoFile) => {
    if (!video.id) return;

    try {
      console.log(`🛑 Cancelling transcription for video ${video.id}: ${video.fileName}`);
      const result = await window.electronAPI.cancelTranscription(video.id);

      if (result.success) {
        console.log(`🛑 Frontend: Cancellation request sent for video ${video.id}`);
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
      
      const segments = await window.electronAPI.getTranscript(video.id);
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

  // Memoized status breakdown string
  const statusBreakdown = useMemo(() => {
    if (folderStatistics.total === 0) return 'No videos';
    
    const parts = [];
    if (folderStatistics.pending > 0) parts.push(`${folderStatistics.pending} pending`);
    if (folderStatistics.processing > 0) parts.push(`${folderStatistics.processing} processing`);
    if (folderStatistics.completed > 0) parts.push(`${folderStatistics.completed} completed`);
    if (folderStatistics.failed > 0) parts.push(`${folderStatistics.failed} failed`);
    
    return parts.join(', ');
  }, [folderStatistics]);

  // Render video card component
  const renderVideoCard = (video: VideoFile) => (
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
                  title="Re-transcribe this video"
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
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Video Search App</h1>
        <div className="header-actions">
          {selectedFolder && (
            <span className="selected-folder-text">{selectedFolder}</span>
          )}
        </div>
      </header>

      <main className="app-main">
        {/* Tab Navigation */}
        <div className="tabs-container">
          <div className="tabs-header">
            <button
              className={`tab-button ${activeTab === 'new-session' ? 'active' : ''}`}
              onClick={() => setActiveTab('new-session')}
            >
              New Session {selectedFolder && folderStatistics.total > 0 ? `(${folderStatistics.total})` : ''}
            </button>
            <button
              className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed ({completedVideos.length})
            </button>
            <button
              className={`tab-button ${activeTab === 'failed' ? 'active' : ''}`}
              onClick={() => setActiveTab('failed')}
            >
              Failed ({failedVideos.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'new-session' && (
              <div className="new-session-tab">
                <div className="folder-selection-area">
                  <h2>Start a New Transcription Session</h2>
                  <div className="folder-controls">
                    <button 
                      onClick={handleSelectFolder} 
                      disabled={isScanning}
                      className="select-folder-btn"
                    >
                      {isScanning ? 'Scanning...' : selectedFolder ? 'Change Folder' : 'Select Video Folder'}
                    </button>
                    {selectedFolder && (
                      <button
                        onClick={handleClearFolder}
                        className="clear-folder-btn"
                        title="Clear folder selection"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                  
                  {selectedFolder && folderStatistics.total > 0 && (
                    <div className="folder-info">
                      <p><strong>Current Folder:</strong> {selectedFolder}</p>
                      <p><strong>Total Videos:</strong> {folderStatistics.total}</p>
                      <p><strong>Status Breakdown:</strong> {statusBreakdown}</p>
                    </div>
                  )}

                  {!selectedFolder && (
                    <p className="no-folder-message">
                      Select a folder to see all videos and manage transcriptions
                    </p>
                  )}
                </div>

                {selectedFolder && folderStatistics.total > 0 && (
                  <div className="videos-section">
                    <h3>All Videos in {folderName}</h3>
                    <div className="videos-grid">
                      {newSessionVideos.map(renderVideoCard)}
                    </div>
                  </div>
                )}

                {selectedFolder && folderStatistics.total === 0 && (
                  <div className="empty-state">
                    <p>No videos found in this folder. Try selecting a different folder with video files.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'completed' && (
              <div className="completed-tab">
                <div className="search-section">
                  <div className="search-bar">
                    <input
                      type="text"
                      placeholder="Search completed transcripts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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
                      {searchResults.map((result) => (
                        <div key={result.videoId} className="search-result">
                          <h4>{result.videoName}</h4>
                          <div className="result-segments">
                            {result.segments.map((segment) => (
                              <div key={segment.id} className="segment">
                                <span className="timestamp">
                                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                                </span>
                                <p className="segment-text">{segment.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {completedVideos.length > 0 ? (
                  <div className="videos-section">
                    <h3>Completed Transcriptions</h3>
                    <div className="videos-grid">
                      {completedVideos.map(renderVideoCard)}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No completed transcriptions yet. Start by transcribing videos in the New Session tab.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'failed' && (
              <div className="failed-tab">
                {failedVideos.length > 0 ? (
                  <div className="videos-section">
                    <h3>Failed Transcriptions</h3>
                    <div className="videos-grid">
                      {failedVideos.map(renderVideoCard)}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No failed transcriptions. Great job!</p>
                  </div>
                )}
              </div>
            )}
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
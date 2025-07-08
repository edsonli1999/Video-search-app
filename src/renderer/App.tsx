import React, { useState, useEffect } from 'react';
import { VideoFile, SearchResult } from '../shared/types';
import './App.css';

const App: React.FC = () => {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);

  // Load existing videos on app start
  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const allVideos = await window.electronAPI.getVideos();
      setVideos(allVideos);
    } catch (error) {
      console.error('Error loading videos:', error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setSelectedFolder(folderPath);
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
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await window.electronAPI.searchVideos(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTranscribeVideo = async (video: VideoFile) => {
    if (!video.id) return;

    try {
      // Update video status locally
      setVideos(prev => prev.map(v => 
        v.id === video.id ? { ...v, transcriptionStatus: 'processing' } : v
      ));

      const result = await window.electronAPI.transcribeVideo(video.id);
      
      if (result.success) {
        // Reload videos to get updated status
        await loadVideos();
      }
    } catch (error) {
      console.error('Error transcribing video:', error);
      // Revert status on error
      setVideos(prev => prev.map(v => 
        v.id === video.id ? { ...v, transcriptionStatus: 'failed' } : v
      ));
    }
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
              placeholder="Search video transcripts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              disabled={isSearching}
            />
            {isSearching && <span className="search-loading">Searching...</span>}
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
                  
                  {video.transcriptionStatus === 'completed' && (
                    <button 
                      onClick={() => setCurrentVideo(video)}
                      className="view-btn"
                    >
                      View Transcript
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

const React = require('react');
const { useState, useEffect } = React;

// Import CSS
require('./App.css');

const App = () => {
  const [videos, setVideos] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(null);

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

  const handleSearch = async (query) => {
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

  const handleTranscribeVideo = async (video) => {
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

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return React.createElement('div', { className: 'app' },
    React.createElement('header', { className: 'app-header' },
      React.createElement('h1', null, 'Video Search App'),
      React.createElement('div', { className: 'header-actions' },
        React.createElement('button', {
          onClick: handleSelectFolder,
          disabled: isScanning
        }, isScanning ? 'Scanning...' : 'Select Video Folder')
      )
    ),

    React.createElement('main', { className: 'app-main' },
      selectedFolder && React.createElement('div', { className: 'folder-info' },
        React.createElement('p', null,
          React.createElement('strong', null, 'Selected Folder: '), selectedFolder
        ),
        React.createElement('p', null,
          React.createElement('strong', null, 'Videos Found: '), videos.length
        )
      ),

      React.createElement('div', { className: 'search-section' },
        React.createElement('div', { className: 'search-bar' },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Search video transcripts...',
            value: searchQuery,
            onChange: (e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            },
            disabled: isSearching
          }),
          isSearching && React.createElement('span', { className: 'search-loading' }, 'Searching...')
        ),

        searchResults.length > 0 && React.createElement('div', { className: 'search-results' },
          React.createElement('h3', null, `Search Results (${searchResults.length})`),
          ...searchResults.map((result) =>
            React.createElement('div', { key: result.videoId, className: 'search-result' },
              React.createElement('h4', null, result.videoName),
              React.createElement('div', { className: 'result-segments' },
                ...result.segments.map((segment) =>
                  React.createElement('div', { key: segment.id, className: 'segment' },
                    React.createElement('span', { className: 'timestamp' },
                      `${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}`
                    ),
                    React.createElement('p', { className: 'segment-text' }, segment.text)
                  )
                )
              )
            )
          )
        )
      ),

      React.createElement('div', { className: 'videos-section' },
        React.createElement('h2', null, `Video Library (${videos.length})`),
        React.createElement('div', { className: 'videos-grid' },
          ...videos.map((video) =>
            React.createElement('div', { key: video.id || video.filePath, className: 'video-card' },
              React.createElement('div', { className: 'video-info' },
                React.createElement('h3', { className: 'video-title' }, video.fileName),
                React.createElement('p', { className: 'video-size' }, formatFileSize(video.fileSize)),
                React.createElement('p', { className: 'video-path' }, video.filePath)
              ),
              
              React.createElement('div', { className: 'video-actions' },
                React.createElement('div', { className: `status status-${video.transcriptionStatus}` },
                  video.transcriptionStatus
                ),
                
                video.transcriptionStatus === 'pending' && React.createElement('button', {
                  onClick: () => handleTranscribeVideo(video),
                  className: 'transcribe-btn'
                }, 'Transcribe'),
                
                video.transcriptionStatus === 'completed' && React.createElement('button', {
                  onClick: () => setCurrentVideo(video),
                  className: 'view-btn'
                }, 'View Transcript')
              )
            )
          )
        )
      )
    )
  );
};

module.exports = App;

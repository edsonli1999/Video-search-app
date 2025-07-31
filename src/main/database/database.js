const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class VideoDatabase {
  constructor() {
    this.db = null;
    this.isAvailable = false;
    this.memoryVideos = [];
    this.memoryTranscripts = new Map();

    console.log('🔧 DB: Starting database initialization...');

    try {
      // Step 1: Check Node.js version and environment
      console.log('🔧 DB: Node.js version:', process.version);
      console.log('🔧 DB: NODE_MODULE_VERSION:', process.versions.modules);
      console.log('🔧 DB: Electron version:', process.versions.electron);
      console.log('🔧 DB: V8 version:', process.versions.v8);

      // Step 2: Try to import better-sqlite3 with detailed error handling
      console.log('🔧 DB: Attempting to import better-sqlite3...');
      let Database;
      try {
        Database = require('better-sqlite3');
        console.log('🔧 DB: better-sqlite3 import successful');
      } catch (importError) {
        console.error('❌ Failed to import better-sqlite3:', importError);
        throw importError;
      }

      // Step 3: Check paths and permissions
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'videos.db');
      console.log('🔧 DB: User data path:', userDataPath);
      console.log('🔧 DB: Database path:', dbPath);

      // Step 4: Check if we can write to the directory
      console.log('🔧 DB: Checking directory permissions...');
      try {
        fs.accessSync(userDataPath, fs.constants.W_OK);
        console.log('🔧 DB: Write access to user data directory: ✅');
      } catch (accessError) {
        console.error('❌ No write access to user data directory:', accessError);
        throw accessError;
      }

      // Step 5: Create directory if it doesn't exist
      console.log('🔧 DB: Creating directory...');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      console.log('🔧 DB: Directory created successfully');

      // Step 6: Check if database file already exists and its permissions
      if (fs.existsSync(dbPath)) {
        console.log('🔧 DB: Database file already exists');
        try {
          fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
          console.log('🔧 DB: Database file permissions: ✅');
        } catch (permError) {
          console.error('❌ Database file permission error:', permError);
          throw permError;
        }
      } else {
        console.log('🔧 DB: Database file will be created');
      }

      // Step 7: Initialize database with detailed error handling
      console.log('🔧 DB: Initializing database...');
      try {
        this.db = new Database(dbPath);
        console.log('🔧 DB: Database object created');
      } catch (dbInitError) {
        console.error('❌ Database initialization failed:', dbInitError);
        throw dbInitError;
      }

      // Step 8: Set pragmas
      console.log('🔧 DB: Setting pragmas...');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      console.log('🔧 DB: Pragmas set');

      // Step 9: Initialize schema
      console.log('🔧 DB: Initializing schema...');
      this.initializeDatabase();
      console.log('🔧 DB: Schema initialized');

      this.isAvailable = true;
      console.log('✅ Database initialized successfully');

    } catch (error) {
      console.error('❌ Database initialization failed:');
      
      if (error instanceof Error) {
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        console.error('Stack trace:', error.stack);
        
        // Additional diagnostic info
        if (error.message.includes('NODE_MODULE_VERSION')) {
          console.error('🔧 This is a Node.js version mismatch issue');
          console.error('🔧 Your system Node.js:', process.version);
          console.error('🔧 Electron uses a different Node.js version');
          console.error('🔧 Consider rebuilding better-sqlite3 for the correct Node.js version');
        } else if (error.message.includes('better-sqlite3')) {
          console.error('🔧 This may be a native module compilation issue');
          console.error('🔧 Try running: npm rebuild better-sqlite3');
        }
      } else {
        console.error('Unknown error type:', error);
      }

      this.isAvailable = false;
      this.initializeMemoryStorage();
    }
  }

  initializeMemoryStorage() {
    this.memoryVideos = [];
    this.memoryTranscripts = new Map();
  }

  initializeDatabase() {
    // Use the correct path to schema.sql - it should be in the same directory as this file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  // Video operations
  insertVideo(video) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        INSERT INTO videos (file_path, file_name, file_size, duration, transcription_status)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        video.filePath,
        video.fileName,
        video.fileSize,
        video.duration || null,
        video.transcriptionStatus
      );

      return result.lastInsertRowid;
    } else {
      // Memory-based implementation
      const id = this.memoryVideos.length + 1;
      const newVideo = {
        ...video,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.memoryVideos.push(newVideo);
      return id;
    }
  }

  getVideoByPath(filePath) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM videos WHERE file_path = ?
      `);

      const row = stmt.get(filePath);
      return row ? this.mapRowToVideo(row) : null;
    } else {
      // Memory-based implementation
      return this.memoryVideos.find(v => v.filePath === filePath) || null;
    }
  }

  getAllVideos() {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM videos ORDER BY created_at DESC
      `);

      const rows = stmt.all();
      return rows.map(row => this.mapRowToVideo(row));
    } else {
      // Memory-based implementation
      return [...this.memoryVideos].reverse();
    }
  }

  updateVideoTranscriptionStatus(videoId, status) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        UPDATE videos SET transcription_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(status, videoId);
    } else {
      // Memory-based implementation
      const video = this.memoryVideos.find(v => v.id === videoId);
      if (video) {
        video.transcriptionStatus = status;
        video.updatedAt = new Date().toISOString();
      }
    }
  }

  deleteVideo(videoId) {
    if (this.isAvailable) {
      const stmt = this.db.prepare('DELETE FROM videos WHERE id = ?');
      stmt.run(videoId);
    } else {
      // Memory-based implementation
      const index = this.memoryVideos.findIndex(v => v.id === videoId);
      if (index !== -1) {
        this.memoryVideos.splice(index, 1);
        this.memoryTranscripts.delete(videoId);
      }
    }
  }

  // Transcript operations
  insertTranscriptSegments(videoId, segments) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        INSERT INTO transcript_segments (video_id, start_time, end_time, text, confidence)
        VALUES (?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((segments) => {
        for (const segment of segments) {
          stmt.run(videoId, segment.startTime, segment.endTime, segment.text, segment.confidence || null);
        }
      });

      transaction(segments);
    } else {
      // Memory-based implementation
      const transcriptSegments = segments.map((segment, index) => ({
        id: Date.now() + index,
        videoId,
        ...segment
      }));
      this.memoryTranscripts.set(videoId, transcriptSegments);
    }
  }

  getTranscriptSegments(videoId) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM transcript_segments 
        WHERE video_id = ? 
        ORDER BY start_time ASC
      `);

      const rows = stmt.all(videoId);
      return rows.map(row => this.mapRowToTranscriptSegment(row));
    } else {
      // Memory-based implementation
      return this.memoryTranscripts.get(videoId) || [];
    }
  }

  // Search operations
  searchTranscripts(query, limit = 50) {
    console.log('🔍 DB: searchTranscripts called with query:', query, 'limit:', limit);
    console.log('🔍 DB: Database available:', this.isAvailable);

    if (this.isAvailable) {
      console.log('🔍 DB: Using database search');
      // Save search to history
      this.saveSearchHistory(query);

      const stmt = this.db.prepare(`
        SELECT 
          v.id as video_id,
          v.file_path as video_path,
          v.file_name as video_name,
          ts.id,
          ts.start_time,
          ts.end_time,
          ts.text,
          ts.confidence,
          t.rank
        FROM transcripts t
        JOIN transcript_segments ts ON t.rowid = ts.id
        JOIN videos v ON ts.video_id = v.id
        WHERE transcripts MATCH ?
        ORDER BY t.rank
        LIMIT ?
      `);

      console.log('🔍 DB: Executing database query');
      const rows = stmt.all(query, limit);
      console.log('🔍 DB: Raw database rows:', rows);
      console.log('🔍 DB: Number of raw rows:', rows.length);

      // Group results by video
      const videoMap = new Map();

      for (const row of rows) {
        const videoId = row.video_id;

        if (!videoMap.has(videoId)) {
          videoMap.set(videoId, {
            videoId,
            videoPath: row.video_path,
            videoName: row.video_name,
            segments: [],
            relevanceScore: row.rank
          });
        }

        const searchResult = videoMap.get(videoId);
        searchResult.segments.push({
          id: row.id,
          videoId,
          startTime: row.start_time,
          endTime: row.end_time,
          text: row.text,
          confidence: row.confidence
        });
      }

      const finalResults = Array.from(videoMap.values());
      console.log('🔍 DB: Final grouped results:', finalResults);
      console.log('🔍 DB: Number of final results:', finalResults.length);

      return finalResults;
    } else {
      console.log('🔍 DB: Using memory-based search');
      console.log('🔍 DB: Memory videos count:', this.memoryVideos.length);
      console.log('🔍 DB: Memory transcripts count:', this.memoryTranscripts.size);

      // Memory-based implementation - simple text search
      const results = [];
      const queryLower = query.toLowerCase();

      for (const video of this.memoryVideos) {
        console.log('🔍 DB: Checking video:', video.fileName, 'ID:', video.id);
        const segments = this.memoryTranscripts.get(video.id) || [];
        console.log('🔍 DB: Video segments count:', segments.length);

        if (segments.length > 0) {
          console.log('🔍 DB: Sample segment text:', segments[0].text);
        }

        const matchingSegments = segments.filter(segment =>
          segment.text.toLowerCase().includes(queryLower)
        );

        console.log('🔍 DB: Matching segments for video:', matchingSegments.length);

        if (matchingSegments.length > 0) {
          const result = {
            videoId: video.id,
            videoPath: video.filePath,
            videoName: video.fileName,
            segments: matchingSegments,
            relevanceScore: matchingSegments.length
          };
          console.log('🔍 DB: Adding result:', result);
          results.push(result);
        }
      }

      const finalResults = results.slice(0, limit);
      console.log('🔍 DB: Memory-based final results:', finalResults);
      console.log('🔍 DB: Memory-based final results count:', finalResults.length);

      return finalResults;
    }
  }

  saveSearchHistory(query) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        INSERT INTO search_history (query) VALUES (?)
      `);
      stmt.run(query);
    }
    // Memory mode doesn't save search history
  }

  getSearchHistory(limit = 10) {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT DISTINCT query FROM search_history 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);

      const rows = stmt.all(limit);
      return rows.map(row => row.query);
    } else {
      // Memory mode doesn't have search history
      return [];
    }
  }

  // Helper methods
  mapRowToVideo(row) {
    return {
      id: row.id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      duration: row.duration,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      transcriptionStatus: row.transcription_status
    };
  }

  mapRowToTranscriptSegment(row) {
    return {
      id: row.id,
      videoId: row.video_id,
      startTime: row.start_time,
      endTime: row.end_time,
      text: row.text,
      confidence: row.confidence
    };
  }

  close() {
    if (this.isAvailable && this.db) {
      this.db.close();
    }
  }
}

// Singleton instance
let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    dbInstance = new VideoDatabase();
  }
  return dbInstance;
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  VideoDatabase,
  getDatabase,
  closeDatabase
}; 
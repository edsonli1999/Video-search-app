import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { VideoFile, TranscriptSegment, SearchResult } from '../../shared/types';

export class VideoDatabase {
  private db: any = null;
  private isAvailable: boolean = false;

  constructor() {
    console.log('🔧 DB: Starting database initialization...');

    try {
      // Step 1: Check Node.js version
      console.log('🔧 DB: Node.js version:', process.version);
      console.log('🔧 DB: NODE_MODULE_VERSION:', process.versions.modules);

      // Step 2: Try to import better-sqlite3
      console.log('🔧 DB: Attempting to import better-sqlite3...');
      const Database = require('better-sqlite3');
      console.log('🔧 DB: better-sqlite3 import successful');

      // Step 3: Check paths
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'videos.db');
      console.log('🔧 DB: User data path:', userDataPath);
      console.log('🔧 DB: Database path:', dbPath);

      // Step 4: Create directory
      console.log('🔧 DB: Creating directory...');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      console.log('🔧 DB: Directory created successfully');

      // Step 5: Initialize database
      console.log('🔧 DB: Initializing database...');
      this.db = new Database(dbPath);
      console.log('🔧 DB: Database object created');

      // Step 6: Set pragmas
      console.log('🔧 DB: Setting pragmas...');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      console.log('🔧 DB: Pragmas set');

      // Step 7: Initialize schema
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
        
        // Additional diagnostic info
        if (error.message.includes('NODE_MODULE_VERSION')) {
          console.error('🔧 This is a Node.js version mismatch issue');
          console.error('🔧 Your system Node.js:', process.version);
          console.error('🔧 Electron uses a different Node.js version');
        }
      } else {
        console.error('Unknown error type:', error);
      }

      this.isAvailable = false;
      this.initializeMemoryStorage();
    }
  }

  private memoryVideos: VideoFile[] = [];
  private memoryTranscripts: Map<number, TranscriptSegment[]> = new Map();

  private initializeMemoryStorage(): void {
    this.memoryVideos = [];
    this.memoryTranscripts = new Map();
  }

  private initializeDatabase(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  // Video operations
  insertVideo(video: Omit<VideoFile, 'id'>): number {
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

      return result.lastInsertRowid as number;
    } else {
      // Memory-based implementation
      const id = this.memoryVideos.length + 1;
      const newVideo: VideoFile = {
        ...video,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.memoryVideos.push(newVideo);
      return id;
    }
  }

  getVideoByPath(filePath: string): VideoFile | null {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM videos WHERE file_path = ?
      `);

      const row = stmt.get(filePath) as any;
      return row ? this.mapRowToVideo(row) : null;
    } else {
      // Memory-based implementation
      return this.memoryVideos.find(v => v.filePath === filePath) || null;
    }
  }

  getAllVideos(): VideoFile[] {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM videos ORDER BY created_at DESC
      `);

      const rows = stmt.all() as any[];
      return rows.map(row => this.mapRowToVideo(row));
    } else {
      // Memory-based implementation
      return [...this.memoryVideos].reverse();
    }
  }

  updateVideoTranscriptionStatus(videoId: number, status: VideoFile['transcriptionStatus']): void {
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

  deleteVideo(videoId: number): void {
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
  insertTranscriptSegments(videoId: number, segments: Omit<TranscriptSegment, 'id' | 'videoId'>[]): void {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        INSERT INTO transcript_segments (video_id, start_time, end_time, text, confidence)
        VALUES (?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((segments: Omit<TranscriptSegment, 'id' | 'videoId'>[]) => {
        for (const segment of segments) {
          stmt.run(videoId, segment.startTime, segment.endTime, segment.text, segment.confidence || null);
        }
      });

      transaction(segments);
    } else {
      // Memory-based implementation
      const transcriptSegments: TranscriptSegment[] = segments.map((segment, index) => ({
        id: Date.now() + index,
        videoId,
        ...segment
      }));
      this.memoryTranscripts.set(videoId, transcriptSegments);
    }
  }

  getTranscriptSegments(videoId: number): TranscriptSegment[] {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT * FROM transcript_segments 
        WHERE video_id = ? 
        ORDER BY start_time ASC
      `);

      const rows = stmt.all(videoId) as any[];
      return rows.map(row => this.mapRowToTranscriptSegment(row));
    } else {
      // Memory-based implementation
      return this.memoryTranscripts.get(videoId) || [];
    }
  }

  // Search operations
  searchTranscripts(query: string, limit: number = 50): SearchResult[] {
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
      const rows = stmt.all(query, limit) as any[];
      console.log('🔍 DB: Raw database rows:', rows);
      console.log('🔍 DB: Number of raw rows:', rows.length);

      // Group results by video
      const videoMap = new Map<number, SearchResult>();

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

        const searchResult = videoMap.get(videoId)!;
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
      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();

      for (const video of this.memoryVideos) {
        console.log('🔍 DB: Checking video:', video.fileName, 'ID:', video.id);
        const segments = this.memoryTranscripts.get(video.id!) || [];
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
            videoId: video.id!,
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

  private saveSearchHistory(query: string): void {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        INSERT INTO search_history (query) VALUES (?)
      `);
      stmt.run(query);
    }
    // Memory mode doesn't save search history
  }

  getSearchHistory(limit: number = 10): string[] {
    if (this.isAvailable) {
      const stmt = this.db.prepare(`
        SELECT DISTINCT query FROM search_history 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);

      const rows = stmt.all(limit) as any[];
      return rows.map(row => row.query);
    } else {
      // Memory mode doesn't have search history
      return [];
    }
  }

  // Helper methods
  private mapRowToVideo(row: any): VideoFile {
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

  private mapRowToTranscriptSegment(row: any): TranscriptSegment {
    return {
      id: row.id,
      videoId: row.video_id,
      startTime: row.start_time,
      endTime: row.end_time,
      text: row.text,
      confidence: row.confidence
    };
  }

  close(): void {
    if (this.isAvailable && this.db) {
      this.db.close();
    }
  }
}

// Singleton instance
let dbInstance: VideoDatabase | null = null;

export function getDatabase(): VideoDatabase {
  if (!dbInstance) {
    dbInstance = new VideoDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    duration REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    transcription_status TEXT DEFAULT 'pending'
);

-- Transcript segments table
CREATE TABLE IF NOT EXISTS transcript_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL,
    confidence REAL,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS transcripts USING fts5(
    video_id UNINDEXED,
    start_time UNINDEXED,
    end_time UNINDEXED,
    text,
    confidence UNINDEXED,
    content='transcript_segments',
    content_rowid='id'
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER IF NOT EXISTS transcript_segments_ai AFTER INSERT ON transcript_segments BEGIN
    INSERT INTO transcripts(rowid, video_id, start_time, end_time, text, confidence)
    VALUES (new.id, new.video_id, new.start_time, new.end_time, new.text, new.confidence);
END;

CREATE TRIGGER IF NOT EXISTS transcript_segments_ad AFTER DELETE ON transcript_segments BEGIN
    INSERT INTO transcripts(transcripts, rowid, video_id, start_time, end_time, text, confidence)
    VALUES ('delete', old.id, old.video_id, old.start_time, old.end_time, old.text, old.confidence);
END;

CREATE TRIGGER IF NOT EXISTS transcript_segments_au AFTER UPDATE ON transcript_segments BEGIN
    INSERT INTO transcripts(transcripts, rowid, video_id, start_time, end_time, text, confidence)
    VALUES ('delete', old.id, old.video_id, old.start_time, old.end_time, old.text, old.confidence);
    INSERT INTO transcripts(rowid, video_id, start_time, end_time, text, confidence)
    VALUES (new.id, new.video_id, new.start_time, new.end_time, new.text, new.confidence);
END;

-- Search history table
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_path ON videos(file_path);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(transcription_status);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_video_id ON transcript_segments(video_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_time ON transcript_segments(start_time, end_time);

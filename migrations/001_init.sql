-- Migration: Initial schema for backuptool

CREATE TABLE files (
    id SERIAL PRIMARY KEY,
    hash VARCHAR(64) NOT NULL UNIQUE,
    content BYTEA NOT NULL
);

CREATE TABLE snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE snapshot_files (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, file_id, filename)
);

-- Index for fast lookup
CREATE INDEX idx_files_hash ON files(hash);
CREATE INDEX idx_snapshot_files_snapshot_id ON snapshot_files(snapshot_id);
CREATE INDEX idx_snapshot_files_file_id ON snapshot_files(file_id);

PRAGMA foreign_keys = ON;
CREATE TABLE admin_state (id INTEGER PRIMARY KEY CHECK (id = 1), initialized INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0);
INSERT INTO admin_state(id) VALUES (1);
CREATE TABLE credentials (id TEXT PRIMARY KEY, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER);
CREATE TABLE challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL, session_hash TEXT);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, credential_id TEXT NOT NULL, expires_at INTEGER NOT NULL, verified_at INTEGER NOT NULL, FOREIGN KEY(credential_id) REFERENCES credentials(id) ON DELETE CASCADE);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL, generation TEXT NOT NULL, next_sync_at INTEGER NOT NULL DEFAULT 0, current_snapshot TEXT);
CREATE TABLE sync_runs (
 id TEXT PRIMARY KEY, generation TEXT NOT NULL, config TEXT NOT NULL, status TEXT NOT NULL,
 started_at INTEGER NOT NULL, finished_at INTEGER, cursor TEXT, listing_key TEXT, listing_offset INTEGER NOT NULL DEFAULT 0, seen_cursors TEXT NOT NULL DEFAULT '[]',
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, discovered INTEGER NOT NULL DEFAULT 0,
 downloaded INTEGER NOT NULL DEFAULT 0, processed INTEGER NOT NULL DEFAULT 0,
 publish_offset INTEGER NOT NULL DEFAULT 0, publish_area REAL NOT NULL DEFAULT 0,
 publish_bounds TEXT, publish_pages INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_run ON sync_runs((1)) WHERE status IN ('queued','listing','processing','publishing');
CREATE TABLE sync_files (
 run_id TEXT NOT NULL, path TEXT NOT NULL, tile_id INTEGER NOT NULL,
 etag TEXT, modified TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL,
 raw_key TEXT, parsed_key TEXT, overview TEXT, area REAL, bounds TEXT,
 missing_count INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(run_id,path), UNIQUE(run_id,tile_id), FOREIGN KEY(run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);
CREATE INDEX sync_files_pending ON sync_files(run_id,status,path);
CREATE TABLE published_files (
 path TEXT PRIMARY KEY, generation TEXT NOT NULL, tile_id INTEGER NOT NULL,
 etag TEXT, modified TEXT NOT NULL, size INTEGER NOT NULL, raw_key TEXT NOT NULL,
 parsed_key TEXT NOT NULL, overview TEXT NOT NULL, area REAL NOT NULL, bounds TEXT,
 missing_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE snapshots (id TEXT PRIMARY KEY, manifest_key TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, retired_at INTEGER);
CREATE TABLE snapshot_files (snapshot_id TEXT NOT NULL, tile_id INTEGER NOT NULL, parsed_key TEXT NOT NULL, raw_key TEXT NOT NULL, PRIMARY KEY(snapshot_id,tile_id), FOREIGN KEY(snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE);
CREATE TABLE webdav_budget (id INTEGER PRIMARY KEY CHECK(id=1), window_start INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0);
INSERT INTO webdav_budget(id) VALUES (1);
CREATE TABLE gc_state (id INTEGER PRIMARY KEY CHECK(id=1), cursor TEXT);
INSERT INTO gc_state(id) VALUES (1);

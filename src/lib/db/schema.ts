/**
 * Schema bootstrap + idempotent migrations.
 *
 * Runs at import time. Every entity module imports this file (purely
 * for side effects) before declaring its prepared statements — that way
 * the order in which entity modules are loaded doesn't matter; tables
 * and columns always exist by the time `db.prepare()` runs.
 *
 * Adding a column? Append an `addColumnIfMissing(...)` call. Never
 * delete or rename — SQLite migrations are append-only here; renames
 * would require copying rows into a new table, which we avoid for a
 * single-user app.
 */
import { db } from "./connection";

/**
 * Adds a column only if it isn't already on the table. Lets us evolve
 * the schema in-place across deploys without a dedicated migration tool.
 */
function addColumnIfMissing(table: string, col: string, decl: string) {
  const info = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (!info.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
}

// ──────────────── photos ────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    mime        TEXT NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size_bytes  INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_photos_uploaded_at ON photos(uploaded_at DESC);
`);

addColumnIfMissing("photos", "developed_at", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("photos", "develop_params", "TEXT");
addColumnIfMissing("photos", "has_base", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("photos", "original_ext", "TEXT");
addColumnIfMissing("photos", "is_favorite", "INTEGER NOT NULL DEFAULT 0");
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos(is_favorite, uploaded_at DESC)`,
);

// EXIF columns (added 2026-05 — backfill via /api/photos/backfill-exif)
addColumnIfMissing("photos", "camera", "TEXT");
addColumnIfMissing("photos", "lens", "TEXT");
addColumnIfMissing("photos", "fstop", "REAL");
addColumnIfMissing("photos", "shutter", "TEXT");
addColumnIfMissing("photos", "iso", "INTEGER");
addColumnIfMissing("photos", "focal", "REAL");
addColumnIfMissing("photos", "taken_at", "INTEGER");
addColumnIfMissing("photos", "gps_lat", "REAL");
addColumnIfMissing("photos", "gps_lng", "REAL");
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos(camera);
   CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at DESC);`,
);

// Video support (added 2026-05). `kind` discriminates 'photo' vs 'video';
// 'duration_ms' is null for photos.
addColumnIfMissing("photos", "kind", "TEXT NOT NULL DEFAULT 'photo'");
addColumnIfMissing("photos", "duration_ms", "INTEGER");

// Background processing state. 'ready' is the only state for photos (their
// upload pipeline is synchronous). For videos: 'processing' while ffmpeg is
// encoding in the background, 'ready' once the MP4 lands on disk, 'failed'
// if encoding crashed. Defensive recovery on boot below: any 'processing'
// rows left behind by a crash are flipped to 'failed' (the in-process queue
// has no persistence).
addColumnIfMissing(
  "photos",
  "processing_status",
  "TEXT NOT NULL DEFAULT 'ready'",
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(processing_status)`,
);
db.exec(
  `UPDATE photos SET processing_status = 'failed' WHERE processing_status = 'processing'`,
);

// Content-hash for upload-time deduplication. SHA-256 of the uploaded bytes
// (before any processing). NULL on rows from before this column existed;
// the dedup check skips NULLs so legacy photos don't false-positive.
addColumnIfMissing("photos", "content_hash", "TEXT");
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_photos_content_hash ON photos(content_hash)
   WHERE content_hash IS NOT NULL`,
);
// Backfill developed_at = uploaded_at for old rows
db.exec(
  `UPDATE photos SET developed_at = uploaded_at WHERE developed_at = 0`,
);

// ──────────────── tags (many-to-many with photos) ────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (photo_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_pt_photo ON photo_tags(photo_id);
  CREATE INDEX IF NOT EXISTS idx_pt_tag   ON photo_tags(tag_id);
`);

// ──────────────── galleries (many-to-many with photos) ────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS galleries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photo_galleries (
    photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    gallery_id  INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    added_at    INTEGER NOT NULL,
    PRIMARY KEY (photo_id, gallery_id)
  );

  CREATE INDEX IF NOT EXISTS idx_pg_gallery ON photo_galleries(gallery_id, added_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pg_photo   ON photo_galleries(photo_id);
`);

// Per-gallery extensions (added 2026-05/06):
//   - cover_photo_id: pin a specific photo as the cover. Without it the
//     `list` query falls back to the most-recent photo (legacy behavior).
//     SET NULL on photo delete so we can't end up with a dangling pointer.
//   - parent_id: 1-level hierarchy. A gallery's children show under it
//     in the detail page. Top-level listings filter parent_id IS NULL.
//     SET NULL on parent delete so children survive as top-level.
addColumnIfMissing(
  "galleries",
  "cover_photo_id",
  "INTEGER REFERENCES photos(id) ON DELETE SET NULL",
);
addColumnIfMissing(
  "galleries",
  "parent_id",
  "INTEGER REFERENCES galleries(id) ON DELETE SET NULL",
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_galleries_parent ON galleries(parent_id);`,
);

// ──────────────── smart albums (saved filters) ────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS smart_albums (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    filter_json TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

// ──────────────── photo shares (public, no-auth links) ────────────────
//
// A `photo_shares` row turns a 22-char URL-safe token into permission to
// view one photo without the session cookie. The token is the primary
// key; we look it up directly on every request to `/s/[token]` and
// `/files/share/[token]`.
//
// CASCADE on photo delete so revoking access happens automatically when
// the underlying photo is removed.
db.exec(`
  CREATE TABLE IF NOT EXISTS photo_shares (
    token       TEXT PRIMARY KEY,
    photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_photo_shares_photo
    ON photo_shares(photo_id, created_at DESC);
`);

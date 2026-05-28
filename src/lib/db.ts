import fs from "node:fs";
import Database from "better-sqlite3";
import { paths } from "./config";

fs.mkdirSync(paths.photosDir, { recursive: true });
fs.mkdirSync(paths.thumbsDir, { recursive: true });
fs.mkdirSync(paths.basesDir, { recursive: true });
fs.mkdirSync(paths.tmpDir, { recursive: true });

export const db = new Database(paths.dbFile);
db.pragma("journal_mode = WAL");

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

/** Add columns that may not exist on older DBs. SQLite-safe idempotent migration. */
function addColumnIfMissing(table: string, col: string, decl: string) {
  const info = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (!info.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
}
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

// Tags (many-to-many with photos)
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

// Galleries (many-to-many with photos)
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
// FK enforcement is per-connection in SQLite
db.pragma("foreign_keys = ON");

export interface Photo {
  id: number;
  name: string;
  mime: string;
  width: number;
  height: number;
  size_bytes: number;
  uploaded_at: number;
  developed_at: number;
  /** JSON-encoded DevelopParams, or null. */
  develop_params: string | null;
  /** 1 if a base.jpg is preserved for non-destructive re-develop. */
  has_base: number;
  /** Original extension like ".CR2" or ".jpg" (lowercased). */
  original_ext: string | null;
  /** 1 = user-marked favorite. */
  is_favorite: number;
  // EXIF (any may be null on legacy rows or files without metadata)
  camera: string | null;
  lens: string | null;
  fstop: number | null;
  shutter: string | null;
  iso: number | null;
  focal: number | null;
  taken_at: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  /** 'photo' (default) or 'video'. */
  kind: "photo" | "video";
  /** Duration in ms for videos, null for photos. */
  duration_ms: number | null;
  /** 'ready' | 'processing' | 'failed'. Always 'ready' for photos. */
  processing_status: "ready" | "processing" | "failed";
  /** SHA-256 of the original uploaded bytes. NULL for legacy rows. */
  content_hash: string | null;
}

const stmts = {
  byName: db.prepare<[string], Photo>("SELECT * FROM photos WHERE name = ?"),
  byId: db.prepare<[number], Photo>("SELECT * FROM photos WHERE id = ?"),
  list: db.prepare<[], Photo>(
    "SELECT * FROM photos ORDER BY uploaded_at DESC, id DESC",
  ),
  insert: db.prepare(
    `INSERT INTO photos
       (name, mime, width, height, size_bytes, uploaded_at,
        developed_at, develop_params, has_base, original_ext,
        camera, lens, fstop, shutter, iso, focal, taken_at, gps_lat, gps_lng,
        kind, duration_ms, processing_status, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?)`,
  ),
  updateForReplace: db.prepare(
    `UPDATE photos
       SET mime = ?, width = ?, height = ?, size_bytes = ?, uploaded_at = ?,
           developed_at = ?, develop_params = ?, has_base = ?, original_ext = ?,
           camera = ?, lens = ?, fstop = ?, shutter = ?, iso = ?, focal = ?,
           taken_at = ?, gps_lat = ?, gps_lng = ?,
           kind = ?, duration_ms = ?, processing_status = ?, content_hash = ?
     WHERE name = ?`,
  ),
  // Lookup by SHA-256 — used for upload-time dedup. NULL hashes never
  // match (legacy rows are excluded from the partial index).
  byHash: db.prepare<[string], Photo>(
    `SELECT * FROM photos WHERE content_hash = ? LIMIT 1`,
  ),
  // Lazy-backfill the content_hash for a legacy row. The WHERE clause
  // makes this a no-op if a hash already exists, so concurrent backfills
  // never clobber each other and develop-time hash updates aren't
  // overwritten by a stale read.
  setContentHashIfMissing: db.prepare(
    `UPDATE photos SET content_hash = ? WHERE id = ? AND content_hash IS NULL`,
  ),
  // Mark a video row as ready once the background transcode finishes (also
  // refreshes size_bytes + developed_at so the client invalidates its cached
  // thumb/MP4 via the ?v= query string).
  updateProcessed: db.prepare(
    `UPDATE photos
       SET size_bytes = ?, developed_at = ?, processing_status = ?
     WHERE id = ?`,
  ),
  updateExif: db.prepare(
    `UPDATE photos
       SET camera = ?, lens = ?, fstop = ?, shutter = ?, iso = ?, focal = ?,
           taken_at = ?, gps_lat = ?, gps_lng = ?
     WHERE id = ?`,
  ),
  listMissingExif: db.prepare<[], Photo>(
    `SELECT * FROM photos
     WHERE camera IS NULL AND lens IS NULL AND iso IS NULL
       AND fstop IS NULL AND taken_at IS NULL`,
  ),
  updateDevelop: db.prepare(
    `UPDATE photos
       SET width = ?, height = ?, size_bytes = ?, developed_at = ?, develop_params = ?
     WHERE id = ?`,
  ),
  setFavorite: db.prepare(
    `UPDATE photos SET is_favorite = ? WHERE id = ?`,
  ),
  listFavorites: db.prepare<[], Photo>(
    `SELECT * FROM photos WHERE is_favorite = 1 ORDER BY uploaded_at DESC, id DESC`,
  ),
  countPhotos: db.prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM photos`),
  listRecent: db.prepare<[number], Photo>(
    `SELECT * FROM photos ORDER BY uploaded_at DESC, id DESC LIMIT ?`,
  ),
  listOrphans: db.prepare<[], Photo>(`
    SELECT p.* FROM photos p
    WHERE NOT EXISTS (
      SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id
    )
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),
  countOrphans: db.prepare<[], { c: number }>(`
    SELECT COUNT(*) AS c FROM photos p
    WHERE NOT EXISTS (
      SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id
    )
  `),
  delete: db.prepare("DELETE FROM photos WHERE id = ?"),
};

export interface PhotoUpsert {
  name: string;
  mime: string;
  width: number;
  height: number;
  size_bytes: number;
  uploaded_at: number;
  developed_at: number;
  develop_params: string | null;
  has_base: number;
  original_ext: string | null;
  camera: string | null;
  lens: string | null;
  fstop: number | null;
  shutter: string | null;
  iso: number | null;
  focal: number | null;
  taken_at: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  kind: "photo" | "video";
  duration_ms: number | null;
  processing_status: "ready" | "processing" | "failed";
  content_hash: string | null;
}

export const photoQueries = {
  byName: (name: string) => stmts.byName.get(name) ?? null,
  byId: (id: number) => stmts.byId.get(id) ?? null,
  byHash: (hash: string) => stmts.byHash.get(hash) ?? null,
  setContentHashIfMissing: (id: number, hash: string) => {
    stmts.setContentHashIfMissing.run(hash, id);
  },
  list: () => stmts.list.all(),
  insert: (p: PhotoUpsert) => {
    const r = stmts.insert.run(
      p.name,
      p.mime,
      p.width,
      p.height,
      p.size_bytes,
      p.uploaded_at,
      p.developed_at,
      p.develop_params,
      p.has_base,
      p.original_ext,
      p.camera,
      p.lens,
      p.fstop,
      p.shutter,
      p.iso,
      p.focal,
      p.taken_at,
      p.gps_lat,
      p.gps_lng,
      p.kind,
      p.duration_ms,
      p.processing_status,
      p.content_hash,
    );
    return Number(r.lastInsertRowid);
  },
  upsertReplace: (p: PhotoUpsert) => {
    stmts.updateForReplace.run(
      p.mime,
      p.width,
      p.height,
      p.size_bytes,
      p.uploaded_at,
      p.developed_at,
      p.develop_params,
      p.has_base,
      p.original_ext,
      p.camera,
      p.lens,
      p.fstop,
      p.shutter,
      p.iso,
      p.focal,
      p.taken_at,
      p.gps_lat,
      p.gps_lng,
      p.kind,
      p.duration_ms,
      p.processing_status,
      p.content_hash,
      p.name,
    );
  },
  updateProcessed: (
    id: number,
    sizeBytes: number,
    developedAt: number,
    status: "ready" | "failed",
  ) => {
    stmts.updateProcessed.run(sizeBytes, developedAt, status, id);
  },
  updateExif: (
    id: number,
    e: {
      camera: string | null;
      lens: string | null;
      fstop: number | null;
      shutter: string | null;
      iso: number | null;
      focal: number | null;
      taken_at: number | null;
      gps_lat: number | null;
      gps_lng: number | null;
    },
  ) => {
    stmts.updateExif.run(
      e.camera,
      e.lens,
      e.fstop,
      e.shutter,
      e.iso,
      e.focal,
      e.taken_at,
      e.gps_lat,
      e.gps_lng,
      id,
    );
  },
  listMissingExif: () => stmts.listMissingExif.all(),
  updateDevelop: (
    id: number,
    width: number,
    height: number,
    sizeBytes: number,
    developedAt: number,
    developParams: string | null,
  ) => {
    stmts.updateDevelop.run(
      width,
      height,
      sizeBytes,
      developedAt,
      developParams,
      id,
    );
  },
  setFavorite: (id: number, value: boolean) => {
    stmts.setFavorite.run(value ? 1 : 0, id);
  },
  listFavorites: () => stmts.listFavorites.all(),
  listRecent: (limit: number) => stmts.listRecent.all(limit),
  count: () => stmts.countPhotos.get()?.c ?? 0,
  listOrphans: () => stmts.listOrphans.all(),
  countOrphans: () => stmts.countOrphans.get()?.c ?? 0,
  delete: (id: number) => stmts.delete.run(id),
};

// ============================================================
//  Galleries
// ============================================================

export interface Gallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface GallerySummary extends Gallery {
  /** Total photos in this gallery. */
  photo_count: number;
  /** Filename of the most recently added/uploaded photo to use as cover. Null if empty. */
  cover_name: string | null;
  /** developed_at of the cover photo for cache-busting the thumb URL. */
  cover_developed_at: number | null;
}

const galleryStmts = {
  byId: db.prepare<[number], Gallery>("SELECT * FROM galleries WHERE id = ?"),
  bySlug: db.prepare<[string], Gallery>(
    "SELECT * FROM galleries WHERE slug = ?",
  ),
  slugExists: db.prepare<[string], { c: number }>(
    "SELECT COUNT(*) AS c FROM galleries WHERE slug = ?",
  ),
  insert: db.prepare(
    `INSERT INTO galleries (slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  rename: db.prepare(
    `UPDATE galleries SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
  ),
  delete: db.prepare("DELETE FROM galleries WHERE id = ?"),
  touch: db.prepare("UPDATE galleries SET updated_at = ? WHERE id = ?"),

  // List with cover (most recent photo by uploaded_at) + count
  list: db.prepare<[], GallerySummary>(`
    SELECT
      g.*,
      COALESCE(pc.cnt, 0) AS photo_count,
      cover.name AS cover_name,
      cover.developed_at AS cover_developed_at
    FROM galleries g
    LEFT JOIN (
      SELECT gallery_id, COUNT(*) AS cnt
      FROM photo_galleries
      GROUP BY gallery_id
    ) pc ON pc.gallery_id = g.id
    LEFT JOIN photos cover ON cover.id = (
      SELECT p.id FROM photos p
      JOIN photo_galleries pg ON pg.photo_id = p.id
      WHERE pg.gallery_id = g.id
      ORDER BY p.uploaded_at DESC, p.id DESC
      LIMIT 1
    )
    ORDER BY g.updated_at DESC, g.id DESC
  `),

  // Photos in a gallery (sorted by upload date)
  photosOf: db.prepare<[number], Photo>(`
    SELECT p.*
    FROM photos p
    JOIN photo_galleries pg ON pg.photo_id = p.id
    WHERE pg.gallery_id = ?
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),

  // Galleries a photo belongs to
  galleriesOfPhoto: db.prepare<[number], Gallery>(`
    SELECT g.*
    FROM galleries g
    JOIN photo_galleries pg ON pg.gallery_id = g.id
    WHERE pg.photo_id = ?
    ORDER BY g.name ASC
  `),

  // Membership
  addMember: db.prepare(
    `INSERT OR IGNORE INTO photo_galleries (photo_id, gallery_id, added_at)
     VALUES (?, ?, ?)`,
  ),
  removeMember: db.prepare(
    `DELETE FROM photo_galleries WHERE photo_id = ? AND gallery_id = ?`,
  ),
  clearMembersOfPhoto: db.prepare(
    `DELETE FROM photo_galleries WHERE photo_id = ?`,
  ),
};

export const galleryQueries = {
  byId: (id: number) => galleryStmts.byId.get(id) ?? null,
  bySlug: (slug: string) => galleryStmts.bySlug.get(slug) ?? null,
  slugExists: (slug: string) =>
    (galleryStmts.slugExists.get(slug)?.c ?? 0) > 0,

  list: () => galleryStmts.list.all(),
  photosOf: (galleryId: number) => galleryStmts.photosOf.all(galleryId),
  galleriesOfPhoto: (photoId: number) =>
    galleryStmts.galleriesOfPhoto.all(photoId),

  create: (slug: string, name: string, description: string | null) => {
    const now = Date.now();
    const r = galleryStmts.insert.run(slug, name, description, now, now);
    return Number(r.lastInsertRowid);
  },

  rename: (id: number, name: string, slug: string) => {
    galleryStmts.rename.run(name, slug, Date.now(), id);
  },

  delete: (id: number) => galleryStmts.delete.run(id),

  addMember: (photoId: number, galleryId: number) => {
    const now = Date.now();
    galleryStmts.addMember.run(photoId, galleryId, now);
    galleryStmts.touch.run(now, galleryId);
  },

  removeMember: (photoId: number, galleryId: number) => {
    galleryStmts.removeMember.run(photoId, galleryId);
    galleryStmts.touch.run(Date.now(), galleryId);
  },

  /** Replace the set of galleries a photo belongs to (transactional). */
  setMembershipsOfPhoto: db.transaction(
    (photoId: number, galleryIds: number[]) => {
      galleryStmts.clearMembersOfPhoto.run(photoId);
      const now = Date.now();
      for (const gid of galleryIds) {
        galleryStmts.addMember.run(photoId, gid, now);
        galleryStmts.touch.run(now, gid);
      }
    },
  ),
};

// ============================================================
//  Tags
// ============================================================

export interface Tag {
  id: number;
  name: string;
  created_at: number;
}
export interface TagSummary extends Tag {
  photo_count: number;
}

const tagStmts = {
  byId: db.prepare<[number], Tag>("SELECT * FROM tags WHERE id = ?"),
  byName: db.prepare<[string], Tag>("SELECT * FROM tags WHERE name = ?"),
  insert: db.prepare(
    `INSERT INTO tags (name, created_at) VALUES (?, ?)`,
  ),
  // List with photo counts, ordered by popularity then alphabetically
  list: db.prepare<[], TagSummary>(`
    SELECT t.*, COALESCE(c.cnt, 0) AS photo_count
    FROM tags t
    LEFT JOIN (
      SELECT tag_id, COUNT(*) AS cnt
      FROM photo_tags
      GROUP BY tag_id
    ) c ON c.tag_id = t.id
    ORDER BY photo_count DESC, t.name COLLATE NOCASE ASC
  `),
  tagsOfPhoto: db.prepare<[number], Tag>(`
    SELECT t.* FROM tags t
    JOIN photo_tags pt ON pt.tag_id = t.id
    WHERE pt.photo_id = ?
    ORDER BY t.name COLLATE NOCASE ASC
  `),
  photosOfTag: db.prepare<[number], Photo>(`
    SELECT p.* FROM photos p
    JOIN photo_tags pt ON pt.photo_id = p.id
    WHERE pt.tag_id = ?
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),
  addMember: db.prepare(
    `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at)
     VALUES (?, ?, ?)`,
  ),
  removeMember: db.prepare(
    `DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?`,
  ),
  // Garbage-collect tags that no longer point to any photo (called after remove)
  pruneOrphans: db.prepare(
    `DELETE FROM tags
     WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)`,
  ),
};

export const tagQueries = {
  byId: (id: number) => tagStmts.byId.get(id) ?? null,
  byName: (name: string) => tagStmts.byName.get(name) ?? null,
  list: () => tagStmts.list.all(),
  tagsOfPhoto: (photoId: number) => tagStmts.tagsOfPhoto.all(photoId),
  photosOfTag: (tagId: number) => tagStmts.photosOfTag.all(tagId),

  /** Find an existing tag by name (case-insensitive) or create it. */
  upsert: (name: string): Tag => {
    const trimmed = name.trim();
    const existing = tagStmts.byName.get(trimmed);
    if (existing) return existing;
    const r = tagStmts.insert.run(trimmed, Date.now());
    return tagStmts.byId.get(Number(r.lastInsertRowid))!;
  },

  addMember: (photoId: number, tagId: number) => {
    tagStmts.addMember.run(photoId, tagId, Date.now());
  },
  removeMember: (photoId: number, tagId: number) => {
    tagStmts.removeMember.run(photoId, tagId);
    // Prune the tag itself if nobody else references it
    tagStmts.pruneOrphans.run();
  },
};

// ============================================================
//  Search
// ============================================================

/**
 * Search photos by name / camera / lens / tag name.
 * Returns DISTINCT rows, ordered by upload date desc.
 *
 * Naive LIKE search — fine up to ~10k photos. If/when it gets slow,
 * swap for an FTS5 virtual table.
 */
const searchStmts = {
  photos: db.prepare<[string, string, string, string], Photo>(`
    SELECT DISTINCT p.* FROM photos p
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.name LIKE ?
       OR p.camera LIKE ?
       OR p.lens LIKE ?
       OR t.name LIKE ?
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),
  galleries: db.prepare<[string, string], GallerySummary>(`
    SELECT
      g.*,
      COALESCE(pc.cnt, 0) AS photo_count,
      cover.name AS cover_name,
      cover.developed_at AS cover_developed_at
    FROM galleries g
    LEFT JOIN (
      SELECT gallery_id, COUNT(*) AS cnt
      FROM photo_galleries
      GROUP BY gallery_id
    ) pc ON pc.gallery_id = g.id
    LEFT JOIN photos cover ON cover.id = (
      SELECT p.id FROM photos p
      JOIN photo_galleries pg ON pg.photo_id = p.id
      WHERE pg.gallery_id = g.id
      ORDER BY p.uploaded_at DESC, p.id DESC
      LIMIT 1
    )
    WHERE g.name LIKE ? OR g.description LIKE ?
    ORDER BY g.updated_at DESC, g.id DESC
  `),
};

export const search = {
  photos: (q: string) => {
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    return searchStmts.photos.all(like, like, like, like);
  },
  galleries: (q: string) => {
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    return searchStmts.galleries.all(like, like);
  },
};

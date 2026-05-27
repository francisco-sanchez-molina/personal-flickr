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
// Backfill developed_at = uploaded_at for old rows
db.exec(
  `UPDATE photos SET developed_at = uploaded_at WHERE developed_at = 0`,
);

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
        developed_at, develop_params, has_base, original_ext)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  updateForReplace: db.prepare(
    `UPDATE photos
       SET mime = ?, width = ?, height = ?, size_bytes = ?, uploaded_at = ?,
           developed_at = ?, develop_params = ?, has_base = ?, original_ext = ?
     WHERE name = ?`,
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
}

export const photoQueries = {
  byName: (name: string) => stmts.byName.get(name) ?? null,
  byId: (id: number) => stmts.byId.get(id) ?? null,
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
      p.name,
    );
  },
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

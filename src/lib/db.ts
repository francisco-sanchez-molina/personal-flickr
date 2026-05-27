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
// Backfill developed_at = uploaded_at for old rows
db.exec(
  `UPDATE photos SET developed_at = uploaded_at WHERE developed_at = 0`,
);

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
  delete: (id: number) => stmts.delete.run(id),
};

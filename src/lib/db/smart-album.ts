/**
 * Smart albums — saved filter queries.
 *
 * `smart_albums` rows store a name + JSON-encoded filter. Running the
 * filter (`runSmartFilter`) composes a parameterized WHERE clause from
 * the structured filter and returns the matching photos. Every user-
 * supplied value goes through a `?` placeholder; the shape of the
 * predicates is data-driven (omit clauses for unset fields) — that's
 * the only safe way to build a dynamic WHERE.
 */
import { db } from "./connection";
import "./schema";
import type { Photo } from "./photo";

export interface SmartAlbum {
  id: number;
  name: string;
  filter_json: string;
  created_at: number;
  updated_at: number;
}

/**
 * The shape of a smart-album filter. All fields optional; missing ones
 * don't constrain the result. Range fields are inclusive on both ends.
 *
 * Stored as JSON in `smart_albums.filter_json`; validated through Zod
 * (see lib/validation.ts) before reaching this layer.
 */
export interface SmartFilter {
  camera?: string;
  lens?: string;
  kind?: "photo" | "video";
  isFavorite?: boolean;
  withoutGallery?: boolean;
  galleryId?: number;
  isoMin?: number;
  isoMax?: number;
  fstopMin?: number;
  fstopMax?: number;
  takenFrom?: number; // unix ms
  takenTo?: number; // unix ms
}

const smartAlbumStmts = {
  byId: db.prepare<[number], SmartAlbum>(
    `SELECT * FROM smart_albums WHERE id = ?`,
  ),
  list: db.prepare<[], SmartAlbum>(
    `SELECT * FROM smart_albums ORDER BY updated_at DESC, id DESC`,
  ),
  insert: db.prepare(
    `INSERT INTO smart_albums (name, filter_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  ),
  update: db.prepare(
    `UPDATE smart_albums SET name = ?, filter_json = ?, updated_at = ? WHERE id = ?`,
  ),
  delete: db.prepare(`DELETE FROM smart_albums WHERE id = ?`),
};

export const smartAlbumQueries = {
  byId: (id: number) => smartAlbumStmts.byId.get(id) ?? null,
  list: () => smartAlbumStmts.list.all(),
  create: (name: string, filterJson: string) => {
    const now = Date.now();
    const r = smartAlbumStmts.insert.run(name, filterJson, now, now);
    return Number(r.lastInsertRowid);
  },
  update: (id: number, name: string, filterJson: string) => {
    smartAlbumStmts.update.run(name, filterJson, Date.now(), id);
  },
  delete: (id: number) => smartAlbumStmts.delete.run(id),
};

/**
 * Run a smart-album filter and return matching photos. Builds the WHERE
 * incrementally from set fields; every value is bound through `?` so
 * the user input never touches SQL text directly.
 */
export function runSmartFilter(filter: SmartFilter): Photo[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.camera) {
    where.push(`p.camera = ?`);
    params.push(filter.camera);
  }
  if (filter.lens) {
    where.push(`p.lens = ?`);
    params.push(filter.lens);
  }
  if (filter.kind) {
    where.push(`p.kind = ?`);
    params.push(filter.kind);
  }
  if (filter.isFavorite !== undefined) {
    where.push(`p.is_favorite = ?`);
    params.push(filter.isFavorite ? 1 : 0);
  }
  if (filter.isoMin !== undefined) {
    where.push(`p.iso >= ?`);
    params.push(filter.isoMin);
  }
  if (filter.isoMax !== undefined) {
    where.push(`p.iso <= ?`);
    params.push(filter.isoMax);
  }
  if (filter.fstopMin !== undefined) {
    where.push(`p.fstop >= ?`);
    params.push(filter.fstopMin);
  }
  if (filter.fstopMax !== undefined) {
    where.push(`p.fstop <= ?`);
    params.push(filter.fstopMax);
  }
  if (filter.takenFrom !== undefined) {
    where.push(`p.taken_at >= ?`);
    params.push(filter.takenFrom);
  }
  if (filter.takenTo !== undefined) {
    where.push(`p.taken_at <= ?`);
    params.push(filter.takenTo);
  }
  if (filter.withoutGallery) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id)`,
    );
  }
  if (filter.galleryId !== undefined) {
    where.push(
      `EXISTS (SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id AND pg.gallery_id = ?)`,
    );
    params.push(filter.galleryId);
  }

  // Trashed photos never match a smart album.
  where.unshift(`p.deleted_at IS NULL`);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const sql = `SELECT p.* FROM photos p ${whereSql}
               ORDER BY p.uploaded_at DESC, p.id DESC`;
  return db.prepare<typeof params, Photo>(sql).all(...params);
}

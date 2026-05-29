/**
 * Photo entity — the central table. Every other entity hangs off this
 * one (galleries, tags, smart filters all reference photo rows).
 *
 * `Photo` mirrors the DB row 1:1; `PhotoUpsert` is the shape an upload
 * pipeline produces for inserts/replaces.  Both intentionally use the
 * snake_case column names so callers don't need a mental mapping when
 * reading SQL.
 */
import { db } from "./connection";
import "./schema";

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
  /** Soft-delete timestamp (ms). NULL = live; set = in trash (PF-214). */
  deleted_at: number | null;
}

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

const stmts = {
  // byName / byId intentionally ignore deleted_at: byName backs filename
  // collision detection (the file stays on disk while trashed), and byId
  // must resolve trashed rows so the trash view + restore work.
  byName: db.prepare<[string], Photo>("SELECT * FROM photos WHERE name = ?"),
  byId: db.prepare<[number], Photo>("SELECT * FROM photos WHERE id = ?"),
  list: db.prepare<[], Photo>(
    "SELECT * FROM photos WHERE deleted_at IS NULL ORDER BY uploaded_at DESC, id DESC",
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
  // match. Trashed rows are excluded so re-uploading something you
  // deleted creates a fresh photo instead of silently colliding.
  byHash: db.prepare<[string], Photo>(
    `SELECT * FROM photos WHERE content_hash = ? AND deleted_at IS NULL LIMIT 1`,
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
     WHERE deleted_at IS NULL
       AND camera IS NULL AND lens IS NULL AND iso IS NULL
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
    `SELECT * FROM photos WHERE is_favorite = 1 AND deleted_at IS NULL ORDER BY uploaded_at DESC, id DESC`,
  ),
  countPhotos: db.prepare<[], { c: number }>(
    `SELECT COUNT(*) AS c FROM photos WHERE deleted_at IS NULL`,
  ),
  listRecent: db.prepare<[number], Photo>(
    `SELECT * FROM photos WHERE deleted_at IS NULL ORDER BY uploaded_at DESC, id DESC LIMIT ?`,
  ),
  listOrphans: db.prepare<[], Photo>(`
    SELECT p.* FROM photos p
    WHERE p.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id
    )
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),
  countOrphans: db.prepare<[], { c: number }>(`
    SELECT COUNT(*) AS c FROM photos p
    WHERE p.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM photo_galleries pg WHERE pg.photo_id = p.id
    )
  `),
  // Geotagged, live photos for the map view (PF-210).
  listGeotagged: db.prepare<[], Photo>(`
    SELECT * FROM photos
    WHERE deleted_at IS NULL AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL
    ORDER BY taken_at DESC, uploaded_at DESC, id DESC
  `),
  // ── trash (PF-214) ──
  softDelete: db.prepare("UPDATE photos SET deleted_at = ? WHERE id = ?"),
  restore: db.prepare("UPDATE photos SET deleted_at = NULL WHERE id = ?"),
  listTrash: db.prepare<[], Photo>(
    `SELECT * FROM photos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`,
  ),
  countTrash: db.prepare<[], { c: number }>(
    `SELECT COUNT(*) AS c FROM photos WHERE deleted_at IS NOT NULL`,
  ),
  // Rows trashed before `cutoff` — for an optional retention sweep.
  listTrashedBefore: db.prepare<[number], Photo>(
    `SELECT * FROM photos WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
  ),
  delete: db.prepare("DELETE FROM photos WHERE id = ?"),
};

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
  listGeotagged: () => stmts.listGeotagged.all(),
  // ── trash (PF-214) ──
  /** Move to trash. Files + memberships + shares are kept (lossless restore). */
  softDelete: (id: number) => stmts.softDelete.run(Date.now(), id),
  /** Bring a trashed photo back to live. */
  restore: (id: number) => stmts.restore.run(id),
  listTrash: () => stmts.listTrash.all(),
  countTrash: () => stmts.countTrash.get()?.c ?? 0,
  listTrashedBefore: (cutoff: number) => stmts.listTrashedBefore.all(cutoff),
  /** Hard delete — row gone, FK CASCADE drops memberships + shares. */
  purge: (id: number) => stmts.delete.run(id),
  /** @deprecated use softDelete (trash) or purge (permanent). Kept for callers mid-migration. */
  delete: (id: number) => stmts.delete.run(id),
};

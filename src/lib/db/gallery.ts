/**
 * Gallery entity — a named, ordered set of photos. Many-to-many with
 * photos via the `photo_galleries` join table. Optional 1-level
 * hierarchy via `parent_id` (US-11) and pinned cover via
 * `cover_photo_id` (US-08).
 */
import { db } from "./connection";
import "./schema";
import type { Photo } from "./photo";

export interface Gallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  /** Pinned cover photo. Null = fall back to most-recent. */
  cover_photo_id: number | null;
  /** 1-level hierarchy: optional parent gallery. */
  parent_id: number | null;
}

export interface GallerySummary extends Gallery {
  /** Total photos in this gallery. */
  photo_count: number;
  /** Filename of the resolved cover photo (pinned if set, else newest). Null if empty. */
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
    `INSERT INTO galleries (slug, name, description, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  rename: db.prepare(
    `UPDATE galleries SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
  ),
  setCover: db.prepare(
    `UPDATE galleries SET cover_photo_id = ?, updated_at = ? WHERE id = ?`,
  ),
  setParent: db.prepare(
    `UPDATE galleries SET parent_id = ?, updated_at = ? WHERE id = ?`,
  ),
  delete: db.prepare("DELETE FROM galleries WHERE id = ?"),
  touch: db.prepare("UPDATE galleries SET updated_at = ? WHERE id = ?"),

  /**
   * List galleries with their resolved cover + photo count. The cover
   * resolution uses COALESCE: prefer the explicitly-pinned `cover_photo_id`
   * (US-08), else fall back to the most-recently-uploaded photo in the
   * gallery. Filtering by `parent_id` lets the same query power both the
   * top-level grid (parent IS NULL) and a gallery's children list.
   */
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
    LEFT JOIN photos cover ON cover.id = COALESCE(
      g.cover_photo_id,
      (SELECT p.id FROM photos p
       JOIN photo_galleries pg ON pg.photo_id = p.id
       WHERE pg.gallery_id = g.id
       ORDER BY p.uploaded_at DESC, p.id DESC
       LIMIT 1)
    )
    WHERE g.parent_id IS NULL
    ORDER BY g.updated_at DESC, g.id DESC
  `),

  // Same shape as `list`, but scoped to children of one parent.
  listChildren: db.prepare<[number], GallerySummary>(`
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
    LEFT JOIN photos cover ON cover.id = COALESCE(
      g.cover_photo_id,
      (SELECT p.id FROM photos p
       JOIN photo_galleries pg ON pg.photo_id = p.id
       WHERE pg.gallery_id = g.id
       ORDER BY p.uploaded_at DESC, p.id DESC
       LIMIT 1)
    )
    WHERE g.parent_id = ?
    ORDER BY g.name COLLATE NOCASE ASC
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
  listChildren: (parentId: number) => galleryStmts.listChildren.all(parentId),
  photosOf: (galleryId: number) => galleryStmts.photosOf.all(galleryId),
  galleriesOfPhoto: (photoId: number) =>
    galleryStmts.galleriesOfPhoto.all(photoId),

  create: (
    slug: string,
    name: string,
    description: string | null,
    parentId: number | null = null,
  ) => {
    const now = Date.now();
    const r = galleryStmts.insert.run(
      slug,
      name,
      description,
      parentId,
      now,
      now,
    );
    return Number(r.lastInsertRowid);
  },

  rename: (id: number, name: string, slug: string) => {
    galleryStmts.rename.run(name, slug, Date.now(), id);
  },

  setCover: (id: number, photoId: number | null) => {
    galleryStmts.setCover.run(photoId, Date.now(), id);
  },

  setParent: (id: number, parentId: number | null) => {
    galleryStmts.setParent.run(parentId, Date.now(), id);
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

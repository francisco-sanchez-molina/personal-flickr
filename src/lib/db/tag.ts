/**
 * Tags — free-form labels attached to photos in a many-to-many
 * relationship. Tag names are case-insensitive (UNIQUE COLLATE NOCASE).
 * Empty tags self-prune after each remove to keep the index page tidy.
 */
import { db } from "./connection";
import "./schema";
import type { Photo } from "./photo";

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
  insert: db.prepare(`INSERT INTO tags (name, created_at) VALUES (?, ?)`),
  rename: db.prepare(`UPDATE tags SET name = ? WHERE id = ?`),
  delete: db.prepare(`DELETE FROM tags WHERE id = ?`),
  // Merge: copy memberships from `from_id` to `into_id` (INSERT OR IGNORE
  // dedupes when a photo already has the destination tag), then drop the
  // source rows. Caller deletes the source tag afterwards.
  copyMembershipsFromTo: db.prepare(
    `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at)
     SELECT photo_id, ?, added_at FROM photo_tags WHERE tag_id = ?`,
  ),
  removeAllMembershipsOf: db.prepare(
    `DELETE FROM photo_tags WHERE tag_id = ?`,
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

  rename: (id: number, name: string) => {
    tagStmts.rename.run(name.trim(), id);
  },

  /**
   * Merge `fromId` into `intoId`: every photo tagged with `fromId` ends
   * up tagged with `intoId` (dedup is automatic via INSERT OR IGNORE),
   * then the source tag's memberships are wiped and the tag row is
   * deleted. Wrapped in a transaction so we never leave the DB half-
   * merged.
   */
  merge: db.transaction((fromId: number, intoId: number) => {
    if (fromId === intoId) return;
    tagStmts.copyMembershipsFromTo.run(intoId, fromId);
    tagStmts.removeAllMembershipsOf.run(fromId);
    tagStmts.delete.run(fromId);
  }),
};

/**
 * Naive LIKE search across photos + galleries.
 *
 * Fine up to ~10k photos. If/when it gets slow, swap for an FTS5
 * virtual table — the call surface (`search.photos(q)` /
 * `search.galleries(q)`) is small enough that consumers won't notice.
 */
import { db } from "./connection";
import "./schema";
import type { Photo } from "./photo";
import type { GallerySummary } from "./gallery";

const searchStmts = {
  photos: db.prepare<[string, string, string, string], Photo>(`
    SELECT DISTINCT p.* FROM photos p
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.deleted_at IS NULL
      AND (p.name LIKE ?
       OR p.camera LIKE ?
       OR p.lens LIKE ?
       OR t.name LIKE ?)
    ORDER BY p.uploaded_at DESC, p.id DESC
  `),
  galleries: db.prepare<[string, string], GallerySummary>(`
    SELECT
      g.*,
      COALESCE(pc.cnt, 0) AS photo_count,
      cover.name AS cover_name,
      cover.developed_at AS cover_developed_at,
      cover.kind AS cover_kind
    FROM galleries g
    LEFT JOIN (
      SELECT pg.gallery_id, COUNT(*) AS cnt
      FROM photo_galleries pg
      JOIN photos p ON p.id = pg.photo_id AND p.deleted_at IS NULL
      GROUP BY pg.gallery_id
    ) pc ON pc.gallery_id = g.id
    LEFT JOIN photos cover ON cover.id = (
      SELECT p.id FROM photos p
      JOIN photo_galleries pg ON pg.photo_id = p.id
      WHERE pg.gallery_id = g.id AND p.deleted_at IS NULL
      ORDER BY p.uploaded_at DESC, p.id DESC
      LIMIT 1
    ) AND cover.deleted_at IS NULL
    WHERE g.name LIKE ? OR g.description LIKE ?
    ORDER BY g.updated_at DESC, g.id DESC
  `),
};

/**
 * Escape SQL LIKE wildcards so a literal `%` typed by the user matches
 * a literal `%`. The escape character is `\` (the default).
 */
function escapeLike(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
}

export const search = {
  photos: (q: string) => {
    const like = escapeLike(q);
    return searchStmts.photos.all(like, like, like, like);
  },
  galleries: (q: string) => {
    const like = escapeLike(q);
    return searchStmts.galleries.all(like, like);
  },
};

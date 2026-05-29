import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { basePath, photoPath, safeUnlink, thumbPath } from "~/lib/storage";

/**
 * DELETE /api/trash — empty the trash: hard-delete every photo currently
 * in it (unlink files + drop rows, CASCADEing memberships + shares).
 * Returns how many were purged.
 */
export const DELETE: APIRoute = async () => {
  const trashed = photoQueries.listTrash();
  for (const photo of trashed) {
    safeUnlink(photoPath(photo.name));
    safeUnlink(thumbPath(photo.name));
    if (photo.has_base) safeUnlink(basePath(photo.name));
    photoQueries.purge(photo.id);
  }
  return Response.json({ ok: true, purged: trashed.length });
};

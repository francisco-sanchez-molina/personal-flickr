import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { basePath, photoPath, safeUnlink, thumbPath } from "~/lib/storage";

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  safeUnlink(photoPath(photo.name));
  safeUnlink(thumbPath(photo.name));
  if (photo.has_base) {
    safeUnlink(basePath(photo.name));
  }
  photoQueries.delete(id);
  return Response.json({ ok: true });
};

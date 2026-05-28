import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { basePath, photoPath, safeUnlink, thumbPath } from "~/lib/storage";

/** Read a single photo row. Used by the client to poll background-processing
 *  videos until they transition out of `processing` (→ `ready` or `failed`). */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  return Response.json({ photo });
};

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

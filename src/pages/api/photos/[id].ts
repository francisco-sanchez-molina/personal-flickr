import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { basePath, photoPath, safeUnlink, thumbPath } from "~/lib/storage";

/**
 * `?purge=1` on DELETE hard-deletes (unlink files + drop the row, which
 * CASCADEs memberships + shares). Without it, DELETE soft-deletes (moves
 * to trash) — files stay on disk so a restore is lossless (PF-214).
 */

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

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }

  const purge = new URL(request.url).searchParams.get("purge") === "1";
  if (purge) {
    safeUnlink(photoPath(photo.name));
    safeUnlink(thumbPath(photo.name));
    if (photo.has_base) safeUnlink(basePath(photo.name));
    photoQueries.purge(id);
    return Response.json({ ok: true, purged: true });
  }

  photoQueries.softDelete(id);
  return Response.json({ ok: true, trashed: true });
};

/** PATCH { action: "restore" } — bring a trashed photo back to live. */
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "restore") {
    return Response.json({ error: "unknown_action" }, { status: 400 });
  }
  photoQueries.restore(id);
  return Response.json({ ok: true, photo: photoQueries.byId(id) });
};

import type { APIRoute } from "astro";
import { galleryQueries } from "~/lib/db";

export const DELETE: APIRoute = async ({ params }) => {
  const galleryId = Number(params.id);
  const photoId = Number(params.photoId);
  if (!Number.isInteger(galleryId) || !Number.isInteger(photoId)) {
    return new Response(JSON.stringify({ error: "bad params" }), { status: 400 });
  }
  galleryQueries.removeMember(photoId, galleryId);
  return Response.json({ ok: true });
};

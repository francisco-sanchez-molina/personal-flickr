import type { APIRoute } from "astro";
import { galleryQueries, photoQueries } from "~/lib/db";

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  return Response.json({
    galleries: galleryQueries.galleriesOfPhoto(id),
  });
};

/** Replace the photo's gallery memberships with the given set. */
export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    gallery_ids?: unknown;
  } | null;
  const ids = Array.isArray(body?.gallery_ids)
    ? body!.gallery_ids
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  // Validate that all galleries exist (skip non-existent silently)
  const validIds = ids.filter((gid) => galleryQueries.byId(gid));
  galleryQueries.setMembershipsOfPhoto(id, validIds);
  return Response.json({
    ok: true,
    galleries: galleryQueries.galleriesOfPhoto(id),
  });
};

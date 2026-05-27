import type { APIRoute } from "astro";
import { galleryQueries, photoQueries } from "~/lib/db";

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const gallery = galleryQueries.byId(id);
  if (!gallery) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  return Response.json({
    gallery,
    photos: galleryQueries.photosOf(id),
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const gallery = galleryQueries.byId(id);
  if (!gallery) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    photo_ids?: unknown;
  } | null;

  const ids = Array.isArray(body?.photo_ids)
    ? body!.photo_ids
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (ids.length === 0) {
    return new Response(JSON.stringify({ error: "photo_ids required" }), {
      status: 400,
    });
  }
  let added = 0;
  for (const pid of ids) {
    if (photoQueries.byId(pid)) {
      galleryQueries.addMember(pid, id);
      added++;
    }
  }
  return Response.json({ ok: true, added });
};

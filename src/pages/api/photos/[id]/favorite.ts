import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    value?: unknown;
  } | null;
  const value = body?.value === true;
  photoQueries.setFavorite(id, value);
  return Response.json({ ok: true, photo: photoQueries.byId(id) });
};

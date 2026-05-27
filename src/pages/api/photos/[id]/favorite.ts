import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { FavoriteBody, parseJson } from "~/lib/validation";

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = await parseJson(request, FavoriteBody);
  if (!parsed.ok) return parsed.response;

  photoQueries.setFavorite(id, parsed.data.value);
  return Response.json({ ok: true, photo: photoQueries.byId(id) });
};

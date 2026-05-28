import type { APIRoute } from "astro";
import { smartAlbumQueries } from "~/lib/db";
import { SmartAlbumUpdateBody, parseJson } from "~/lib/validation";

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const existing = smartAlbumQueries.byId(id);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = await parseJson(request, SmartAlbumUpdateBody);
  if (!parsed.ok) return parsed.response;
  const { name, filter } = parsed.data;

  const finalName = name ?? existing.name;
  const finalFilter = filter
    ? JSON.stringify(filter)
    : existing.filter_json;
  smartAlbumQueries.update(id, finalName, finalFilter);
  const updated = smartAlbumQueries.byId(id);
  return Response.json({
    ok: true,
    album: updated
      ? {
          id: updated.id,
          name: updated.name,
          filter: JSON.parse(updated.filter_json),
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        }
      : null,
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const existing = smartAlbumQueries.byId(id);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  smartAlbumQueries.delete(id);
  return Response.json({ ok: true });
};

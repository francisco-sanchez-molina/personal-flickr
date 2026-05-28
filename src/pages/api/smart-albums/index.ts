import type { APIRoute } from "astro";
import { smartAlbumQueries } from "~/lib/db";
import { SmartAlbumCreateBody, parseJson } from "~/lib/validation";

export const GET: APIRoute = async () => {
  // Each row carries the filter as a JSON string. We parse here so
  // clients don't need to know about the storage format.
  const rows = smartAlbumQueries.list().map((r) => ({
    id: r.id,
    name: r.name,
    filter: safeParseFilter(r.filter_json),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  return Response.json({ albums: rows });
};

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJson(request, SmartAlbumCreateBody);
  if (!parsed.ok) return parsed.response;
  const { name, filter } = parsed.data;
  const id = smartAlbumQueries.create(name, JSON.stringify(filter));
  return Response.json(
    { ok: true, album: { id, name, filter } },
    { status: 201 },
  );
};

function safeParseFilter(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

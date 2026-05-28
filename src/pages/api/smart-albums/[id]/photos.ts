import type { APIRoute } from "astro";
import { runSmartFilter, smartAlbumQueries, type SmartFilter } from "~/lib/db";
import { SmartFilterSchema } from "~/lib/validation";

/**
 * Run a saved smart-album filter and return the matching photos. The
 * filter is re-validated through Zod before reaching SQL — even though
 * we wrote the JSON ourselves on POST/PATCH, this guards against an
 * outdated schema reading from an old row (e.g. an extra field) or DB
 * corruption.
 */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const album = smartAlbumQueries.byId(id);
  if (!album) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  let parsed: SmartFilter;
  try {
    const raw = JSON.parse(album.filter_json);
    const validated = SmartFilterSchema.safeParse(raw);
    if (!validated.success) {
      return Response.json(
        { error: "invalid_filter", detail: validated.error.message },
        { status: 500 },
      );
    }
    parsed = validated.data as SmartFilter;
  } catch (err) {
    return Response.json(
      {
        error: "invalid_filter",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const photos = runSmartFilter(parsed);
  return Response.json({ photos });
};

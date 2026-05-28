import type { APIRoute } from "astro";
import { tagQueries } from "~/lib/db";
import { TagMergeBody, parseJson } from "~/lib/validation";

/**
 * Merge tag `id` into tag `intoId`. Every photo tagged with `id` ends up
 * tagged with `intoId` (dedup is automatic), then the source tag is
 * deleted. The whole thing runs inside a single transaction so an
 * interruption can't leave the catalog half-merged.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const source = tagQueries.byId(id);
  if (!source) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = await parseJson(request, TagMergeBody);
  if (!parsed.ok) return parsed.response;
  const { intoId } = parsed.data;

  if (intoId === id) {
    return Response.json(
      { error: "invalid_target", detail: "cannot merge a tag into itself" },
      { status: 400 },
    );
  }
  const dest = tagQueries.byId(intoId);
  if (!dest) {
    return Response.json(
      { error: "invalid_target", detail: "destination tag not found" },
      { status: 400 },
    );
  }

  tagQueries.merge(id, intoId);
  return Response.json({ ok: true, into: dest });
};

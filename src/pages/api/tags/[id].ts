import type { APIRoute } from "astro";
import { tagQueries } from "~/lib/db";
import { TagRenameBody, parseJson } from "~/lib/validation";

/**
 * Rename a tag. Conflict (case-insensitive UNIQUE on `tags.name`) yields
 * a 409 so the UI can show "another tag already has that name" instead
 * of a generic 500.
 */
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const existing = tagQueries.byId(id);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = await parseJson(request, TagRenameBody);
  if (!parsed.ok) return parsed.response;
  const { name } = parsed.data;

  if (name.trim().toLowerCase() === existing.name.toLowerCase()) {
    // No-op rename — return as-is to keep the API idempotent.
    return Response.json({ ok: true, tag: existing });
  }
  // Reject a rename that would clash with another existing tag. The user
  // probably wants the merge endpoint in that case.
  const clash = tagQueries.byName(name);
  if (clash && clash.id !== id) {
    return Response.json(
      {
        error: "name_taken",
        detail: `another tag already uses "${clash.name}". Use merge instead.`,
      },
      { status: 409 },
    );
  }

  tagQueries.rename(id, name);
  return Response.json({ ok: true, tag: tagQueries.byId(id) });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  // Merging into another tag deletes the source row. For a manual delete
  // we mirror tag pruning behavior: drop the memberships first, then the
  // tag — but exposing that is risky (irreversible). We accept the
  // request, but only as a thin wrapper around merge() with itself: just
  // remove the membership rows and let the orphan-prune do the rest.
  tagQueries.merge(id, id);
  return Response.json({ ok: true });
};

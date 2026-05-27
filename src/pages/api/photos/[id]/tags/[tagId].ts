import type { APIRoute } from "astro";
import { tagQueries } from "~/lib/db";

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  const tagId = Number(params.tagId);
  if (!Number.isInteger(id) || !Number.isInteger(tagId)) {
    return new Response(JSON.stringify({ error: "bad params" }), { status: 400 });
  }
  tagQueries.removeMember(id, tagId);
  return Response.json({ ok: true, tags: tagQueries.tagsOfPhoto(id) });
};

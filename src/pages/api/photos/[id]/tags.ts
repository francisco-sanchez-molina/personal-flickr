import type { APIRoute } from "astro";
import { photoQueries, tagQueries } from "~/lib/db";

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  return Response.json({ tags: tagQueries.tagsOfPhoto(id) });
};

/** POST { name } — adds a tag to the photo (creates the tag if needed). */
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
    name?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) {
    return new Response(
      JSON.stringify({ error: "invalid_name", detail: "1–40 characters" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tag = tagQueries.upsert(name);
  tagQueries.addMember(id, tag.id);
  return Response.json({ ok: true, tag, tags: tagQueries.tagsOfPhoto(id) });
};

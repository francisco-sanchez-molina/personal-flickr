import type { APIRoute } from "astro";
import { galleryQueries } from "~/lib/db";
import { slugify, uniqueSlug } from "~/lib/storage";

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const existing = galleryQueries.byId(id);
  if (!existing) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) {
    return new Response(
      JSON.stringify({ error: "invalid_name" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Recompute slug only if the name actually changed
  let slug = existing.slug;
  if (name !== existing.name) {
    slug = uniqueSlug(slugify(name), (s) =>
      s === existing.slug ? false : galleryQueries.slugExists(s),
    );
  }

  galleryQueries.rename(id, name, slug);
  return Response.json({ ok: true, gallery: galleryQueries.byId(id) });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const existing = galleryQueries.byId(id);
  if (!existing) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  // Cascading FK removes photo_galleries rows; photos stay.
  galleryQueries.delete(id);
  return Response.json({ ok: true });
};

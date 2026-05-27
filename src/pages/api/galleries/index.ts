import type { APIRoute } from "astro";
import { galleryQueries } from "~/lib/db";
import { slugify, uniqueSlug } from "~/lib/storage";

export const GET: APIRoute = async () => {
  return Response.json({ galleries: galleryQueries.list() });
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) {
    return new Response(
      JSON.stringify({ error: "invalid_name", detail: "1–80 characters required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 500)
      : null;

  const slug = uniqueSlug(slugify(name), (s) => galleryQueries.slugExists(s));
  const id = galleryQueries.create(slug, name, description);
  const created = galleryQueries.byId(id);
  return Response.json({ ok: true, gallery: created }, { status: 201 });
};

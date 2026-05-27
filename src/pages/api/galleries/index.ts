import type { APIRoute } from "astro";
import { galleryQueries } from "~/lib/db";
import { slugify, uniqueSlug } from "~/lib/storage";
import { GalleryCreateBody, parseJson } from "~/lib/validation";

export const GET: APIRoute = async () => {
  return Response.json({ galleries: galleryQueries.list() });
};

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJson(request, GalleryCreateBody);
  if (!parsed.ok) return parsed.response;
  const { name, description } = parsed.data;

  const slug = uniqueSlug(slugify(name), (s) => galleryQueries.slugExists(s));
  const id = galleryQueries.create(slug, name, description ?? null);
  const created = galleryQueries.byId(id);
  return Response.json({ ok: true, gallery: created }, { status: 201 });
};

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
  const { name, description, parentId } = parsed.data;

  // 1-level hierarchy: the proposed parent must itself be top-level.
  if (parentId !== undefined && parentId !== null) {
    const parent = galleryQueries.byId(parentId);
    if (!parent) {
      return Response.json(
        { error: "invalid_parent", detail: "parent not found" },
        { status: 400 },
      );
    }
    if (parent.parent_id !== null) {
      return Response.json(
        { error: "invalid_parent", detail: "max nesting depth is 1" },
        { status: 400 },
      );
    }
  }

  const slug = uniqueSlug(slugify(name), (s) => galleryQueries.slugExists(s));
  const id = galleryQueries.create(slug, name, description ?? null, parentId ?? null);
  const created = galleryQueries.byId(id);
  return Response.json({ ok: true, gallery: created }, { status: 201 });
};

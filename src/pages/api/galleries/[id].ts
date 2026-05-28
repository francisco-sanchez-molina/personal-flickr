import type { APIRoute } from "astro";
import { galleryQueries, photoQueries } from "~/lib/db";
import { slugify, uniqueSlug } from "~/lib/storage";
import { GalleryUpdateBody, parseJson } from "~/lib/validation";

/**
 * Update a gallery. All fields optional; only the ones present in the body
 * get applied. Supports:
 *   - name           → also recomputes the slug (uniquified) when changed
 *   - description    → free text (capped to 500 chars by the schema)
 *   - coverPhotoId   → pin a photo as the cover, or null to clear
 *   - parentId       → re-parent / unparent (1-level rule enforced here)
 */
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const existing = galleryQueries.byId(id);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = await parseJson(request, GalleryUpdateBody);
  if (!parsed.ok) return parsed.response;
  const { name, coverPhotoId, parentId } = parsed.data;

  // Name + slug
  if (name && name !== existing.name) {
    const slug = uniqueSlug(slugify(name), (s) =>
      s === existing.slug ? false : galleryQueries.slugExists(s),
    );
    galleryQueries.rename(id, name, slug);
  }

  // Cover photo
  if (coverPhotoId !== undefined) {
    if (coverPhotoId !== null) {
      const photo = photoQueries.byId(coverPhotoId);
      if (!photo) {
        return Response.json(
          { error: "invalid_cover", detail: "photo not found" },
          { status: 400 },
        );
      }
    }
    galleryQueries.setCover(id, coverPhotoId);
  }

  // Parent gallery — 1-level depth rule: the proposed parent itself must
  // be top-level (i.e. its own parent_id must be NULL). Otherwise we'd
  // end up with grandchildren we don't render.
  if (parentId !== undefined) {
    if (parentId === id) {
      return Response.json(
        { error: "invalid_parent", detail: "cannot parent to self" },
        { status: 400 },
      );
    }
    if (parentId !== null) {
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
    galleryQueries.setParent(id, parentId);
  }

  return Response.json({ ok: true, gallery: galleryQueries.byId(id) });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const existing = galleryQueries.byId(id);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // Cascading FK removes photo_galleries rows; photos stay. Children
  // galleries lose their parent_id (SET NULL) so they become top-level.
  galleryQueries.delete(id);
  return Response.json({ ok: true });
};

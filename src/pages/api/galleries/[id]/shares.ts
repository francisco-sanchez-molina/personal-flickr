import crypto from "node:crypto";
import type { APIRoute } from "astro";
import { galleryQueries, galleryShareQueries } from "~/lib/db";

/** GET: active public links for this gallery, newest first. */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  if (!galleryQueries.byId(id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ shares: galleryShareQueries.listForGallery(id) });
};

/** POST: mint a new gallery share token (collision-safe). */
export const POST: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  if (!galleryQueries.byId(id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = crypto.randomBytes(16).toString("base64url");
    if (galleryShareQueries.byToken(token)) continue;
    const share = galleryShareQueries.create(token, id);
    return Response.json({ share }, { status: 201 });
  }
  return Response.json(
    { error: "token_collision", detail: "Could not allocate a unique token" },
    { status: 500 },
  );
};

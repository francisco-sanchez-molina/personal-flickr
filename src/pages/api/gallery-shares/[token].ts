import type { APIRoute } from "astro";
import { galleryShareQueries } from "~/lib/db";

/** Revoke a gallery share. The link stops working everywhere immediately. */
export const DELETE: APIRoute = async ({ params }) => {
  const token = params.token;
  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ error: "bad_token" }, { status: 400 });
  }
  const removed = galleryShareQueries.delete(token);
  if (!removed) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true });
};

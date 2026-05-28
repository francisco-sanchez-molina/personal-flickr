import type { APIRoute } from "astro";
import { shareQueries } from "~/lib/db";

/**
 * Revoke a share. After this returns 200 the token stops working
 * everywhere (landing page + file bytes), since both routes look it up
 * on each request. Idempotent: deleting an already-gone token returns
 * 404 so the caller knows the state, but the desired end-state is
 * already true.
 */
export const DELETE: APIRoute = async ({ params }) => {
  const token = params.token;
  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ error: "bad_token" }, { status: 400 });
  }
  const removed = shareQueries.delete(token);
  if (!removed) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true });
};

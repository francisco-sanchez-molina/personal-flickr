import type { APIRoute } from "astro";
import { shareQueries } from "~/lib/db";

/**
 * GET /api/shares — every active share across all photos, joined with
 * the photo's name/kind/developed_at so the management page can render
 * thumbnails without extra round-trips. Newest first.
 *
 * Auth-gated by the standard middleware (this path isn't whitelisted).
 */
export const GET: APIRoute = async () => {
  return Response.json({ shares: shareQueries.listAll() });
};

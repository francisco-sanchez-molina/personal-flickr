import type { APIRoute } from "astro";
import { galleryShareQueries, shareQueries } from "~/lib/db";

/**
 * GET /api/shares — every active share, both photo and gallery, joined
 * with the target's display info so the management page can render
 * without extra round-trips. Newest first.
 *
 * Auth-gated by the standard middleware (this path isn't whitelisted).
 */
export const GET: APIRoute = async () => {
  return Response.json({
    shares: shareQueries.listAll(),
    galleryShares: galleryShareQueries.listAll(),
  });
};

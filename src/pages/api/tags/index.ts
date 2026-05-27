import type { APIRoute } from "astro";
import { tagQueries } from "~/lib/db";

export const GET: APIRoute = async () => {
  return Response.json({ tags: tagQueries.list() });
};

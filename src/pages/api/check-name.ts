import type { APIRoute } from "astro";
import {
  nameExists,
  sanitizeName,
  suggestRename,
  targetFilename,
} from "~/lib/storage";

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    filename?: string;
  } | null;
  if (!body?.filename) {
    return new Response(JSON.stringify({ error: "filename required" }), {
      status: 400,
    });
  }
  const { stem } = sanitizeName(body.filename);
  const finalName = targetFilename(stem);
  const exists = nameExists(finalName);
  return Response.json({
    finalName,
    exists,
    suggested: exists ? suggestRename(finalName) : null,
  });
};

import crypto from "node:crypto";
import type { APIRoute } from "astro";
import { photoQueries, shareQueries } from "~/lib/db";

/** GET: list active share links for this photo, newest first. */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ shares: shareQueries.listForPhoto(id) });
};

/**
 * POST: mint a new share token for this photo. Body is empty (the only
 * input is the path id). The 22-char URL-safe token is generated here
 * — db layer never touches `crypto`.
 *
 * If a collision happens (vanishingly unlikely with 128 bits of entropy
 * but cheap to retry), we just generate another token. We bail after a
 * few attempts so a misconfigured RNG can't loop forever.
 */
export const POST: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = crypto.randomBytes(16).toString("base64url");
    if (shareQueries.byToken(token)) continue;
    const share = shareQueries.create(token, id);
    return Response.json({ share }, { status: 201 });
  }
  return Response.json(
    { error: "token_collision", detail: "Could not allocate a unique token" },
    { status: 500 },
  );
};

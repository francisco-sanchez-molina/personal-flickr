import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { photoPath } from "~/lib/storage";

/**
 * Lazy migration: compute the SHA-256 of a legacy photo's *persisted* bytes
 * (the JPEG / MP4 on disk) and store it in `content_hash`.
 *
 * Background:
 *   The `content_hash` column was added later; rows uploaded before it
 *   landed have NULL. The proper hash would be of the originally-uploaded
 *   file but those bytes are gone (we recompress to ~2 MB at upload time
 *   and only keep `base.jpg` for RAW). So this best-effort backfill hashes
 *   what's still on disk. It catches future re-uploads of the *processed*
 *   bytes — not the original RAW — which is the most realistic dedup case
 *   for legacy rows.
 *
 * Trigger:
 *   The lightbox POSTs here once per photo on mount when it sees a NULL
 *   content_hash. Idempotent — if the column is already populated the
 *   update is a no-op (see `setContentHashIfMissing`).
 *
 * Safety:
 *   - Skips rows that are still `processing` (the file may not exist yet).
 *   - 404 if the row was deleted between the trigger and this call.
 *   - File-read errors return 500; the client just ignores them.
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
  // Already hashed (newly uploaded photo, or another tab beat us to it).
  if (photo.content_hash) {
    return Response.json({ ok: true, hash: photo.content_hash, cached: true });
  }
  // Video still encoding — the MP4 doesn't exist yet. Try again next time.
  if (photo.processing_status !== "ready") {
    return Response.json({ ok: true, skipped: "not_ready" });
  }

  try {
    const buf = await fs.readFile(photoPath(photo.name));
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    photoQueries.setContentHashIfMissing(photo.id, hash);
    return Response.json({ ok: true, hash });
  } catch (err: unknown) {
    return Response.json(
      {
        error: "hash_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
};

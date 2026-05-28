/**
 * Public bytes endpoint for shared photos. Whitelisted in middleware so
 * no session cookie is required — the token is the capability.
 *
 * Resolves the token → photo, then mirrors the body of the authed
 * `/files/photo/[name]` handler (MIME-by-extension, range support,
 * long-cache headers). We don't redirect to the authed URL because
 * that would 401 the unauthenticated caller.
 */
import fs from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { photoQueries, shareQueries } from "~/lib/db";
import { assertInsideDir } from "~/lib/storage";

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startRaw = m[1];
  const endRaw = m[2];
  if (startRaw === "" && endRaw === "") return null;
  let start: number;
  let end: number;
  if (startRaw === "") {
    const n = Number(endRaw);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Number(endRaw);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

export const GET: APIRoute = async ({ params, request }) => {
  const token = params.token;
  if (typeof token !== "string" || token.length === 0) {
    return new Response("not found", { status: 404 });
  }
  const share = shareQueries.byToken(token);
  if (!share) {
    return new Response("not found", { status: 404 });
  }
  const photo = photoQueries.byId(share.photo_id);
  if (!photo) {
    // ON DELETE CASCADE should keep this from happening, but if a race
    // ever lets it through we don't want to leak a 500.
    return new Response("not found", { status: 404 });
  }

  let resolved: string;
  try {
    resolved = assertInsideDir(photo.name, paths.photosDir);
  } catch {
    return new Response("invalid path", { status: 400 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = EXT_MIME[ext] ?? "application/octet-stream";

  // Tokens are revocable, so we *don't* claim immutability the way the
  // private endpoint does. Short browser cache is fine for the open
  // sharing case (the recipient reloads → fresh check).
  const cacheControl = "public, max-age=60";

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, stat.size);
    if (!range) {
      return new Response("invalid range", {
        status: 416,
        headers: {
          "content-range": `bytes */${stat.size}`,
          "content-type": "text/plain",
        },
      });
    }
    const { start, end } = range;
    const length = end - start + 1;
    const stream = fs.createReadStream(resolved, { start, end });
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "content-type": mime,
        "content-length": String(length),
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes",
        "cache-control": cacheControl,
      },
    });
  }

  return new Response(fs.createReadStream(resolved) as unknown as BodyInit, {
    headers: {
      "content-type": mime,
      "content-length": String(stat.size),
      "accept-ranges": "bytes",
      "cache-control": cacheControl,
    },
  });
};

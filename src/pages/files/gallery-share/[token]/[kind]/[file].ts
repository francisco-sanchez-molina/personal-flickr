/**
 * Public bytes endpoint for gallery shares. Whitelisted in middleware.
 *
 * The token grants access to one gallery; this resolves token → gallery,
 * then verifies the requested file is a *live member* of that gallery
 * before serving it — so the link can't be used to reach photos outside
 * the shared gallery, nor trashed ones.
 *
 *   /files/gallery-share/:token/thumb/:name   → WebP thumbnail
 *   /files/gallery-share/:token/photo/:name   → developed JPEG / MP4
 */
import fs from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { galleryQueries, galleryShareQueries } from "~/lib/db";
import { assertInsideDir } from "~/lib/storage";

const KIND_DIRS: Record<string, { dir: string; fixedMime: string | null }> = {
  photo: { dir: paths.photosDir, fixedMime: null },
  thumb: { dir: paths.thumbsDir, fixedMime: "image/webp" },
};

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
  const { token, kind, file } = params;
  const target = typeof kind === "string" ? KIND_DIRS[kind] : undefined;
  if (typeof token !== "string" || !file || !target) {
    return new Response("not found", { status: 404 });
  }
  const share = galleryShareQueries.byToken(token);
  if (!share) return new Response("not found", { status: 404 });

  // Membership + liveness guard — the token only unlocks this gallery.
  const member = galleryQueries.memberPhotoByName(share.gallery_id, file);
  if (!member) return new Response("not found", { status: 404 });

  let resolved: string;
  try {
    resolved = assertInsideDir(file, target.dir);
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
  const mime = target.fixedMime ?? EXT_MIME[ext] ?? "application/octet-stream";
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
    const stream = fs.createReadStream(resolved, { start, end });
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "content-type": mime,
        "content-length": String(end - start + 1),
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

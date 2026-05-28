import fs from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { assertInsideDir } from "~/lib/storage";

// thumb files always carry .mp4 / .jpg in their name (they inherit the photo's
// stored name), but their *contents* are always WebP poster (for video) or
// WebP thumb (for photos). Bases are always JPEG. Only the `photo` kind needs
// real MIME-by-extension since its content varies (jpeg vs mp4).
const KIND_DIRS: Record<string, { dir: string; fixedMime: string | null }> = {
  photo: { dir: paths.photosDir, fixedMime: null },
  thumb: { dir: paths.thumbsDir, fixedMime: "image/webp" },
  base: { dir: paths.basesDir, fixedMime: "image/jpeg" },
};

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function parseRange(header: string, size: number): { start: number; end: number } | null {
  // Only handle a single byte range — `bytes=START-END?`.
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startRaw = m[1];
  const endRaw = m[2];
  let start: number;
  let end: number;
  if (startRaw === "" && endRaw === "") return null;
  if (startRaw === "") {
    // suffix range: last N bytes
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
  const kind = params.kind ?? "";
  const file = params.file;
  const target = KIND_DIRS[kind];
  if (!file || !target) {
    return new Response("not found", { status: 404 });
  }
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
  const mime =
    target.fixedMime ?? EXT_MIME[ext] ?? "application/octet-stream";

  // Cache strategy:
  //   - `base` is immutable on disk by definition (the preserved RAW preview).
  //   - `photo`/`thumb` can change under the same filename when the user
  //     re-develops, but the URL always carries `?v=developed_at` (see
  //     lib/photo.ts) — so for any one URL the bytes are immutable too.
  // That means we can serve everything with `immutable, max-age=1y` and rely
  // on the cache-buster query string to force a refresh. Saves enormous
  // amounts of bandwidth (no revalidation roundtrip per thumbnail).
  const cacheControl = "private, max-age=31536000, immutable";

  // Range support — required for <video> scrubbing/seek. Browsers issue a
  // `Range: bytes=0-` on `<video>` element load to opt in to ranged delivery.
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

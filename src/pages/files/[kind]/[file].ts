import fs from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { assertInsideDir } from "~/lib/storage";

const KIND_DIRS: Record<string, string> = {
  photo: paths.photosDir,
  thumb: paths.thumbsDir,
  base: paths.basesDir,
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
  const dir = KIND_DIRS[kind];
  if (!file || !dir) {
    return new Response("not found", { status: 404 });
  }
  let resolved: string;
  try {
    resolved = assertInsideDir(file, dir);
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

  // `photo`/`thumb` may change content (re-develop) under the same filename
  // → cache only on the client with revalidation. `base` is immutable.
  const cacheControl =
    kind === "base"
      ? "private, max-age=31536000, immutable"
      : "private, max-age=0, must-revalidate";

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

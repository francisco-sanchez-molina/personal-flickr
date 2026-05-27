import fs from "node:fs";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { assertInsideDir } from "~/lib/storage";

const KIND_TO_DIR: Record<string, { dir: string; mime: string }> = {
  photo: { dir: paths.photosDir, mime: "image/jpeg" },
  thumb: { dir: paths.thumbsDir, mime: "image/webp" },
  base: { dir: paths.basesDir, mime: "image/jpeg" },
};

export const GET: APIRoute = async ({ params }) => {
  const kind = params.kind ?? "";
  const file = params.file;
  const target = KIND_TO_DIR[kind];
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
  // `photo` may change content (re-develop) under the same filename — must not be
  // cached forever by the browser. Clients append ?v=developed_at to bust the cache.
  // `thumb` is the same story.
  // `base` is immutable once written.
  const cacheControl =
    kind === "base"
      ? "private, max-age=31536000, immutable"
      : "private, max-age=0, must-revalidate";

  return new Response(fs.createReadStream(resolved) as unknown as BodyInit, {
    headers: {
      "content-type": target.mime,
      "content-length": String(stat.size),
      "cache-control": cacheControl,
    },
  });
};

import fs from "node:fs/promises";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";

/**
 * Reports total disk used by the data volume — surfaced in the rail as a
 * "X.X GB" chip so the operator can keep an eye on free space without
 * shelling into the container.
 *
 * Calculated by walking each known sub-directory once and summing
 * `stat.size`. We cache for 60 s because:
 *   - this is a single-user app, the number rarely changes
 *   - walking 10k files on a slow disk can take a few hundred ms
 *   - the chip refreshes on a 60s poll from the rail anyway
 */

interface DiskUsage {
  totalBytes: number;
  photos: number;
  thumbs: number;
  bases: number;
}

let cache: { ts: number; value: DiskUsage } | null = null;
const TTL_MS = 60_000;

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  // Sequential is fine — better-sqlite3 / Node will be the bottleneck long
  // before fs.readdir parallelism matters at our scale.
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch {
        /* file vanished mid-walk — skip */
      }
    }
  }
  return total;
}

async function compute(): Promise<DiskUsage> {
  const [photos, thumbs, bases] = await Promise.all([
    dirSize(paths.photosDir),
    dirSize(paths.thumbsDir),
    dirSize(paths.basesDir),
  ]);
  return {
    photos,
    thumbs,
    bases,
    totalBytes: photos + thumbs + bases,
  };
}

export const GET: APIRoute = async () => {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return Response.json({ ...cache.value, cached: true });
  }
  const value = await compute();
  cache = { ts: now, value };
  return Response.json({ ...value, cached: false });
};

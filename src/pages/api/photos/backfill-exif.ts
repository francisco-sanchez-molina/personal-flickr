import fs from "node:fs/promises";
import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { extractExif } from "~/lib/exif";
import { basePath, photoPath } from "~/lib/storage";

/**
 * Re-read EXIF for every photo that doesn't have any yet. Uses the preserved
 * RAW base when available (preferred), otherwise the developed JPEG. The
 * developed JPEG carries the EXIF that sharp preserved (sharp keeps EXIF when
 * we don't strip it — mozjpeg does retain it by default), so this works for
 * older non-RAW uploads too.
 *
 * Safe to re-run: only touches rows where camera/lens/iso/fstop/taken_at are
 * all NULL.
 */
export const POST: APIRoute = async () => {
  const targets = photoQueries.listMissingExif();
  let updated = 0;
  let scanned = 0;
  for (const p of targets) {
    scanned++;
    const candidatePath = p.has_base ? basePath(p.name) : photoPath(p.name);
    try {
      const buf = await fs.readFile(candidatePath);
      const exif = await extractExif(buf);
      const hasAnything =
        exif.camera ||
        exif.lens ||
        exif.fstop ||
        exif.iso ||
        exif.taken_at ||
        exif.gps_lat;
      if (!hasAnything) continue;
      photoQueries.updateExif(p.id, exif);
      updated++;
    } catch {
      /* file missing or unreadable — skip */
    }
  }
  return Response.json({ ok: true, scanned, updated });
};

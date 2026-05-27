import fs from "node:fs/promises";
import path from "node:path";
import type { APIRoute } from "astro";
import { paths } from "~/lib/config";
import { photoQueries } from "~/lib/db";
import { extractExif, EMPTY_EXIF } from "~/lib/exif";
import {
  DEFAULT_DEVELOP,
  applyDevelop,
  extractBaseJpeg,
  isDefaultDevelop,
  isRaw,
  type DevelopParams,
} from "~/lib/processor";
import {
  basePath,
  nameExists,
  photoPath,
  sanitizeName,
  suggestRename,
  targetFilename,
  thumbPath,
} from "~/lib/storage";

export const config = { runtime: "nodejs" } as const;

type Decision = "create" | "replace" | "rename";

function parseDevelopParams(raw: unknown): DevelopParams {
  if (typeof raw !== "string" || !raw) return DEFAULT_DEVELOP;
  try {
    const obj = JSON.parse(raw) as Partial<DevelopParams>;
    const clamp = (n: unknown, lo: number, hi: number, def: number) => {
      const v = typeof n === "number" && Number.isFinite(n) ? n : def;
      return Math.min(hi, Math.max(lo, v));
    };
    const rotateRaw = typeof obj.rotate === "number" ? obj.rotate : 0;
    const rotate = ([0, 90, 180, 270] as const).includes(rotateRaw as 0)
      ? (rotateRaw as 0 | 90 | 180 | 270)
      : 0;
    return {
      brightness: clamp(obj.brightness, 0.3, 2, 1),
      contrast: clamp(obj.contrast, 0.5, 2, 1),
      saturation: clamp(obj.saturation, 0, 2, 1),
      hue: clamp(obj.hue, -180, 180, 0),
      rotate,
    };
  } catch {
    return DEFAULT_DEVELOP;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const file = form.get("file");
  const decision = String(form.get("decision") ?? "create") as Decision;
  const finalNameOverride = form.get("finalName");
  const developParams = parseDevelopParams(form.get("developParams"));

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "file required" }), {
      status: 400,
    });
  }

  const { stem, ext } = sanitizeName(file.name);
  let outName =
    typeof finalNameOverride === "string" && finalNameOverride
      ? path.basename(String(finalNameOverride))
      : targetFilename(stem);

  const collides = nameExists(outName);
  if (collides && decision === "create") {
    return Response.json(
      {
        error: "name_conflict",
        finalName: outName,
        suggested: suggestRename(outName),
      },
      { status: 409 },
    );
  }
  if (decision === "rename" && collides) {
    outName = suggestRename(outName);
  }

  // Persist upload to tmp
  const tmpFile = path.join(
    paths.tmpDir,
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${ext || ".bin"}`,
  );
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tmpFile, buf);

  try {
    // 0. EXIF — best-effort. If the file has none, we get all-nulls.
    const exif = await extractExif(buf).catch(() => ({ ...EMPTY_EXIF }));

    // 1. Extract the base JPEG (camera preview for RAW; original bytes otherwise)
    const base = await extractBaseJpeg(tmpFile, ext);

    // 2. Apply develop + final compress
    const processed = await applyDevelop(base.buffer, developParams);

    // 3. Persist:
    //    - data/photos/{name}     final image used for display
    //    - data/thumbs/{name}     480px webp thumb
    //    - data/bases/{name}      base JPEG (only for RAW, enables re-develop)
    await fs.writeFile(photoPath(outName), processed.buffer);
    await fs.writeFile(thumbPath(outName), processed.thumbBuffer);
    const keepBase = isRaw(ext);
    if (keepBase) {
      await fs.writeFile(basePath(outName), base.buffer);
    }

    const now = Date.now();
    const meta = {
      name: outName,
      mime: processed.mime,
      width: processed.width,
      height: processed.height,
      size_bytes: processed.size,
      uploaded_at: now,
      developed_at: now,
      develop_params: isDefaultDevelop(developParams)
        ? null
        : JSON.stringify(developParams),
      has_base: keepBase ? 1 : 0,
      original_ext: ext.toLowerCase() || null,
      camera: exif.camera,
      lens: exif.lens,
      fstop: exif.fstop,
      shutter: exif.shutter,
      iso: exif.iso,
      focal: exif.focal,
      taken_at: exif.taken_at,
      gps_lat: exif.gps_lat,
      gps_lng: exif.gps_lng,
    };
    if (collides && decision === "replace") {
      photoQueries.upsertReplace(meta);
    } else {
      photoQueries.insert(meta);
    }
    const saved = photoQueries.byName(outName);
    return Response.json({ ok: true, photo: saved });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "processing_failed", detail }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  } finally {
    fs.unlink(tmpFile).catch(() => {});
  }
};

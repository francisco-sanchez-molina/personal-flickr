import crypto from "node:crypto";
import fsSync from "node:fs";
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
import { isVideoExt, isVideoMime, probeAndPoster, transcodeVideo } from "~/lib/video";
import { enqueueVideoJob } from "~/lib/video-queue";

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
      warmth: clamp(obj.warmth, 0, 1, 0),
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
  // When the user has been shown the duplicate-content prompt and chose
  // "Subir igualmente", the client resends with this flag — we skip the
  // hash check in that case.
  const acknowledgeDuplicate =
    String(form.get("acknowledgeDuplicate") ?? "") === "true";

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "file required" }), {
      status: 400,
    });
  }

  const { stem, ext } = sanitizeName(file.name);
  const isVideo = isVideoExt(ext) || isVideoMime(file.type);
  let outName =
    typeof finalNameOverride === "string" && finalNameOverride
      ? path.basename(String(finalNameOverride))
      : targetFilename(stem, isVideo ? "video" : "photo");

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

  // Content-hash dedup. SHA-256 of the bytes the user actually sent — not
  // the processed JPEG, so re-uploading the same RAW twice matches even
  // after develop. Skipped on `replace` (the user explicitly wants to
  // overwrite that name) and when the user has acknowledged the dup.
  const contentHash = crypto.createHash("sha256").update(buf).digest("hex");
  if (decision === "create" && !acknowledgeDuplicate) {
    const existing = photoQueries.byHash(contentHash);
    if (existing) {
      await fs.unlink(tmpFile).catch(() => {});
      return Response.json(
        {
          error: "duplicate_content",
          duplicateOf: existing.name,
        },
        { status: 409 },
      );
    }
  }

  // The photo branch always deletes tmpFile in `finally`. The video branch
  // moves the tmp file into a pending- location for the background job, so
  // it sets this flag to skip the delete.
  let tmpFileConsumed = false;
  try {
    const now = Date.now();

    if (isVideo) {
      // Fast path: probe + extract a single poster frame (~500 ms-1 s) so we
      // can return immediately with a usable DB row + thumb. The actual H.264
      // transcode is enqueued and runs in the background (see video-queue).
      const { meta: vmeta, thumbBuffer, targetW, targetH } =
        await probeAndPoster(tmpFile);

      await fs.writeFile(thumbPath(outName), thumbBuffer);

      // Keep the original around for the background job. We use a stable
      // location under tmp/ keyed by name; the job removes it when done.
      const pendingPath = path.join(
        paths.tmpDir,
        `pending-${Date.now()}-${Math.random().toString(36).slice(2)}${ext || ".bin"}`,
      );
      await fs.rename(tmpFile, pendingPath).catch(async () => {
        await fs.copyFile(tmpFile, pendingPath);
      });

      const meta = {
        name: outName,
        mime: "video/mp4",
        width: vmeta.width,
        height: vmeta.height,
        // Placeholder: will be overwritten with the encoded byte count when
        // the background job finishes. Showing the original size while
        // processing would be misleading, so we store 0 and let the UI
        // render "—" until ready.
        size_bytes: 0,
        uploaded_at: now,
        developed_at: now,
        develop_params: null,
        has_base: 0,
        original_ext: ext.toLowerCase() || null,
        camera: null,
        lens: null,
        fstop: null,
        shutter: null,
        iso: null,
        focal: null,
        taken_at: null,
        gps_lat: null,
        gps_lng: null,
        kind: "video" as const,
        duration_ms: vmeta.durationMs,
        processing_status: "processing" as const,
        content_hash: contentHash,
      };
      if (collides && decision === "replace") {
        photoQueries.upsertReplace(meta);
      } else {
        photoQueries.insert(meta);
      }
      const saved = photoQueries.byName(outName);

      // Schedule the background transcode. We close over `saved.id` so the
      // worker can update the right row when it finishes. `tmpFile` is now
      // the pending location (we renamed it); skip the finally-unlink.
      const photoId = saved!.id;
      const finalPath = photoPath(outName);
      enqueueVideoJob(async () => {
        const tmpOut = path.join(
          paths.tmpDir,
          `enc-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
        );
        try {
          const { sizeBytes } = await transcodeVideo(
            pendingPath,
            tmpOut,
            targetW,
            targetH,
          );
          try {
            await fs.rename(tmpOut, finalPath);
          } catch {
            await fs.copyFile(tmpOut, finalPath);
            await fs.unlink(tmpOut).catch(() => {});
          }
          photoQueries.updateProcessed(photoId, sizeBytes, Date.now(), "ready");
        } catch (err) {
          console.error(`[video] transcode failed for #${photoId}:`, err);
          photoQueries.updateProcessed(photoId, 0, Date.now(), "failed");
          fsSync.rmSync(tmpOut, { force: true });
        } finally {
          fsSync.rmSync(pendingPath, { force: true });
        }
      });

      // Tell the finally block we already moved the tmp file out.
      tmpFileConsumed = true;
      return Response.json({ ok: true, photo: saved });
    }

    // 0. EXIF — best-effort. If the file has none, we get all-nulls.
    const exif = await extractExif(buf).catch(() => ({ ...EMPTY_EXIF }));
    // Fallback: if the file carries no EXIF date but the browser exposed a
    // lastModified (cameras + iOS Photos preserve the capture time as the
    // file's mtime), use that instead of leaving the column null. Better
    // than "missing" — and a single-photo wrong fallback is recoverable.
    const takenAt =
      exif.taken_at ?? (file.lastModified > 0 ? file.lastModified : null);

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
      taken_at: takenAt,
      gps_lat: exif.gps_lat,
      gps_lng: exif.gps_lng,
      // Video support: this endpoint only handles still photos today.
      kind: "photo" as const,
      duration_ms: null,
      // Photos are processed inline (sharp is fast enough), so they're
      // already "ready" by the time we insert the row.
      processing_status: "ready" as const,
      content_hash: contentHash,
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
    if (!tmpFileConsumed) {
      fs.unlink(tmpFile).catch(() => {});
    }
  }
};

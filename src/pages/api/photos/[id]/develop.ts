import fs from "node:fs/promises";
import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import { applyDevelop, isDefaultDevelop } from "~/lib/processor";
import { basePath, photoPath, thumbPath } from "~/lib/storage";
import { DevelopBody, parseJson } from "~/lib/validation";

export const config = { runtime: "nodejs" } as const;

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "bad_id" }, { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!photo.has_base) {
    return Response.json(
      {
        error: "no_base",
        detail:
          "Esta foto no tiene base preservada (no era RAW al subir). Para re-revelar hay que re-subir.",
      },
      { status: 409 },
    );
  }

  const parsed = await parseJson(request, DevelopBody);
  if (!parsed.ok) return parsed.response;
  // Zod schema fills in defaults when params is missing, so we always get a
  // fully-shaped DevelopParams here.
  const develop = parsed.data.params ?? {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    warmth: 0,
    rotate: 0 as const,
  };

  let baseBuf: Buffer;
  try {
    baseBuf = await fs.readFile(basePath(photo.name));
  } catch {
    return new Response(
      JSON.stringify({ error: "base_missing", detail: "Falta el archivo base en disco" }),
      { status: 500 },
    );
  }

  try {
    const processed = await applyDevelop(baseBuf, develop);
    await fs.writeFile(photoPath(photo.name), processed.buffer);
    await fs.writeFile(thumbPath(photo.name), processed.thumbBuffer);

    const developedAt = Date.now();
    photoQueries.updateDevelop(
      id,
      processed.width,
      processed.height,
      processed.size,
      developedAt,
      isDefaultDevelop(develop) ? null : JSON.stringify(develop),
    );
    const updated = photoQueries.byId(id);
    return Response.json({ ok: true, photo: updated });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "processing_failed", detail },
      { status: 500 },
    );
  }
};

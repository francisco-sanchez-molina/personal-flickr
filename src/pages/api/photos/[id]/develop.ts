import fs from "node:fs/promises";
import type { APIRoute } from "astro";
import { photoQueries } from "~/lib/db";
import {
  DEFAULT_DEVELOP,
  applyDevelop,
  isDefaultDevelop,
  type DevelopParams,
} from "~/lib/processor";
import { basePath, photoPath, thumbPath } from "~/lib/storage";

export const config = { runtime: "nodejs" } as const;

function parseParams(input: unknown): DevelopParams {
  if (!input || typeof input !== "object") return DEFAULT_DEVELOP;
  const obj = input as Partial<DevelopParams>;
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
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "bad id" }), { status: 400 });
  }
  const photo = photoQueries.byId(id);
  if (!photo) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  if (!photo.has_base) {
    return new Response(
      JSON.stringify({
        error: "no_base",
        detail:
          "Esta foto no tiene base preservada (no era RAW al subir). Para re-revelar hay que re-subir.",
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { params?: unknown }
    | null;
  const develop = parseParams(body?.params);

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

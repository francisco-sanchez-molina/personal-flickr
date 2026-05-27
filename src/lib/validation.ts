/**
 * Zod schemas + helpers for API request validation.
 *
 * Every API endpoint that accepts a JSON body should parse it through one
 * of these schemas via `parseJson(request, Schema)` — that yields a
 * `Result<T>` with either `{ ok: true, data }` or `{ ok: false, response }`
 * where `response` is a pre-baked 400 with a `{ error, detail }` payload.
 *
 * Why not a thin wrapper / middleware?
 * Astro endpoints are vanilla functions returning `Response`. A middleware
 * layer would force every endpoint into a particular shape; the helper
 * approach keeps endpoints flat while still centralizing parsing rules.
 */
import { z } from "zod";

// ───────────────── shared primitives ─────────────────

/** Path-param IDs that come in as strings — accept positive integer-ish. */
export const idParam = z.coerce.number().int().positive();

const trimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(max));

// ───────────────── photo: favorite ─────────────────

export const FavoriteBody = z.object({
  value: z.boolean(),
});

// ───────────────── photo: develop ─────────────────

/**
 * Mirrors `DevelopParams` from lib/processor.ts. We keep this here (not as
 * z.infer<>) because the endpoint should accept *missing* fields and back-
 * fill them with defaults; defining the schema here makes that explicit.
 */
export const DevelopParamsSchema = z
  .object({
    brightness: z.number().min(0.3).max(2).default(1),
    contrast: z.number().min(0.5).max(2).default(1),
    saturation: z.number().min(0).max(2).default(1),
    hue: z.number().min(-180).max(180).default(0),
    rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  })
  .partial()
  .transform((v) => ({
    brightness: v.brightness ?? 1,
    contrast: v.contrast ?? 1,
    saturation: v.saturation ?? 1,
    hue: v.hue ?? 0,
    rotate: (v.rotate ?? 0) as 0 | 90 | 180 | 270,
  }));

export const DevelopBody = z.object({
  params: DevelopParamsSchema.optional(),
});

// ───────────────── gallery: create / update ─────────────────

export const GalleryCreateBody = z.object({
  name: trimmed(80),
  description: z
    .string()
    .transform((s) => s.trim().slice(0, 500))
    .pipe(z.string().min(1))
    .optional()
    .nullable(),
});

export const GalleryUpdateBody = z
  .object({
    name: trimmed(80).optional(),
    description: z
      .string()
      .transform((s) => s.trim().slice(0, 500))
      .nullable()
      .optional(),
  })
  // At least one field present.
  .refine((o) => o.name !== undefined || o.description !== undefined, {
    message: "Nothing to update",
  });

// ───────────────── gallery: add photo ─────────────────

export const AddPhotoBody = z.object({
  photoId: idParam,
});

// ───────────────── tag: create / attach ─────────────────

export const TagCreateBody = z.object({
  name: trimmed(40),
});

export const AttachTagBody = z.object({
  tagId: idParam,
});

// ───────────────── runtime helper ─────────────────

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Parse a request body as JSON against `schema`. On failure returns a
 * pre-baked 400 response containing `{ error: "invalid_body", detail: <
 * zod issues> }`. Designed so endpoints can do:
 *
 *   const parsed = await parseJson(request, FavoriteBody);
 *   if (!parsed.ok) return parsed.response;
 *   const { value } = parsed.data;
 */
export async function parseJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<Result<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: "invalid_json", detail: "body must be JSON" },
        { status: 400 },
      ),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_body",
          detail: result.error.issues
            .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}

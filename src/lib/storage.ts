import fs from "node:fs";
import path from "node:path";
import { paths } from "./config";
import { photoQueries } from "./db";

/**
 * Slugify an arbitrary string for use in URLs.
 * Lowercase, accents stripped, non-alphanum → `-`, collapsed, trimmed.
 * Always returns at least "g" so we never emit an empty slug.
 */
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "g";
}

/**
 * Append a numeric suffix until the slug is free.
 * `exists(slug)` is called repeatedly with candidates.
 */
export function uniqueSlug(
  base: string,
  exists: (candidate: string) => boolean,
): string {
  if (!exists(base)) return base;
  let i = 2;
  while (i < 10_000) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
    i++;
  }
  return `${base}-${Date.now()}`;
}

/** Strip path, collapse weird chars, force a single extension. Keeps stem; normalizes ext. */
export function sanitizeName(rawName: string): { stem: string; ext: string } {
  const base = path.basename(rawName);
  const ext = path.extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - ext.length)
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return { stem: stem || "foto", ext };
}

/**
 * The on-disk filename (always JPEG after processing).
 * We use a normalized stem + ".jpg". The DB `name` column stores this filename.
 */
export function targetFilename(stem: string): string {
  return `${stem}.jpg`;
}

/** True if a photo with this final filename already exists. */
export function nameExists(filename: string): boolean {
  return photoQueries.byName(filename) !== null;
}

/** Suggest a non-colliding variant: foo.jpg → foo-2.jpg → foo-3.jpg … */
export function suggestRename(filename: string): string {
  const ext = path.extname(filename);
  const stem = filename.slice(0, -ext.length);
  // strip a trailing -N if present so we don't get foo-2-2
  const baseStem = stem.replace(/-(\d+)$/, "");
  let i = 2;
  while (i < 10_000) {
    const candidate = `${baseStem}-${i}${ext}`;
    if (!nameExists(candidate)) return candidate;
    i++;
  }
  // very unlikely escape hatch
  return `${baseStem}-${Date.now()}${ext}`;
}

export function photoPath(filename: string): string {
  return path.join(paths.photosDir, filename);
}

export function thumbPath(filename: string): string {
  return path.join(paths.thumbsDir, filename);
}

/**
 * Path where the "base JPEG" lives for a photo that supports non-destructive
 * re-develop (RAW uploads only). The base is the unmodified extracted preview;
 * develop params are applied on top of it.
 */
export function basePath(filename: string): string {
  return path.join(paths.basesDir, filename);
}

export function safeUnlink(p: string) {
  try {
    fs.unlinkSync(p);
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
}

/** Guard against path traversal in file names served from disk. */
export function assertInsideDir(filename: string, dir: string) {
  const resolved = path.resolve(dir, filename);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("invalid path");
  }
  return resolved;
}

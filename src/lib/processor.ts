import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { config, paths } from "./config";

const RAW_EXTS = new Set([
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".raf",
  ".dng",
  ".orf",
  ".rw2",
]);

export function isRaw(ext: string): boolean {
  return RAW_EXTS.has(ext.toLowerCase());
}

/** Develop / "revelado" parameters applied on top of the base JPEG. */
export interface DevelopParams {
  /** linear gain on RGB. 1 = no change, 0.5 = darker, 1.5 = brighter. CSS: brightness() */
  brightness: number;
  /** contrast around mid-gray. 1 = no change. CSS: contrast() */
  contrast: number;
  /** saturation. 1 = no change, 0 = grayscale. CSS: saturate() */
  saturation: number;
  /** hue rotation in degrees. CSS: hue-rotate() */
  hue: number;
  /** warm/vintage tone. 0 = neutral, 1 = full sepia. CSS: sepia() */
  warmth: number;
  /** rotation in degrees, in 90° steps. */
  rotate: 0 | 90 | 180 | 270;
}

export const DEFAULT_DEVELOP: DevelopParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  warmth: 0,
  rotate: 0,
};

export function isDefaultDevelop(p: DevelopParams): boolean {
  return (
    p.brightness === 1 &&
    p.contrast === 1 &&
    p.saturation === 1 &&
    p.hue === 0 &&
    p.warmth === 0 &&
    p.rotate === 0
  );
}

/**
 * The 3×3 colour matrix CSS `sepia(amount)` applies, interpolated between
 * identity (amount 0) and the canonical sepia matrix (amount 1). We feed
 * the *same* matrix to sharp's `.recomb()` so the live CSS preview and the
 * saved file are pixel-identical — the whole point of the develop panel.
 *
 * Canonical matrix per the Filter Effects spec:
 *   https://www.w3.org/TR/filter-effects-1/#sepiaEquivalent
 */
function sepiaMatrix(
  amount: number,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const a = Math.max(0, Math.min(1, amount));
  const S = [
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
  ];
  const lerp = (i: number, j: number) => (i === j ? 1 : 0) * (1 - a) + S[i][j] * a;
  return [
    [lerp(0, 0), lerp(0, 1), lerp(0, 2)],
    [lerp(1, 0), lerp(1, 1), lerp(1, 2)],
    [lerp(2, 0), lerp(2, 1), lerp(2, 2)],
  ];
}

/** Run a command and resolve when it exits 0, reject otherwise. */
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

/** Run a command and return stdout as a Buffer. */
function runStdout(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Extract a usable JPEG (the camera's embedded preview) from a RAW file.
 *
 * - macOS: uses `sips` (built-in, knows CR2/CR3/NEF/ARW/DNG via Core Image).
 * - Linux: uses `exiftool` to extract `-PreviewImage` (fall back to `-JpgFromRaw` for CR3).
 */
async function extractRawPreview(inputPath: string): Promise<Buffer> {
  const platform = os.platform();
  if (platform === "darwin") {
    const tmpOut = path.join(
      paths.tmpDir,
      `sips-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    );
    try {
      await run("sips", [
        "-s", "format", "jpeg",
        "-s", "formatOptions", "best",
        inputPath,
        "--out", tmpOut,
      ]);
      const buf = fs.readFileSync(tmpOut);
      return buf;
    } finally {
      try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
    }
  }

  // Linux (and anywhere else): use exiftool
  // CR2/NEF/ARW/DNG/RAF/ORF expose -PreviewImage. CR3 only exposes -JpgFromRaw.
  // Try the bigger preview first, fall back to the other.
  for (const tag of ["-PreviewImage", "-JpgFromRaw", "-OtherImage", "-ThumbnailImage"]) {
    try {
      const buf = await runStdout("exiftool", ["-b", tag, inputPath]);
      if (buf.length > 10_000) {
        // Sanity: anything under 10KB is almost certainly the tiny embedded thumb,
        // which would look terrible after resize. Skip and try the next tag.
        return buf;
      }
    } catch {
      /* try next tag */
    }
  }
  throw new Error(
    "RAW preview extraction failed (no PreviewImage/JpgFromRaw/OtherImage/ThumbnailImage)",
  );
}

export interface ExtractedBase {
  /** A JPEG buffer ready to be processed by `sharp`. */
  buffer: Buffer;
}

/**
 * Get a base JPEG for any uploaded file.
 *
 * - For RAW files: extracts the camera's embedded preview (~3000×2000 typically).
 * - For JPEG/PNG/HEIC/etc: reads the file as-is.
 *
 * The base is the "source of truth" for re-developing. It is NEVER mutated.
 */
export async function extractBaseJpeg(
  inputPath: string,
  originalExt: string,
): Promise<ExtractedBase> {
  if (isRaw(originalExt)) {
    return { buffer: await extractRawPreview(inputPath) };
  }
  return { buffer: fs.readFileSync(inputPath) };
}

export interface DevelopedImage {
  buffer: Buffer;
  thumbBuffer: Buffer;
  width: number;
  height: number;
  size: number;
  mime: "image/jpeg";
}

/**
 * Apply develop params + final resize/compress to a base JPEG.
 *
 * Pipeline:
 *   base → rotate(EXIF) → applyRotate90 → linear(brightness,0) → linear(contrast,offset)
 *        → modulate(saturation, hue) → resize fit-inside MAX
 *        → mozjpeg quality iterating until <= TARGET_SIZE_MB
 *
 * Produces both the full image and a 480px webp thumbnail.
 */
export async function applyDevelop(
  baseBuffer: Buffer,
  params: DevelopParams = DEFAULT_DEVELOP,
): Promise<DevelopedImage> {
  const targetBytes = config.targetSizeMB * 1024 * 1024;
  const maxDim = config.maxDimension;

  const build = (input: Buffer) => {
    let s = sharp(input, { failOn: "none" }).rotate(); // honor EXIF orientation
    if (params.rotate) s = s.rotate(params.rotate);

    if (params.brightness !== 1) {
      // CSS brightness: multiply each RGB channel
      s = s.linear(params.brightness, 0);
    }
    if (params.contrast !== 1) {
      // CSS contrast(c): pixel = (p - 128) * c + 128  →  linear(c, 128*(1-c))
      const c = params.contrast;
      s = s.linear(c, 128 * (1 - c));
    }
    if (params.saturation !== 1 || params.hue !== 0) {
      s = s.modulate({
        saturation: params.saturation,
        hue: params.hue,
      });
    }
    if (params.warmth && params.warmth !== 0) {
      // Same matrix CSS `sepia()` uses → preview matches the saved file.
      s = s.recomb(sepiaMatrix(params.warmth));
    }
    return s;
  };

  // Final image
  let buffer: Buffer | null = null;
  let info: sharp.OutputInfo | null = null;
  for (const quality of [85, 80, 75, 70, 65, 60]) {
    const out = await build(baseBuffer)
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer({ resolveWithObject: true });
    buffer = out.data;
    info = out.info;
    if (out.data.length <= targetBytes) break;
  }
  if (!buffer || !info) throw new Error("processing produced no output");

  // Thumbnail (uses same develop so the grid matches the lightbox)
  const thumb = await build(baseBuffer)
    .resize({ width: 480, height: 480, fit: "inside" })
    .webp({ quality: 75 })
    .toBuffer();

  return {
    buffer,
    thumbBuffer: thumb,
    width: info.width,
    height: info.height,
    size: buffer.length,
    mime: "image/jpeg",
  };
}

/**
 * Video pipeline: probe → transcode to H.264/AAC MP4 → poster-frame thumb.
 *
 * Target: "HD better than WhatsApp" — capped at 720p (longest side 1280px by
 * default), libx264 CRF 23, AAC 128k, faststart. Typical phone clips end up
 * ~50-70 % smaller than the original with visibly better quality than the
 * heavily downscaled output WhatsApp ships (~480p @ ~700 kbps).
 *
 * Requires ffmpeg + ffprobe in PATH (apt-installed in the Docker image,
 * `brew install ffmpeg` locally on macOS).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";
import { config } from "./config";

const VIDEO_EXTS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".3gp",
  ".hevc",
]);

export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase());
}

export function isVideoMime(mime: string | undefined | null): boolean {
  return !!mime && mime.toLowerCase().startsWith("video/");
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

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
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

interface ProbeResult {
  width: number;
  height: number;
  durationMs: number;
  rotation: number;
}

async function probe(inputPath: string): Promise<ProbeResult> {
  const out = await runStdout("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    inputPath,
  ]);
  const parsed = JSON.parse(out.toString("utf8")) as {
    streams: Array<{
      codec_type: string;
      width?: number;
      height?: number;
      duration?: string;
      side_data_list?: Array<{ rotation?: number }>;
      tags?: { rotate?: string };
    }>;
    format: { duration?: string };
  };
  const v = parsed.streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) {
    throw new Error("no video stream in input");
  }
  const durSec =
    Number(v.duration) ||
    Number(parsed.format.duration) ||
    0;
  let rotation = 0;
  if (v.tags?.rotate) rotation = Number(v.tags.rotate) || 0;
  for (const sd of v.side_data_list ?? []) {
    if (typeof sd.rotation === "number") rotation = sd.rotation;
  }
  // ffmpeg auto-applies display rotation when re-encoding, so the output
  // dimensions are the post-rotation ones. Swap for the metadata we store.
  const swap = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
  return {
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    durationMs: Math.round(durSec * 1000),
    rotation,
  };
}

/** Compute target dims that cap the longest side at `maxDim`, even multiples (libx264 needs even). */
function fitDims(w: number, h: number, maxDim: number): { tw: number; th: number } {
  if (w <= maxDim && h <= maxDim) {
    return { tw: w - (w % 2), th: h - (h % 2) };
  }
  const ratio = w >= h ? maxDim / w : maxDim / h;
  const tw = Math.max(2, Math.round(w * ratio));
  const th = Math.max(2, Math.round(h * ratio));
  return { tw: tw - (tw % 2), th: th - (th % 2) };
}

export interface VideoMeta {
  /** Output (post-rotation) width — what we'll display. */
  width: number;
  /** Output (post-rotation) height. */
  height: number;
  durationMs: number;
}

/** Fast probe + poster-frame extraction (~500 ms-1 s). Run sync at upload time. */
export async function probeAndPoster(
  inputPath: string,
): Promise<{ meta: VideoMeta; thumbBuffer: Buffer; targetW: number; targetH: number }> {
  const probed = await probe(inputPath);
  const { tw, th } = fitDims(probed.width, probed.height, config.videoMaxDim);

  // One frame at ~1 s (or earlier for very short clips). `-ss` BEFORE `-i` is
  // a "seek-fast" — much cheaper than seek-decode for poster grabs.
  const posterT = Math.min(1, Math.max(0, probed.durationMs / 1000 / 4));
  const rawPoster = await runStdout("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(posterT),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", `scale=${tw}:${th}:flags=lanczos`,
    "-f", "image2",
    "-vcodec", "mjpeg",
    "-q:v", "3",
    "pipe:1",
  ]);
  const thumbBuffer = await sharp(rawPoster, { failOn: "none" })
    .resize({ width: 480, height: 480, fit: "inside" })
    .webp({ quality: 75 })
    .toBuffer();

  return {
    meta: { width: tw, height: th, durationMs: probed.durationMs },
    thumbBuffer,
    targetW: tw,
    targetH: th,
  };
}

/**
 * Transcode to 720p H.264/AAC MP4. Slow — call from the background queue,
 * not from a request handler.
 *
 * `-movflags +faststart` puts the moov atom at the front so the browser can
 * start playing before the whole file downloads. `yuv420p` ensures broad
 * browser compatibility (some HEVC inputs are yuv420p10le which Safari
 * accepts but many browsers won't decode in MP4).
 */
export async function transcodeVideo(
  inputPath: string,
  outPath: string,
  targetW: number,
  targetH: number,
): Promise<{ sizeBytes: number }> {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", inputPath,
    "-map_metadata", "-1",
    "-vf", `scale=${targetW}:${targetH}:flags=lanczos`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(config.videoCRF),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", `${config.videoAudioKbps}k`,
    "-ac", "2",
    "-movflags", "+faststart",
    outPath,
  ]);
  const stat = fs.statSync(outPath);
  return { sizeBytes: stat.size };
}

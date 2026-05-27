/**
 * EXIF extraction from any uploaded image (JPEG/PNG/HEIC/RAW). Best-effort:
 * if the file has no EXIF or it can't be parsed, every field is null and the
 * upload succeeds anyway.
 */
import exifr from "exifr";

export interface ExifData {
  /** Brand + model, e.g. "Canon EOS R5". Null if unknown. */
  camera: string | null;
  /** Lens model, e.g. "RF 24-70mm F2.8 L IS USM". */
  lens: string | null;
  /** f-number as a real number (e.g. 2.8). */
  fstop: number | null;
  /** Shutter speed printed like "1/250" or "2.5" for long exposures. */
  shutter: string | null;
  /** Sensor ISO. */
  iso: number | null;
  /** Focal length in mm (effective at the sensor, not 35mm equivalent). */
  focal: number | null;
  /** Unix-ms timestamp from DateTimeOriginal (when the photo was taken). */
  taken_at: number | null;
  /** GPS latitude in decimal degrees. Null if no geotag. */
  gps_lat: number | null;
  /** GPS longitude. */
  gps_lng: number | null;
}

export const EMPTY_EXIF: ExifData = {
  camera: null,
  lens: null,
  fstop: null,
  shutter: null,
  iso: null,
  focal: null,
  taken_at: null,
  gps_lat: null,
  gps_lng: null,
};

function formatShutter(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds >= 1) return `${seconds.toFixed(1)}`;
  // pick a clean reciprocal denominator (1/x)
  const denom = Math.round(1 / seconds);
  return `1/${denom}`;
}

function makeAndModel(make: unknown, model: unknown): string | null {
  const m = typeof make === "string" ? make.trim() : "";
  const mod = typeof model === "string" ? model.trim() : "";
  if (!m && !mod) return null;
  if (!m) return mod;
  if (!mod) return m;
  // Avoid "Canon Canon EOS R5"
  return mod.toLowerCase().startsWith(m.toLowerCase()) ? mod : `${m} ${mod}`;
}

function n(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
function s(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/**
 * Parse EXIF from a buffer. We ask exifr for everything it can give us in
 * a single pass, then collapse it to our smaller shape. The whole thing
 * stays under ~50ms even for a 30MB CR2 because exifr only scans the
 * EXIF segment, not the pixels.
 */
export async function extractExif(buffer: Buffer): Promise<ExifData> {
  let raw: Record<string, unknown> | undefined;
  try {
    raw = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: false,
      xmp: false,
      icc: false,
      jfif: false,
      ihdr: false,
      mergeOutput: true,
      reviveValues: true,
    })) as Record<string, unknown> | undefined;
  } catch {
    return { ...EMPTY_EXIF };
  }
  if (!raw) return { ...EMPTY_EXIF };

  const camera = makeAndModel(raw.Make, raw.Model);
  const lens = s(raw.LensModel) ?? s(raw.Lens) ?? s(raw.LensInfo);

  const fstop = n(raw.FNumber) ?? n(raw.ApertureValue);
  const shutter =
    formatShutter(n(raw.ExposureTime)) ??
    formatShutter(n(raw.ShutterSpeedValue));
  const isoRaw = raw.ISO ?? raw.ISOSpeedRatings ?? raw.PhotographicSensitivity;
  const iso = Array.isArray(isoRaw) ? n(isoRaw[0]) : n(isoRaw);
  const focal = n(raw.FocalLength);

  let taken_at: number | null = null;
  const dto = raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate;
  if (dto instanceof Date) taken_at = dto.getTime();
  else if (typeof dto === "string") {
    const t = Date.parse(dto);
    if (!Number.isNaN(t)) taken_at = t;
  } else if (typeof dto === "number" && Number.isFinite(dto)) {
    taken_at = dto;
  }

  // exifr's `gps: true` returns latitude/longitude as decimal degrees
  const gps_lat = n(raw.latitude);
  const gps_lng = n(raw.longitude);

  return {
    camera,
    lens,
    fstop,
    shutter,
    iso,
    focal,
    taken_at,
    gps_lat,
    gps_lng,
  };
}

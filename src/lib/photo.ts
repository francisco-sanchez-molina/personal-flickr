/**
 * Shared photo helpers — URL builders + display formatters used by both the
 * grid and the lightbox.  Lives in lib/ (not components/) because it has no
 * React surface; just pure functions over the `Photo` row.
 */
import type { Photo } from "./db";

/**
 * URL for the *developed* photo — the JPEG used for thumbnails and lightbox
 * preview.  `?v=developed_at` busts the browser cache whenever the user
 * re-develops the photo.
 */
export function photoUrl(p: Pick<Photo, "name" | "developed_at">): string {
  return `/files/photo/${encodeURIComponent(p.name)}?v=${p.developed_at}`;
}

export function thumbUrl(p: Pick<Photo, "name" | "developed_at">): string {
  return `/files/thumb/${encodeURIComponent(p.name)}?v=${p.developed_at}`;
}

/**
 * URL for the immutable base JPEG that backs non-destructive develop.
 * Only valid when `photo.has_base === 1`.
 */
export function baseUrl(p: Pick<Photo, "name">): string {
  return `/files/base/${encodeURIComponent(p.name)}`;
}

export function fmtSize(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function isVideo(p: Pick<Photo, "kind">): boolean {
  return p.kind === "video";
}

/** `mm:ss` for short clips, `h:mm:ss` past an hour. */
export function fmtDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

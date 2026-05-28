/**
 * Warm the browser image cache for photos near the active index so swipe-
 * navigating to them feels instant. We hold the Image() objects in a local
 * array so they aren't GC'd mid-download, and clear `src` on cleanup to
 * cancel any in-flight requests when the index changes.
 */
import { useEffect } from "react";
import type { Photo } from "~/lib/db";
import { isVideo, photoUrl } from "~/lib/photo";

export function usePreloadNeighbors(
  photos: Photo[],
  index: number,
  offsets: readonly number[] = [1, -1, 2, -2],
): void {
  useEffect(() => {
    if (photos.length <= 1) return;
    const fetched: HTMLImageElement[] = [];
    for (const offset of offsets) {
      const i = (index + offset + photos.length) % photos.length;
      if (i === index) continue;
      // Don't preload video — would burn bandwidth fetching tens of MB by
      // accident. The thumb is enough; full media loads on navigation.
      if (isVideo(photos[i])) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = photoUrl(photos[i]);
      fetched.push(img);
    }
    return () => {
      fetched.forEach((img) => {
        img.src = "";
      });
    };
  }, [index, photos, offsets]);
}

/**
 * Justified-row photo grid with window-level virtualization.
 *
 * Why justified rows + virtualization:
 *   - CSS `column-count` masonry reads vertically per column (down col 1,
 *     then jump to col 2 top), which makes chronological browsing
 *     confusing.
 *   - More importantly: 5000 photos = 5000 DOM nodes even with
 *     `loading="lazy"` — the browser still hit-tests every node, and
 *     scroll lag piles up. Virtualization caps the DOM at ~visible rows.
 *
 * Algorithm:
 *   1. Pack photos greedily into rows. Each photo contributes its aspect
 *      ratio to the running sum; when sum*targetH + gaps exceeds the
 *      container width, close the row.
 *   2. Scale that row so its actual height makes the photos sum to
 *      exactly container width — that's the justified part.
 *   3. The last partial row keeps target height (we don't stretch it
 *      across the viewport — looks weird).
 *   4. `useWindowVirtualizer` renders only rows near the scroll position,
 *      with a small overscan buffer so swipes feel instant.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Photo } from "~/lib/db";
import { cn } from "~/lib/cn";
import { fmtDuration, fmtSize, isVideo, thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";

/** Visual gap between tiles, in pixels. Matches `.masonry` for continuity. */
const GAP = 8;
/**
 * Target row height per breakpoint. Smaller on phones to keep tile detail
 * useful when the row width shrinks; bigger on desktop where there's room.
 */
function pickTargetRowHeight(width: number): number {
  if (width < 560) return 180;
  if (width < 1100) return 230;
  return 280;
}

interface PackedRow {
  /** Photos in this row, left-to-right. */
  photos: Photo[];
  /** Final pixel width of each photo (after justify). Same length as photos. */
  widths: number[];
  /** Final pixel height of every photo in the row. */
  height: number;
}

/**
 * Greedy bin-packing into justified rows. Pure function — given the same
 * inputs, returns the same packing, so we can wrap it in `useMemo` without
 * surprises.
 */
function packIntoRows(
  photos: Photo[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
): PackedRow[] {
  const rows: PackedRow[] = [];
  let current: Photo[] = [];
  let aspectSum = 0;

  // Sanity: if width/height are 0 or weird, pretend it's 1:1 — better
  // than dividing by zero or producing NaN coordinates downstream.
  const aspectOf = (p: Photo) => {
    if (!p.width || !p.height) return 1;
    return p.width / p.height;
  };

  for (const p of photos) {
    const ar = aspectOf(p);
    current.push(p);
    aspectSum += ar;
    // Width the row would have at the target height — keep adding until
    // we overflow, then justify-fit.
    const naiveWidth = aspectSum * targetHeight + (current.length - 1) * gap;
    if (naiveWidth >= containerWidth) {
      const h = (containerWidth - (current.length - 1) * gap) / aspectSum;
      const widths = current.map((q) => aspectOf(q) * h);
      rows.push({ photos: current, widths, height: h });
      current = [];
      aspectSum = 0;
    }
  }

  // Trailing partial row. Keep it at target height *unless* its photos at
  // that height would overflow the container (e.g. a single panorama with
  // aspect 3:1 → 540px wide at 180px target → blows past a 360px phone
  // viewport). In that case clamp the height the same way a full row
  // does so the row never overflows horizontally. This is the fix for
  // the mobile regression where the last row pushed a horizontal scroll.
  if (current.length > 0) {
    const naiveWidth = aspectSum * targetHeight + (current.length - 1) * gap;
    if (naiveWidth > containerWidth) {
      const h = (containerWidth - (current.length - 1) * gap) / aspectSum;
      const widths = current.map((q) => aspectOf(q) * h);
      rows.push({ photos: current, widths, height: h });
    } else {
      const widths = current.map((q) => aspectOf(q) * targetHeight);
      rows.push({ photos: current, widths, height: targetHeight });
    }
  }

  return rows;
}

interface Props {
  photos: Photo[];
  selected: Set<number>;
  selectMode: boolean;
  onItemClick: (idx: number, e: React.MouseEvent) => void;
  onItemPointerDown: (idx: number, e: React.PointerEvent) => void;
  cancelLongPress: () => void;
  onToggleFavorite: (id: number) => void;
}

export default function PhotoGrid({
  photos,
  selected,
  selectMode,
  onItemClick,
  onItemPointerDown,
  cancelLongPress,
  onToggleFavorite,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [parentOffset, setParentOffset] = useState(0);

  // Track our own width via ResizeObserver so a window resize re-packs
  // the rows without a full remount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    setParentOffset(el.offsetTop);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Recompute the offsetTop occasionally — if galleries above change
  // height (filter toggle, lazy-loaded image, etc.), the virtualizer
  // needs the fresh offset to position items correctly.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setParentOffset(el.offsetTop);
  }, [photos.length]);

  const rows = useMemo(() => {
    if (containerWidth <= 0) return [];
    const target = pickTargetRowHeight(containerWidth);
    return packIntoRows(photos, containerWidth, target, GAP);
  }, [photos, containerWidth]);

  // Index → original photo position, for the click handlers that work in
  // terms of "the i-th photo in the source array". Computed once per
  // packing so the look-up at click time is O(1).
  const indexOfPhotoId = useMemo(() => {
    const map = new Map<number, number>();
    photos.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [photos]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => rows[i].height + GAP,
    overscan: 3,
    scrollMargin: parentOffset,
  });

  // Total content height — explicit number so the parent container
  // reserves the right space and the scrollbar matches the real extent.
  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height: totalSize }}
    >
      {virtualItems.map((vi) => {
        const row = rows[vi.index];
        if (!row) return null;
        return (
          <div
            key={vi.key}
            // Subtract scrollMargin so coords are relative to our own
            // top-left, not the document's.
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vi.start - parentOffset}px)`,
              height: row.height,
              display: "flex",
              gap: GAP,
            }}
          >
            {row.photos.map((p, j) => {
              const i = indexOfPhotoId.get(p.id) ?? 0;
              const isSelected = selected.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "tile",
                    isSelected && "selected",
                    selectMode && !isSelected && "dim",
                  )}
                  style={{ width: row.widths[j], height: row.height }}
                  onClick={(e) => onItemClick(i, e)}
                  onPointerDown={(e) => onItemPointerDown(i, e)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                >
                  <img
                    src={thumbUrl(p)}
                    alt={p.name}
                    loading="lazy"
                    draggable={false}
                    className="block h-full w-full bg-bg-3 object-cover"
                  />
                  {isVideo(p) && p.processing_status === "ready" && (
                    <>
                      <div className="play-badge" aria-hidden>
                        <Icons.Play size={22} />
                      </div>
                      <div className="duration-badge">
                        {fmtDuration(p.duration_ms)}
                      </div>
                    </>
                  )}
                  {isVideo(p) && p.processing_status === "processing" && (
                    <div className="processing-overlay" aria-live="polite">
                      <div className="spinner" />
                      <div className="processing-label">
                        Procesando vídeo…
                      </div>
                    </div>
                  )}
                  {isVideo(p) && p.processing_status === "failed" && (
                    <div className="processing-overlay failed">
                      <div className="processing-label">
                        Error al procesar
                      </div>
                    </div>
                  )}
                  {selectMode && <div className="check">✓</div>}
                  <button
                    className={cn("star", p.is_favorite && "on")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(p.id);
                    }}
                    title={
                      p.is_favorite
                        ? "Quitar de favoritas"
                        : "Marcar favorita"
                    }
                  >
                    {p.is_favorite ? (
                      <Icons.StarFill size={14} />
                    ) : (
                      <Icons.Star size={14} />
                    )}
                  </button>
                  <div className="overlay">
                    <div className="min-w-0">
                      <div className="name">{p.name}</div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      {p.width}×{p.height}
                      <div className="mt-0.5 opacity-75">
                        {p.size_bytes > 0 ? fmtSize(p.size_bytes) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

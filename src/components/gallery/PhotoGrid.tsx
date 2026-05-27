/**
 * Masonry grid of photo thumbs with selection affordances. Pure presentational:
 * receives photos + selection state + handlers from `Gallery`, decides nothing
 * on its own.  Each tile shows the photo at its native aspect ratio (via
 * inline `aspect-ratio: w/h`) with a favorite star, optional check-mark, and
 * a name/size overlay on hover.
 */
import type { Photo } from "~/lib/db";
import { cn } from "~/lib/cn";
import { fmtDuration, fmtSize, isVideo, thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";

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
  return (
    <div className="masonry" style={{ userSelect: "none" } as React.CSSProperties}>
      {photos.map((p, i) => {
        const isSelected = selected.has(p.id);
        return (
          <div
            key={p.id}
            className={cn(
              "tile",
              isSelected && "selected",
              selectMode && !isSelected && "dim",
            )}
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
              style={{
                aspectRatio: `${p.width}/${p.height}`,
                background: "var(--bg-3)",
              }}
            />
            {isVideo(p) && (
              <>
                <div className="play-badge" aria-hidden>
                  <Icons.Play size={22} />
                </div>
                <div className="duration-badge">{fmtDuration(p.duration_ms)}</div>
              </>
            )}
            {selectMode && <div className="check">✓</div>}
            <button
              className={cn("star", p.is_favorite && "on")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(p.id);
              }}
              title={p.is_favorite ? "Quitar de favoritas" : "Marcar favorita"}
            >
              {p.is_favorite ? (
                <Icons.StarFill size={14} />
              ) : (
                <Icons.Star size={14} />
              )}
            </button>
            <div className="overlay">
              <div style={{ minWidth: 0 }}>
                <div className="name">{p.name}</div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {p.width}×{p.height}
                <div style={{ opacity: 0.75, marginTop: 3 }}>
                  {fmtSize(p.size_bytes)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

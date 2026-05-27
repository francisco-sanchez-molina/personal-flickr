import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import DevelopPanel, {
  DEFAULT_DEVELOP,
  type DevelopParams,
} from "./DevelopPanel";
import GalleryPicker from "./GalleryPicker";
import BulkActionBar from "./BulkActionBar";

interface Photo {
  id: number;
  name: string;
  width: number;
  height: number;
  size_bytes: number;
  uploaded_at: number;
  developed_at: number;
  develop_params: string | null;
  has_base: number;
  original_ext: string | null;
  is_favorite: number;
}

function parseDevelopParams(json: string | null): DevelopParams {
  if (!json) return DEFAULT_DEVELOP;
  try {
    const p = JSON.parse(json) as Partial<DevelopParams>;
    return { ...DEFAULT_DEVELOP, ...p };
  } catch {
    return DEFAULT_DEVELOP;
  }
}

function photoUrl(p: Photo): string {
  return `/files/photo/${encodeURIComponent(p.name)}?v=${p.developed_at}`;
}

function thumbUrl(p: Photo): string {
  return `/files/thumb/${encodeURIComponent(p.name)}?v=${p.developed_at}`;
}

function baseUrl(p: Photo): string {
  return `/files/base/${encodeURIComponent(p.name)}`;
}

function fmtSize(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function Gallery({
  initial,
  galleryId,
  orphans,
}: {
  initial: Photo[];
  /** If set, we're viewing a specific gallery — delete removes from gallery, not from disk. */
  galleryId?: number;
  /** True on the "Sin galería" view — react to memberships-changed by removing photos that gained one. */
  orphans?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [active, setActive] = useState<number | null>(null);

  // ── Bulk selection mode ────────────────────────────────────────────
  // selected = set of photo IDs. selectMode is derived: any selection ON.
  // anchorIndex is used for shift+click range select.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchorIndexRef = useRef<number | null>(null);
  // True while we're "in" multi-select mode: clicks toggle, no lightbox.
  // We also enter this mode via long-press on mobile.
  const [forcedSelectMode, setForcedSelectMode] = useState(false);
  const selectMode = forcedSelectMode || selected.size > 0;

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setForcedSelectMode(false);
    anchorIndexRef.current = null;
  }, []);

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Click on a thumbnail. Behavior depends on selectMode + modifiers. */
  const onThumbClick = useCallback(
    (idx: number, e: React.MouseEvent) => {
      const photo = photos[idx];
      if (!photo) return;

      // Shift+click ALWAYS enters select mode and selects a range. If there
      // is no anchor yet (first interaction), the "range" is just this photo,
      // and the anchor moves to it for subsequent shift+clicks to extend.
      if (e.shiftKey) {
        // Avoid the browser's accidental text-selection on shift-click.
        window.getSelection?.()?.removeAllRanges();
        const anchor = anchorIndexRef.current ?? idx;
        const a = Math.min(anchor, idx);
        const b = Math.max(anchor, idx);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = a; i <= b; i++) next.add(photos[i].id);
          return next;
        });
        anchorIndexRef.current = idx;
        return;
      }

      // Cmd/Ctrl+click toggles single without opening
      if (e.metaKey || e.ctrlKey) {
        toggleSelected(photo.id);
        anchorIndexRef.current = idx;
        return;
      }

      // In select mode, normal click toggles.
      if (selectMode) {
        toggleSelected(photo.id);
        anchorIndexRef.current = idx;
        return;
      }

      // Default: open the lightbox. Also remember this index so a subsequent
      // shift+click can build a range starting here.
      anchorIndexRef.current = idx;
      setActive(idx);
    },
    [photos, selectMode, toggleSelected],
  );

  // Long-press on a thumb (touch) enters select mode and selects it.
  const longPressTimer = useRef<number | null>(null);
  const onThumbPointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (selectMode) return; // already in mode, regular click handles
      longPressTimer.current = window.setTimeout(() => {
        const photo = photos[idx];
        if (!photo) return;
        setForcedSelectMode(true);
        setSelected(new Set([photo.id]));
        anchorIndexRef.current = idx;
        // Haptic feedback if available
        if ("vibrate" in navigator) navigator.vibrate?.(20);
      }, 450);
    },
    [photos, selectMode],
  );
  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Esc cancels selection / Cmd-A selects all (only when not in lightbox)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (active != null) return; // lightbox owns the keyboard
      if (e.key === "Escape" && selected.size > 0) {
        e.preventDefault();
        clearSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(photos.map((p) => p.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos, selected.size, clearSelection]);

  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent<{ photo: Photo; galleryId: number | null }>)
        .detail;
      // In a gallery-filtered view, only add photos that were uploaded
      // INTO this gallery. In the main view, take every photo.
      if (galleryId != null && detail.galleryId !== galleryId) return;
      const photo = detail.photo;
      setPhotos((p) => {
        // dedupe by name (in case of replace)
        const filtered = p.filter((x) => x.name !== photo.name);
        return [photo, ...filtered];
      });
    };
    window.addEventListener("photo:added", onAdded);
    return () => window.removeEventListener("photo:added", onAdded);
  }, [galleryId]);

  // React to membership changes coming from the gallery picker
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (
        e as CustomEvent<{ photoId: number; galleryIds: number[] }>
      ).detail;
      // Sin galería view → drop any photo that now has at least one gallery
      if (orphans && d.galleryIds.length > 0) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
        return;
      }
      // Specific gallery view → drop any photo that no longer includes this gallery
      if (galleryId != null && !d.galleryIds.includes(galleryId)) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
      }
    };
    window.addEventListener("photo:memberships-changed", onChange);
    return () =>
      window.removeEventListener("photo:memberships-changed", onChange);
  }, [galleryId, orphans]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (active == null) return;
      if (e.key === "Escape") setActive(null);
      if (e.key === "ArrowRight") setActive((i) => (i! + 1) % photos.length);
      if (e.key === "ArrowLeft")
        setActive((i) => (i! - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos.length]);

  const remove = useCallback(
    async (id: number) => {
      // Inside a gallery view: "remove" means take out of THIS gallery, not delete.
      if (galleryId != null) {
        if (!confirm("¿Quitar esta foto de la galería? (no se borra del disco)"))
          return;
        const res = await fetch(
          `/api/galleries/${galleryId}/photos/${id}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setPhotos((p) => p.filter((x) => x.id !== id));
          setActive(null);
        }
        return;
      }
      // All-photos view: full delete.
      if (!confirm("¿Eliminar esta foto? Se borra el archivo del disco.")) return;
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPhotos((p) => p.filter((x) => x.id !== id));
        setActive(null);
      }
    },
    [galleryId],
  );

  const updatePhoto = useCallback(
    (id: number, patch: Partial<Photo>) => {
      setPhotos((arr) =>
        arr.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      );
    },
    [],
  );

  const toggleFavorite = useCallback(
    async (id: number) => {
      const cur = photos.find((p) => p.id === id);
      if (!cur) return;
      const next = cur.is_favorite ? 0 : 1;
      // Optimistic update
      updatePhoto(id, { is_favorite: next });
      try {
        const res = await fetch(`/api/photos/${id}/favorite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: next === 1 }),
        });
        if (!res.ok) throw new Error("favorite failed");
      } catch {
        // Revert on failure
        updatePhoto(id, { is_favorite: cur.is_favorite });
      }
    },
    [photos, updatePhoto],
  );

  if (photos.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        Aún no hay fotos. Sube alguna ↑
      </p>
    );
  }

  const bulkRemoveFromGallery = useCallback(async () => {
    if (galleryId == null) return;
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Quitar ${ids.length} foto${ids.length === 1 ? "" : "s"} de esta galería?`,
      )
    )
      return;
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/galleries/${galleryId}/photos/${id}`, { method: "DELETE" }),
      ),
    );
    setPhotos((p) => p.filter((x) => !selected.has(x.id)));
    clearSelection();
  }, [galleryId, selected, clearSelection]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Eliminar ${ids.length} foto${ids.length === 1 ? "" : "s"} del disco? Esto es irreversible.`,
      )
    )
      return;
    await Promise.all(
      ids.map((id) => fetch(`/api/photos/${id}`, { method: "DELETE" })),
    );
    setPhotos((p) => p.filter((x) => !selected.has(x.id)));
    clearSelection();
  }, [selected, clearSelection]);

  const bulkFavorite = useCallback(
    async (value: boolean) => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      // Optimistic update
      setPhotos((arr) =>
        arr.map((x) =>
          selected.has(x.id) ? { ...x, is_favorite: value ? 1 : 0 } : x,
        ),
      );
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/photos/${id}/favorite`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
          }),
        ),
      );
      clearSelection();
    },
    [selected, clearSelection],
  );

  /** True iff every currently-selected photo is already favorite. */
  const allSelectedAreFavorite = (() => {
    if (selected.size === 0) return false;
    for (const p of photos) {
      if (selected.has(p.id) && p.is_favorite !== 1) return false;
    }
    return true;
  })();

  return (
    <>
      {/* Top toolbar: select toggle + count */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <div className="text-neutral-400">
          {selectMode ? (
            <span>
              <span className="font-medium text-neutral-100">
                {selected.size}
              </span>{" "}
              seleccionada{selected.size === 1 ? "" : "s"} · click para
              alternar · shift para rango
            </span>
          ) : (
            <span className="text-neutral-600">
              click para abrir · shift+click para seleccionar
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectMode ? (
            <>
              <button
                onClick={() =>
                  setSelected(new Set(photos.map((p) => p.id)))
                }
                className="rounded-md border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Todas
              </button>
              <button
                onClick={clearSelection}
                className="rounded-md border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setForcedSelectMode(true)}
              className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Seleccionar
            </button>
          )}
        </div>
      </div>

      <ul className="grid select-none grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((p, i) => {
          const isSelected = selected.has(p.id);
          return (
            <li
              key={p.id}
              className={[
                "group relative aspect-square overflow-hidden rounded-lg bg-neutral-900 transition",
                selectMode ? "cursor-pointer" : "cursor-zoom-in",
                isSelected
                  ? "ring-2 ring-pink-500 ring-offset-2 ring-offset-neutral-950"
                  : "",
              ].join(" ")}
              onClick={(e) => onThumbClick(i, e)}
              onPointerDown={(e) => onThumbPointerDown(i, e)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
            >
              <img
                src={thumbUrl(p)}
                alt={p.name}
                loading="lazy"
                draggable={false}
                className={[
                  "h-full w-full object-cover transition",
                  selectMode && !isSelected ? "opacity-60" : "",
                  !selectMode ? "group-hover:scale-105" : "",
                ].join(" ")}
              />

              {/* Selection checkmark / indicator */}
              {selectMode && (
                <div
                  className={[
                    "pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition",
                    isSelected
                      ? "border-pink-500 bg-pink-500 text-white"
                      : "border-white/70 bg-black/30 text-transparent",
                  ].join(" ")}
                >
                  ✓
                </div>
              )}

              {/* Favorite star overlay */}
              {p.is_favorite === 1 && (
                <div
                  className="pointer-events-none absolute right-2 top-2 text-xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                  style={{ color: "#fbbf24" }}
                  aria-label="Favorito"
                  title="Favorito"
                >
                  ★
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] opacity-0 transition group-hover:opacity-100">
                <div className="truncate">{p.name}</div>
                <div className="text-neutral-400">
                  {p.width}×{p.height} · {fmtSize(p.size_bytes)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {active != null && photos[active] && (
        <Lightbox
          photo={photos[active]}
          onClose={() => setActive(null)}
          onPrev={() =>
            setActive((i) => (i! - 1 + photos.length) % photos.length)
          }
          onNext={() => setActive((i) => (i! + 1) % photos.length)}
          onDelete={() => remove(photos[active].id)}
          onToggleFavorite={() => toggleFavorite(photos[active].id)}
          onDeveloped={(developedAt, paramsJson) =>
            updatePhoto(photos[active].id, {
              developed_at: developedAt,
              develop_params: paramsJson,
            })
          }
        />
      )}

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          selectedIds={Array.from(selected)}
          allFavorite={allSelectedAreFavorite}
          galleryId={galleryId}
          onCancel={clearSelection}
          onRemoveFromGallery={bulkRemoveFromGallery}
          onDelete={bulkDelete}
          onFavorite={bulkFavorite}
          onAdded={clearSelection}
        />
      )}
    </>
  );
}

function Lightbox({
  photo,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onToggleFavorite,
  onDeveloped,
}: {
  photo: Photo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onDeveloped: (developedAt: number, developParamsJson: string | null) => void;
}) {
  const isFav = photo.is_favorite === 1;
  const [developOpen, setDevelopOpen] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // The TransformWrapper handles pinch + pan + double-tap zoom internally.
  // We track `scale` in state so we can:
  //   - disable library panning at scale=1 (lets swipe-to-navigate pass through)
  //   - skip swipe-navigation when zoomed in (so single-finger drag pans)
  const [scale, setScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Sync state with the browser's Fullscreen API. The user can also exit
  // fullscreen via the OS (Esc, the macOS green-button menu, etc.) so we
  // listen instead of trusting our own toggle.
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void containerRef.current?.requestFullscreen?.().catch((err) => {
        console.warn("requestFullscreen failed", err);
      });
    }
  }, []);

  // Keyboard: "f" toggles fullscreen while the lightbox is open.
  // Skip when any contenteditable / input is focused so users can still type.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        t?.isContentEditable
      )
        return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  // Swipe state for navigation (only active at scale === 1).
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, t: 0 });
  const axisRef = useRef<"none" | "x" | "y">("none");
  const activePointers = useRef(new Set<number>());

  // Reset zoom when navigating to a different photo
  useEffect(() => {
    transformRef.current?.resetTransform(0);
    setScale(1);
  }, [photo.id]);

  const isZoomed = scale > 1.01;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.add(e.pointerId);

    // If zoomed in, hand everything to the library (pan / pinch)
    if (isZoomed) return;

    // If more than one finger, abandon swipe so pinch can take over
    if (activePointers.current.size > 1) {
      setDragging(false);
      setDragX(0);
      return;
    }

    if (e.button !== 0 && e.pointerType === "mouse") return;
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    axisRef.current = "none";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || isZoomed || activePointers.current.size > 1) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (axisRef.current === "none") {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (axisRef.current === "x") {
      const abs = Math.abs(dx);
      const eased = abs > 200 ? 200 + (abs - 200) * 0.4 : abs;
      setDragX(Math.sign(dx) * eased);
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);

    if (!dragging) return;
    setDragging(false);
    const dx = e.clientX - startRef.current.x;
    const dt = Math.max(1, Date.now() - startRef.current.t);
    const vx = dx / dt;
    const commit =
      !isZoomed &&
      axisRef.current === "x" &&
      (Math.abs(dx) > 60 || Math.abs(vx) > 0.6);
    if (commit) {
      if (dx < 0) onNext();
      else onPrev();
    }
    setDragX(0);
  };

  const wrapperStyle: React.CSSProperties = {
    transform: `translateX(${dragX}px)`,
    transition: dragging ? "none" : "transform 180ms ease-out",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-30 flex flex-col bg-black/95"
      onClick={(e) => {
        // Only close on background click (target is this div), not on inner clicks
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate font-medium">{photo.name}</div>
          <div className="text-xs text-neutral-400">
            {photo.width}×{photo.height} · {fmtSize(photo.size_bytes)} ·{" "}
            {fmtDate(photo.uploaded_at)}
            {isZoomed && (
              <span className="ml-2 text-pink-400">· {scale.toFixed(1)}×</span>
            )}
          </div>
        </div>
        <div className="relative flex items-center gap-1">
          <button
            onClick={onToggleFavorite}
            className={[
              "rounded-md px-3 py-1 transition",
              isFav
                ? "hover:bg-amber-500/10"
                : "text-neutral-300 hover:bg-neutral-800",
            ].join(" ")}
            style={isFav ? { color: "#fbbf24" } : undefined}
            title={isFav ? "Quitar de favoritos" : "Marcar como favorito"}
            aria-pressed={isFav}
          >
            {isFav ? "★" : "☆"}
          </button>
          {photo.has_base === 1 && (
            <button
              onClick={() => setDevelopOpen(true)}
              className="rounded-md px-3 py-1 text-pink-300 hover:bg-pink-500/10"
              title="Ajustar exposición, contraste, color"
            >
              Revelar
            </button>
          )}
          <button
            onClick={() => setGalleryPickerOpen((v) => !v)}
            className="rounded-md px-3 py-1 hover:bg-neutral-800"
            title="Añadir a galerías"
          >
            Galerías
          </button>
          <a
            href={photoUrl(photo)}
            download={photo.name}
            className="rounded-md px-3 py-1 hover:bg-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            Descargar
          </a>
          <button
            onClick={onDelete}
            className="rounded-md px-3 py-1 text-red-400 hover:bg-red-500/10"
          >
            Eliminar
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-md px-3 py-1 hover:bg-neutral-800"
            title={
              isFullscreen
                ? "Salir de pantalla completa (F)"
                : "Pantalla completa (F)"
            }
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 hover:bg-neutral-800"
          >
            ✕
          </button>
          {galleryPickerOpen && (
            <GalleryPicker
              photoId={photo.id}
              onClose={() => setGalleryPickerOpen(false)}
            />
          )}
        </div>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onPointerLeave={finishDrag}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 z-10 hidden rounded-full bg-neutral-900/70 px-3 py-2 text-xl hover:bg-neutral-800 sm:block"
          aria-label="Anterior"
        >
          ‹
        </button>

        <div style={wrapperStyle}>
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={1}
            maxScale={6}
            centerOnInit
            limitToBounds
            doubleClick={{ mode: "toggle", step: 2 }}
            wheel={{ step: 0.15 }}
            pinch={{ step: 5 }}
            panning={{ disabled: !isZoomed, velocityDisabled: true }}
            onTransform={(_ref, state) => setScale(state.scale)}
          >
            <TransformComponent
              wrapperStyle={{
                width: "100%",
                height: "100%",
                cursor: isZoomed ? "grab" : "default",
              }}
              contentStyle={{ width: "100%", height: "100%" }}
            >
              <img
                src={photoUrl(photo)}
                alt={photo.name}
                draggable={false}
                className="mx-auto max-h-[88vh] max-w-[92vw] object-contain"
              />
            </TransformComponent>
          </TransformWrapper>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-2 z-10 hidden rounded-full bg-neutral-900/70 px-3 py-2 text-xl hover:bg-neutral-800 sm:block"
          aria-label="Siguiente"
        >
          ›
        </button>

        {/* Hint that disappears after first zoom */}
        {!isZoomed && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-neutral-500">
            pellizca o doble-tap para zoom · arrastra para cambiar
          </div>
        )}
      </div>

      {developOpen && (
        <DevelopPanel
          photoId={photo.id}
          baseUrl={baseUrl(photo)}
          initial={parseDevelopParams(photo.develop_params)}
          onSaved={(developedAt, params) => {
            onDeveloped(developedAt, params ? JSON.stringify(params) : null);
            setDevelopOpen(false);
          }}
          onClose={() => setDevelopOpen(false)}
        />
      )}
    </div>
  );
}

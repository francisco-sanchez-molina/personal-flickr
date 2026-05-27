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
import LightboxInfo from "./LightboxInfo";
import { Icons } from "./icons";

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
  // EXIF (any may be null)
  camera: string | null;
  lens: string | null;
  fstop: number | null;
  shutter: string | null;
  iso: number | null;
  focal: number | null;
  taken_at: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
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
  galleryId?: number;
  orphans?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [active, setActive] = useState<number | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchorIndexRef = useRef<number | null>(null);
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

  const onThumbClick = useCallback(
    (idx: number, e: React.MouseEvent) => {
      const photo = photos[idx];
      if (!photo) return;
      if (e.shiftKey) {
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
      if (e.metaKey || e.ctrlKey) {
        toggleSelected(photo.id);
        anchorIndexRef.current = idx;
        return;
      }
      if (selectMode) {
        toggleSelected(photo.id);
        anchorIndexRef.current = idx;
        return;
      }
      anchorIndexRef.current = idx;
      setActive(idx);
    },
    [photos, selectMode, toggleSelected],
  );

  const longPressTimer = useRef<number | null>(null);
  const onThumbPointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (selectMode) return;
      longPressTimer.current = window.setTimeout(() => {
        const photo = photos[idx];
        if (!photo) return;
        setForcedSelectMode(true);
        setSelected(new Set([photo.id]));
        anchorIndexRef.current = idx;
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

  // Esc / Cmd-A (grid-level)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (active != null) return;
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

  // Photos added globally
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent<{ photo: Photo; galleryId: number | null }>)
        .detail;
      if (galleryId != null && detail.galleryId !== galleryId) return;
      const photo = detail.photo;
      setPhotos((p) => {
        const filtered = p.filter((x) => x.name !== photo.name);
        return [photo, ...filtered];
      });
    };
    window.addEventListener("photo:added", onAdded);
    return () => window.removeEventListener("photo:added", onAdded);
  }, [galleryId]);

  // Memberships changed → maybe drop from the current view
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (
        e as CustomEvent<{ photoId: number; galleryIds: number[] }>
      ).detail;
      if (orphans && d.galleryIds.length > 0) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
        return;
      }
      if (galleryId != null && !d.galleryIds.includes(galleryId)) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
      }
    };
    window.addEventListener("photo:memberships-changed", onChange);
    return () =>
      window.removeEventListener("photo:memberships-changed", onChange);
  }, [galleryId, orphans]);

  // Lightbox keyboard
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
      updatePhoto(id, { is_favorite: next });
      try {
        const res = await fetch(`/api/photos/${id}/favorite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: next === 1 }),
        });
        if (!res.ok) throw new Error();
      } catch {
        updatePhoto(id, { is_favorite: cur.is_favorite });
      }
    },
    [photos, updatePhoto],
  );

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

  const allSelectedAreFavorite = (() => {
    if (selected.size === 0) return false;
    for (const p of photos) {
      if (selected.has(p.id) && p.is_favorite !== 1) return false;
    }
    return true;
  })();

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      {/* Tiny header explaining selection vs. normal click */}
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 14 }}
      >
        <div
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11.5,
            color: "var(--ink-3)",
            letterSpacing: ".04em",
          }}
        >
          {selectMode ? (
            <>
              <strong
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 13,
                }}
              >
                {selected.size}
              </strong>{" "}
              seleccionada{selected.size === 1 ? "" : "s"} · click para
              alternar · shift para rango
            </>
          ) : (
            <>click para abrir · shift+click para seleccionar varias</>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {selectMode ? (
            <>
              <button
                className="btn sm"
                onClick={() =>
                  setSelected(new Set(photos.map((p) => p.id)))
                }
              >
                Todas
              </button>
              <button className="btn ghost sm" onClick={clearSelection}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="btn ghost sm"
              onClick={() => setForcedSelectMode(true)}
            >
              Seleccionar
            </button>
          )}
        </div>
      </div>

      <div
        className="masonry"
        style={{ userSelect: "none" } as React.CSSProperties}
      >
        {photos.map((p, i) => {
          const isSelected = selected.has(p.id);
          return (
            <div
              key={p.id}
              className={[
                "tile",
                isSelected ? "selected" : "",
                selectMode && !isSelected ? "dim" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
                style={{
                  aspectRatio: `${p.width}/${p.height}`,
                  background: "var(--bg-3)",
                }}
              />
              {selectMode && <div className="check">✓</div>}
              <button
                className={`star ${p.is_favorite ? "on" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(p.id);
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

      {active != null && photos[active] && (
        <Lightbox
          photos={photos}
          index={active}
          onIndex={setActive}
          onClose={() => setActive(null)}
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

// ────────── LIGHTBOX ──────────

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
  onToggleFavorite,
  onDeveloped,
}: {
  photos: Photo[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onDeveloped: (developedAt: number, developParamsJson: string | null) => void;
}) {
  const photo = photos[index];
  const isFav = photo.is_favorite === 1;
  const [developOpen, setDevelopOpen] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Info panel closed by default — the photo gets full canvas. User toggles
  // it with the "i" button / I key.
  const [showInfo, setShowInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryButtonRef = useRef<HTMLButtonElement>(null);

  const [scale, setScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Swipe / drag-to-navigate (only at scale=1)
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, t: 0 });
  const axisRef = useRef<"none" | "x" | "y">("none");
  const activePointers = useRef(new Set<number>());

  useEffect(() => {
    transformRef.current?.resetTransform(0);
    setScale(1);
  }, [photo.id]);

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
      void containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (k === "i") {
        e.preventDefault();
        setShowInfo((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const isZoomed = scale > 1.01;

  // Pointer handlers for swipe-to-navigate
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.add(e.pointerId);
    if (isZoomed) return;
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
      if (dx < 0) onIndex((index + 1) % photos.length);
      else onIndex((index - 1 + photos.length) % photos.length);
    }
    setDragX(0);
  };

  const stageImgStyle: React.CSSProperties = {
    transform: `translateX(${dragX}px)`,
    transition: dragging ? "none" : "transform 180ms ease-out",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "pan-y",
  };

  return (
    <div
      ref={containerRef}
      className={`lb${isFullscreen ? " is-fullscreen" : ""}`}
    >
      <header className="lb-top">
        <div style={{ minWidth: 0 }}>
          <div className="filename">{photo.name}</div>
          <div className="meta">
            {photo.width}×{photo.height} · {fmtSize(photo.size_bytes)} ·{" "}
            {fmtDate(photo.uploaded_at)} · {index + 1}/{photos.length}
            {isZoomed && (
              <span style={{ color: "var(--accent)", marginLeft: 8 }}>
                · {scale.toFixed(1)}×
              </span>
            )}
          </div>
        </div>
        <div className="lb-actions" style={{ position: "relative" }}>
          <button
            className="iconbtn"
            onClick={onToggleFavorite}
            title={isFav ? "Quitar favorita (F)" : "Marcar favorita (F)"}
            aria-pressed={isFav}
            style={isFav ? { color: "var(--accent)" } : undefined}
          >
            {isFav ? <Icons.StarFill size={15} /> : <Icons.Star size={15} />}
          </button>
          {photo.has_base === 1 && (
            <button className="btn" onClick={() => setDevelopOpen(true)}>
              <Icons.Sliders size={14} /> Revelar
            </button>
          )}
          <button
            ref={galleryButtonRef}
            className="btn"
            onClick={() => setGalleryPickerOpen((v) => !v)}
          >
            <Icons.Folder size={14} /> Galerías
          </button>
          <a
            className="btn"
            href={photoUrl(photo)}
            download={photo.name}
            onClick={(e) => e.stopPropagation()}
          >
            <Icons.Download size={14} /> Descargar
          </a>
          <button className="btn danger" onClick={onDelete}>
            <Icons.Trash size={14} /> Eliminar
          </button>
          <button
            className={`iconbtn${showInfo ? " active" : ""}`}
            onClick={() => setShowInfo((v) => !v)}
            title="Info (I)"
            aria-pressed={showInfo}
          >
            <Icons.Info size={15} />
          </button>
          <button
            className="iconbtn"
            onClick={toggleFullscreen}
            title={
              isFullscreen
                ? "Salir de pantalla completa (F)"
                : "Pantalla completa (F)"
            }
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? (
              <Icons.FullscreenExit size={15} />
            ) : (
              <Icons.Fullscreen size={15} />
            )}
          </button>
          <button className="iconbtn" onClick={onClose} title="Cerrar (Esc)">
            <Icons.Close size={15} />
          </button>

          {galleryPickerOpen && (
            <GalleryPicker
              photoId={photo.id}
              onClose={() => setGalleryPickerOpen(false)}
            />
          )}
        </div>
      </header>

      <div className={`lb-stage${showInfo ? " with-info" : ""}`}>
        <div
          className="lb-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onPointerLeave={finishDrag}
        >
          <button
            className="lb-nav prev"
            onClick={() => onIndex((index - 1 + photos.length) % photos.length)}
            title="Anterior (←)"
          >
            <Icons.ChevL size={18} />
          </button>

          <div style={stageImgStyle}>
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
                {/* width/height 100% gives the <img> a definite box so
                    object-fit can letterbox the picture preserving its
                    aspect ratio — this also forces the lib's flex content
                    to lay out the image at the center of its container. */}
                <img
                  src={photoUrl(photo)}
                  alt={photo.name}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </TransformComponent>
            </TransformWrapper>
          </div>

          <button
            className="lb-nav next"
            onClick={() => onIndex((index + 1) % photos.length)}
            title="Siguiente (→)"
          >
            <Icons.ChevR size={18} />
          </button>

          {!isZoomed && (
            <div className="lb-hint">
              pellizca o doble-tap para zoom · ← → cambia · I info · F pantalla completa
            </div>
          )}
        </div>
        {showInfo && <LightboxInfo photo={photo} />}
      </div>

      <div className="lb-strip">
        {photos.map((p, i) => {
          if (Math.abs(i - index) > 5) return null;
          return (
            <div
              key={p.id}
              className={`thumb ${i === index ? "on" : ""}`}
              onClick={() => onIndex(i)}
            >
              <img src={thumbUrl(p)} alt="" />
            </div>
          );
        })}
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

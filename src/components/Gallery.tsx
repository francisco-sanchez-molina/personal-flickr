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
}: {
  initial: Photo[];
  /** If set, we're viewing a specific gallery — delete removes from gallery, not from disk. */
  galleryId?: number;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    // Newly-uploaded photos only enter the "all photos" view, not a
    // gallery-filtered view (they aren't in this gallery yet).
    if (galleryId != null) return;
    const onAdded = (e: Event) => {
      const photo = (e as CustomEvent<Photo>).detail;
      setPhotos((p) => {
        // dedupe by name (in case of replace)
        const filtered = p.filter((x) => x.name !== photo.name);
        return [photo, ...filtered];
      });
    };
    window.addEventListener("photo:added", onAdded);
    return () => window.removeEventListener("photo:added", onAdded);
  }, [galleryId]);

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

  if (photos.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        Aún no hay fotos. Sube alguna ↑
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((p, i) => (
          <li
            key={p.id}
            className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg bg-neutral-900"
            onClick={() => setActive(i)}
          >
            <img
              src={thumbUrl(p)}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] opacity-0 transition group-hover:opacity-100">
              <div className="truncate">{p.name}</div>
              <div className="text-neutral-400">
                {p.width}×{p.height} · {fmtSize(p.size_bytes)}
              </div>
            </div>
          </li>
        ))}
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
          onDeveloped={(developedAt, paramsJson) =>
            updatePhoto(photos[active].id, {
              developed_at: developedAt,
              develop_params: paramsJson,
            })
          }
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
  onDeveloped,
}: {
  photo: Photo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onDeveloped: (developedAt: number, developParamsJson: string | null) => void;
}) {
  const [developOpen, setDevelopOpen] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  // The TransformWrapper handles pinch + pan + double-tap zoom internally.
  // We track `scale` in state so we can:
  //   - disable library panning at scale=1 (lets swipe-to-navigate pass through)
  //   - skip swipe-navigation when zoomed in (so single-finger drag pans)
  const [scale, setScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

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

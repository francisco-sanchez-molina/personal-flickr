/**
 * Full-screen photo viewer with zoom, swipe-navigation, develop, info side
 * panel, and gallery picker. Mounted only when a grid item is active; the
 * parent owns the active index and lifecycle callbacks (close, delete,
 * toggle-favorite, developed).
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { Photo } from "~/lib/db";
import { cn } from "~/lib/cn";
import { baseUrl, fmtDate, fmtDuration, fmtSize, isVideo, photoUrl, thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";
import ShareDialog from "../share/ShareDialog";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { DEFAULT_DEVELOP, type DevelopParams } from "./develop-params";
import GalleryPicker from "./GalleryPicker";
import LightboxInfo from "./LightboxInfo";
import { useFullscreen } from "./hooks/useFullscreen";
import { usePreloadNeighbors } from "./hooks/usePreloadNeighbors";
import { useSwipeNav } from "./hooks/useSwipeNav";

// DevelopPanel is a sizeable client island (sliders, presets, blob diffing)
// that only renders when the user clicks "Revelar". Lazy-load it so the
// initial lightbox open doesn't pay its ~6 KB gz cost.
const DevelopPanel = lazy(() => import("./DevelopPanel"));

function parseDevelopParams(json: string | null): DevelopParams {
  if (!json) return DEFAULT_DEVELOP;
  try {
    const p = JSON.parse(json) as Partial<DevelopParams>;
    return { ...DEFAULT_DEVELOP, ...p };
  } catch {
    return DEFAULT_DEVELOP;
  }
}

interface Props {
  photos: Photo[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  /**
   * Fires whenever the photo row changes server-side (develop, rotation,
   * any other re-encode). Receives the full row so width/height/develop
   * params/developed_at can all stay consistent in the parent.
   */
  onPhotoUpdated: (photo: Photo) => void;
}

export default function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
  onToggleFavorite,
  onPhotoUpdated,
}: Props) {
  const photo = photos[index];
  const isFav = photo.is_favorite === 1;
  const video = isVideo(photo);
  const [developOpen, setDevelopOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Info panel closed by default — the photo gets the full canvas. Toggled
  // with the "i" button / I key.
  const [showInfo, setShowInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const isZoomed = scale > 1.01;

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  usePreloadNeighbors(photos, index);

  // ──────────────── Fullscreen chrome reveal ────────────────
  // In fullscreen the top bar is hidden so the photo gets the whole screen.
  // Tapping the photo reveals it for 4s (or until another tap toggles it
  // off). The timer is reset on every reveal.
  const [chromeVisible, setChromeVisible] = useState(false);
  const chromeTimerRef = useRef<number | null>(null);
  const clearChromeTimer = useCallback(() => {
    if (chromeTimerRef.current != null) {
      clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
  }, []);
  const revealChromeTemporarily = useCallback(() => {
    setChromeVisible(true);
    clearChromeTimer();
    chromeTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      chromeTimerRef.current = null;
    }, 4000);
  }, [clearChromeTimer]);
  // Reset whenever fullscreen toggles (hide on enter; harmless on exit).
  useEffect(() => {
    clearChromeTimer();
    setChromeVisible(false);
  }, [isFullscreen, clearChromeTimer]);
  // Cleanup on unmount.
  useEffect(() => () => clearChromeTimer(), [clearChromeTimer]);
  const onStageClick = useCallback(() => {
    if (!isFullscreen) return;
    if (chromeVisible) {
      clearChromeTimer();
      setChromeVisible(false);
    } else {
      revealChromeTemporarily();
    }
  }, [isFullscreen, chromeVisible, clearChromeTimer, revealChromeTemporarily]);

  const swipe = useSwipeNav({
    isZoomed,
    count: photos.length,
    index,
    onIndex,
  });

  // Reset zoom + scale when the photo changes.
  useEffect(() => {
    transformRef.current?.resetTransform(0);
    setScale(1);
  }, [photo.id]);

  // Lazy content-hash backfill: legacy photos (uploaded before the
  // content_hash column existed) have a NULL hash. On open, fire a
  // background request to hash whatever's currently on disk and persist
  // it. Idempotent server-side (no-op if a hash already exists), and the
  // result doesn't block anything — failures are silent.
  useEffect(() => {
    if (photo.content_hash) return;
    if (photo.processing_status !== "ready") return;
    const ctrl = new AbortController();
    fetch(`/api/photos/${photo.id}/backfill-hash`, {
      method: "POST",
      signal: ctrl.signal,
    }).catch(() => {
      /* user navigated away or network blip — nothing to recover */
    });
    return () => ctrl.abort();
  }, [photo.id, photo.content_hash, photo.processing_status]);

  // Standalone rotate — surfaces the most-used Develop action (90°
   //  steps) outside the panel for photos that have a preserved base
   //  (RAWs). Sends the current params + new rotate value through the
   //  same /develop endpoint that DevelopPanel uses, then forwards the
   //  fresh row to the parent. Disabled while a request is in flight to
   //  avoid stomping on a previous response.
  const [rotating, setRotating] = useState(false);
  const rotate = useCallback(
    async (delta: 90 | -90) => {
      if (rotating || photo.has_base !== 1) return;
      setRotating(true);
      try {
        const current = parseDevelopParams(photo.develop_params);
        const nextRotate = ((((current.rotate + delta) % 360) + 360) % 360) as
          | 0
          | 90
          | 180
          | 270;
        const res = await fetch(`/api/photos/${photo.id}/develop`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            params: { ...current, rotate: nextRotate },
          }),
        });
        const body = await res.json();
        if (res.ok && body.photo) {
          onPhotoUpdated(body.photo as Photo);
        }
      } catch {
        /* swallow — user can retry */
      } finally {
        setRotating(false);
      }
    },
    [photo.id, photo.develop_params, photo.has_base, onPhotoUpdated, rotating],
  );

  // F = fullscreen · I = info. Skip when typing in inputs.
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

  const stageImgStyle: React.CSSProperties = {
    transform: `translateX(${swipe.dragX}px)`,
    transition:
      swipe.dragging || swipe.transitioning
        ? "none"
        : "transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)",
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
      className={cn(
        "lb",
        isFullscreen && "is-fullscreen",
        isFullscreen && chromeVisible && "chrome-visible",
      )}
    >
      <header
        className="lb-top"
        // While chrome is visible in fullscreen, any interaction with it
        // resets the auto-hide timer — so reading the meta / hovering over
        // a button doesn't make the bar disappear under the cursor.
        onMouseMove={isFullscreen && chromeVisible ? revealChromeTemporarily : undefined}
        onPointerDown={isFullscreen && chromeVisible ? revealChromeTemporarily : undefined}
      >
        <div className="min-w-0">
          <div className="filename">{photo.name}</div>
          <div className="meta">
            {photo.width}×{photo.height}
            {photo.size_bytes > 0 && <> · {fmtSize(photo.size_bytes)}</>}
            {video && photo.duration_ms != null && (
              <> · {fmtDuration(photo.duration_ms)}</>
            )}
            {" · "}
            {fmtDate(photo.uploaded_at)} · {index + 1}/{photos.length}
            {isZoomed && (
              <span className="ml-2 text-accent">
                · {scale.toFixed(1)}×
              </span>
            )}
          </div>
        </div>
        <div className="lb-actions relative">
          <IconButton
            className={isFav ? "text-accent" : undefined}
            onClick={onToggleFavorite}
            title={isFav ? "Quitar favorita (F)" : "Marcar favorita (F)"}
            aria-pressed={isFav}
            aria-label={isFav ? "Quitar favorita" : "Marcar favorita"}
          >
            {isFav ? <Icons.StarFill size={15} /> : <Icons.Star size={15} />}
          </IconButton>
          {photo.has_base === 1 && (
            <>
              <IconButton
                onClick={() => rotate(-90)}
                disabled={rotating}
                aria-label="Rotar 90° a la izquierda"
                title="Rotar 90° a la izquierda"
              >
                <Icons.RotL size={15} />
              </IconButton>
              <IconButton
                onClick={() => rotate(90)}
                disabled={rotating}
                aria-label="Rotar 90° a la derecha"
                title="Rotar 90° a la derecha"
              >
                <Icons.RotR size={15} />
              </IconButton>
              <Button onClick={() => setDevelopOpen(true)}>
                <Icons.Sliders size={14} /> Revelar
              </Button>
            </>
          )}
          <GalleryPicker photoId={photo.id}>
            <Button>
              <Icons.Folder size={14} /> Galerías
            </Button>
          </GalleryPicker>
          {photo.processing_status === "ready" && (
            <Button
              href={photoUrl(photo)}
              download={photo.name}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <Icons.Download size={14} /> Descargar
            </Button>
          )}
          <Button onClick={() => setShareOpen(true)}>
            <Icons.Share size={14} /> Compartir
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Icons.Trash size={14} /> Eliminar
          </Button>
          <IconButton
            active={showInfo}
            onClick={() => setShowInfo((v) => !v)}
            title="Info (I)"
            aria-pressed={showInfo}
            aria-label="Mostrar información"
          >
            <Icons.Info size={15} />
          </IconButton>
          <IconButton
            onClick={toggleFullscreen}
            title={
              isFullscreen
                ? "Salir de pantalla completa (F)"
                : "Pantalla completa (F)"
            }
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? (
              <Icons.FullscreenExit size={15} />
            ) : (
              <Icons.Fullscreen size={15} />
            )}
          </IconButton>
          <IconButton onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar">
            <Icons.Close size={15} />
          </IconButton>
        </div>
      </header>

      <div className={cn("lb-stage", showInfo && "with-info")}>
        <div
          className="lb-canvas"
          onClick={onStageClick}
          onPointerDown={swipe.onPointerDown}
          onPointerMove={swipe.onPointerMove}
          onPointerUp={swipe.onPointerEnd}
          onPointerCancel={swipe.onPointerEnd}
          onPointerLeave={swipe.onPointerEnd}
        >
          <button
            className="lb-nav prev"
            onClick={() => onIndex((index - 1 + photos.length) % photos.length)}
            title="Anterior (←)"
          >
            <Icons.ChevL size={18} />
          </button>

          <div style={stageImgStyle}>
            {video && photo.processing_status !== "ready" ? (
              // Transcoding still running (or failed). Show the poster + an
              // overlay; the actual MP4 doesn't exist on disk yet so we can't
              // mount a <video>.
              <div className="lb-processing">
                <img
                  src={thumbUrl(photo)}
                  alt={photo.name}
                  draggable={false}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "calc(100vh - 200px)",
                    width: "auto",
                    height: "auto",
                    display: "block",
                    opacity: 0.55,
                  }}
                />
                <div className="lb-processing-overlay">
                  {photo.processing_status === "processing" ? (
                    <>
                      <div className="spinner" />
                      <div>Procesando vídeo… esto puede tardar unos segundos</div>
                    </>
                  ) : (
                    <div>Error al procesar el vídeo. Borra y vuelve a subirlo.</div>
                  )}
                </div>
              </div>
            ) : video ? (
              // Native video element with controls. Re-mount on photo change
              // (key=photo.id) so the previous source is torn down and the new
              // one starts fresh. `playsInline` is needed on iOS to avoid the
              // browser hijacking playback into fullscreen.
              <video
                key={photo.id}
                src={photoUrl(photo)}
                controls
                playsInline
                preload="metadata"
                poster={thumbUrl(photo)}
                // In fullscreen the chrome is gone — let the photo / video
                // use the entire viewport rather than reserving 200px for
                // a top bar that isn't rendered.
                className={cn(
                  "block h-auto w-auto max-w-full bg-black",
                  isFullscreen
                    ? "max-h-screen"
                    : "max-h-[calc(100vh-200px)]",
                )}
              />
            ) : (
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
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    // Override the lib's default align-items: stretch which
                    // was stretching the <img> vertically for landscape photos.
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Viewport-relative max constraints so the image's intrinsic
                      aspect always wins. width/height auto + max-* lets the
                      browser size the picture to the smaller of the two
                      constraints — no stretching, no cropping. */}
                  <img
                    src={photoUrl(photo)}
                    alt={photo.name}
                    draggable={false}
                    className={cn(
                      "block h-auto w-auto max-w-full",
                      isFullscreen
                        ? "max-h-screen"
                        : "max-h-[calc(100vh-200px)]",
                    )}
                  />
                </TransformComponent>
              </TransformWrapper>
            )}
          </div>

          <button
            className="lb-nav next"
            onClick={() => onIndex((index + 1) % photos.length)}
            title="Siguiente (→)"
          >
            <Icons.ChevR size={18} />
          </button>

          {!isZoomed && !video && (
            <div className="lb-hint">
              pellizca o doble-tap para zoom · ← → cambia · I info · F pantalla completa
            </div>
          )}
          {video && (
            <div className="lb-hint">
              ← → cambia · I info · F pantalla completa
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
              className={cn("thumb", i === index && "on")}
              onClick={() => onIndex(i)}
            >
              <img src={thumbUrl(p)} alt="" />
            </div>
          );
        })}
      </div>

      {developOpen && (
        <Suspense fallback={null}>
          <DevelopPanel
            photoId={photo.id}
            baseUrl={baseUrl(photo)}
            initial={parseDevelopParams(photo.develop_params)}
            onSaved={(updated) => {
              onPhotoUpdated(updated);
              setDevelopOpen(false);
            }}
            onClose={() => setDevelopOpen(false)}
          />
        </Suspense>
      )}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        photoId={photo.id}
      />
    </div>
  );
}

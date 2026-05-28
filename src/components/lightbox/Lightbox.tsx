/**
 * Full-screen photo viewer with zoom, swipe-navigation, develop, info side
 * panel, and gallery picker. Mounted only when a grid item is active; the
 * parent owns the active index and lifecycle callbacks (close, delete,
 * toggle-favorite, developed).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { Photo } from "~/lib/db";
import { cn } from "~/lib/cn";
import { baseUrl, fmtDate, fmtDuration, fmtSize, isVideo, photoUrl, thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";
import DevelopPanel, {
  DEFAULT_DEVELOP,
  type DevelopParams,
} from "./DevelopPanel";
import GalleryPicker from "./GalleryPicker";
import LightboxInfo from "./LightboxInfo";
import { useFullscreen } from "./hooks/useFullscreen";
import { usePreloadNeighbors } from "./hooks/usePreloadNeighbors";
import { useSwipeNav } from "./hooks/useSwipeNav";

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
  onDeveloped: (developedAt: number, developParamsJson: string | null) => void;
}

export default function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
  onToggleFavorite,
  onDeveloped,
}: Props) {
  const photo = photos[index];
  const isFav = photo.is_favorite === 1;
  const video = isVideo(photo);
  const [developOpen, setDevelopOpen] = useState(false);
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
            {photo.width}×{photo.height} · {fmtSize(photo.size_bytes)}
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
          <button
            className={cn("iconbtn", isFav && "text-accent")}
            onClick={onToggleFavorite}
            title={isFav ? "Quitar favorita (F)" : "Marcar favorita (F)"}
            aria-pressed={isFav}
          >
            {isFav ? <Icons.StarFill size={15} /> : <Icons.Star size={15} />}
          </button>
          {photo.has_base === 1 && (
            <button className="btn" onClick={() => setDevelopOpen(true)}>
              <Icons.Sliders size={14} /> Revelar
            </button>
          )}
          <GalleryPicker photoId={photo.id}>
            <button className="btn">
              <Icons.Folder size={14} /> Galerías
            </button>
          </GalleryPicker>
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
            className={cn("iconbtn", showInfo && "active")}
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
            {video ? (
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

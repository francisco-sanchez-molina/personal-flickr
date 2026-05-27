/**
 * Side panel for the lightbox showing EXIF + capture metadata.
 * Renders inside .lb-stage on desktop, slides up from the bottom on mobile
 * (handled by CSS).
 */

interface Photo {
  name: string;
  width: number;
  height: number;
  size_bytes: number;
  uploaded_at: number;
  original_ext: string | null;
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

function fmtSize(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDateOnly(ts: number): string {
  return new Date(ts).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function fmtTimeOnly(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function K({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className={typeof value === "string" ? "v" : "v"}>
        {value === null || value === undefined || value === "" ? (
          <span style={{ color: "rgba(245,243,238,.35)" }}>—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function LightboxInfo({ photo }: { photo: Photo }) {
  const hasExif =
    photo.camera || photo.lens || photo.iso || photo.fstop || photo.taken_at;
  const hasGps = photo.gps_lat != null && photo.gps_lng != null;

  return (
    <aside className="lb-side">
      <div className="sec">
        <h4>Cámara</h4>
        <div className="exif-grid">
          <K label="Cuerpo" value={photo.camera} />
          <K label="Objetivo" value={photo.lens} />
          <K
            label="Formato"
            value={
              photo.original_ext
                ? photo.original_ext.replace(/^\./, "").toUpperCase()
                : "JPEG"
            }
          />
          <K label="Tamaño" value={<span className="m">{photo.width}×{photo.height}</span>} />
        </div>
      </div>

      <div className="sec">
        <h4>Exposición</h4>
        <div className="exif-grid">
          <K
            label="Apertura"
            value={photo.fstop ? <span className="m">ƒ/{photo.fstop}</span> : null}
          />
          <K
            label="Obturación"
            value={photo.shutter ? <span className="m">{photo.shutter}s</span> : null}
          />
          <K label="ISO" value={photo.iso ? <span className="m">{photo.iso}</span> : null} />
          <K
            label="Focal"
            value={photo.focal ? <span className="m">{photo.focal}mm</span> : null}
          />
        </div>
      </div>

      <div className="sec">
        <h4>Capturado</h4>
        <div className="exif-grid">
          <K
            label="Fecha"
            value={
              photo.taken_at ? (
                <span className="m">{fmtDateOnly(photo.taken_at)}</span>
              ) : null
            }
          />
          <K
            label="Hora"
            value={
              photo.taken_at ? (
                <span className="m">{fmtTimeOnly(photo.taken_at)}</span>
              ) : null
            }
          />
          <K
            label="Subida"
            value={<span className="m">{fmtDateOnly(photo.uploaded_at)}</span>}
          />
          <K label="Peso" value={<span className="m">{fmtSize(photo.size_bytes)}</span>} />
        </div>
      </div>

      {hasGps && (
        <div className="sec">
          <h4>Ubicación</h4>
          <MiniMap lat={photo.gps_lat!} lng={photo.gps_lng!} />
        </div>
      )}

      {!hasExif && !hasGps && (
        <div className="sec">
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "rgba(245,243,238,.55)",
              fontFamily: "var(--f-mono)",
              letterSpacing: ".02em",
            }}
          >
            Sin EXIF — esta foto no traía metadatos de cámara.
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * Stylized SVG map (no tiles): topographic-ish background + concentric
 * rings around the photo's location. Decorative more than functional —
 * we just want a sense that there IS a location.
 */
function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="map">
      <svg viewBox="0 0 320 160" preserveAspectRatio="none">
        <defs>
          <pattern id="map-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M20 0H0V20"
              fill="none"
              stroke="currentColor"
              strokeWidth=".3"
              opacity=".25"
            />
          </pattern>
        </defs>
        <rect
          width="320"
          height="160"
          fill="url(#map-grid)"
          style={{ color: "var(--ink-3)" }}
        />
        <path
          d="M-20 80 Q 40 40, 100 70 T 200 60 T 340 80"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth=".7"
          opacity=".5"
        />
        <path
          d="M-20 110 Q 40 75, 100 100 T 200 90 T 340 110"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth=".7"
          opacity=".4"
        />
        <path
          d="M-20 130 Q 60 100, 130 120 T 260 110 T 340 130"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth=".7"
          opacity=".3"
        />
        <circle cx="160" cy="80" r="50" fill="none" stroke="currentColor" strokeWidth=".4" opacity=".4" />
        <circle cx="160" cy="80" r="32" fill="none" stroke="currentColor" strokeWidth=".4" opacity=".5" />
        <circle cx="160" cy="80" r="16" fill="none" stroke="currentColor" strokeWidth=".4" opacity=".6" />
      </svg>
      <div className="pin" style={{ left: "calc(50% - 7px)", top: "calc(50% - 7px)" }} />
      <div className="lab">
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

interface Data {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  max: number;
}

const BINS = 48;
const VBW = 200; // viewBox width
const VBH = 64; // viewBox height

/**
 * Inline-SVG histogram computed client-side from the displayed image.
 *
 * The image is sampled by drawing it into a small offscreen canvas (~200px
 * wide). Reading raw pixels and binning by channel + luma takes ~30-80ms
 * on a typical phone for a 2K source; the canvas resize does the heavy
 * lifting for us. We re-run when `src` changes (e.g. navigating between
 * photos in the lightbox).
 *
 * Cross-channel rendering: R/G/B as semi-transparent fills with `mix-blend:
 * screen` so overlapping areas brighten (the classic Lightroom look);
 * luma as a thin top stroke for contrast.
 */
export default function Histogram({ src }: { src: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      try {
        const W = 200;
        const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
        const H = Math.max(1, Math.round(W * aspect));
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, W, H);
        const pix = ctx.getImageData(0, 0, W, H).data;

        const r = new Uint32Array(BINS);
        const g = new Uint32Array(BINS);
        const b = new Uint32Array(BINS);
        const l = new Uint32Array(BINS);
        for (let i = 0; i < pix.length; i += 4) {
          const R = pix[i];
          const G = pix[i + 1];
          const B = pix[i + 2];
          const L = ((R * 299 + G * 587 + B * 114) / 1000) | 0;
          r[(R * BINS) >> 8]++;
          g[(G * BINS) >> 8]++;
          b[(B * BINS) >> 8]++;
          l[(L * BINS) >> 8]++;
        }
        // Drop the first/last bins from the max calc — pure black & pure
        // white spikes (edges, padding) would otherwise flatten everything
        // else.
        let max = 0;
        for (let i = 1; i < BINS - 1; i++) {
          if (r[i] > max) max = r[i];
          if (g[i] > max) max = g[i];
          if (b[i] > max) max = b[i];
          if (l[i] > max) max = l[i];
        }
        if (max === 0) max = 1;
        setData({ r, g, b, l, max });
      } catch {
        /* getImageData can throw on tainted canvases; ignore */
      }
    };
    img.onerror = () => {
      /* ignore — broken thumb, broken EXIF, etc. */
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!data) {
    return (
      <div
        style={{
          height: VBH,
          display: "flex",
          alignItems: "center",
          fontFamily: "var(--f-mono)",
          fontSize: 10.5,
          color: "rgba(245,243,238,.35)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        computando…
      </div>
    );
  }

  const bw = VBW / BINS;
  const bars = (arr: Uint32Array) => {
    const out: { x: number; y: number; h: number }[] = [];
    for (let i = 0; i < BINS; i++) {
      const h = Math.min(VBH, (arr[i] / data.max) * VBH);
      out.push({ x: i * bw, y: VBH - h, h });
    }
    return out;
  };

  return (
    <svg
      viewBox={`0 0 ${VBW} ${VBH}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: VBH, display: "block" }}
    >
      {/* Subtle baseline */}
      <line
        x1={0}
        y1={VBH - 0.5}
        x2={VBW}
        y2={VBH - 0.5}
        stroke="rgba(245,243,238,.18)"
        strokeWidth={0.5}
      />
      <g style={{ mixBlendMode: "screen" }}>
        {bars(data.r).map((bar, i) => (
          <rect
            key={`r${i}`}
            x={bar.x}
            y={bar.y}
            width={Math.max(0.4, bw - 0.4)}
            height={bar.h}
            fill="#ff5b6b"
            opacity={0.55}
          />
        ))}
        {bars(data.g).map((bar, i) => (
          <rect
            key={`g${i}`}
            x={bar.x}
            y={bar.y}
            width={Math.max(0.4, bw - 0.4)}
            height={bar.h}
            fill="#5bff8c"
            opacity={0.5}
          />
        ))}
        {bars(data.b).map((bar, i) => (
          <rect
            key={`b${i}`}
            x={bar.x}
            y={bar.y}
            width={Math.max(0.4, bw - 0.4)}
            height={bar.h}
            fill="#6ba2ff"
            opacity={0.55}
          />
        ))}
      </g>
      {/* Luma envelope on top */}
      <g>
        {bars(data.l).map((bar, i) => (
          <rect
            key={`l${i}`}
            x={bar.x}
            y={Math.max(0, bar.y - 1)}
            width={Math.max(0.4, bw - 0.4)}
            height={1.5}
            fill="rgba(245,243,238,.55)"
          />
        ))}
      </g>
    </svg>
  );
}

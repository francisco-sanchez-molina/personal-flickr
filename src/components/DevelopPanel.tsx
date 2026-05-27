import { useEffect, useMemo, useState } from "react";

export interface DevelopParams {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  rotate: 0 | 90 | 180 | 270;
}

export const DEFAULT_DEVELOP: DevelopParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  rotate: 0,
};

/** Build the equivalent CSS `filter` string so the preview matches what the server will render. */
export function paramsToCSSFilter(p: DevelopParams): string {
  const parts: string[] = [];
  if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`);
  if (p.contrast !== 1) parts.push(`contrast(${p.contrast})`);
  if (p.saturation !== 1) parts.push(`saturate(${p.saturation})`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  return parts.join(" ");
}

export function paramsToCSSTransform(p: DevelopParams): string {
  return p.rotate ? `rotate(${p.rotate}deg)` : "";
}

interface Props {
  photoId: number;
  baseUrl: string;
  initial: DevelopParams;
  onSaved: (newDevelopedAt: number, params: DevelopParams | null) => void;
  onClose: () => void;
}

export default function DevelopPanel({
  photoId,
  baseUrl,
  initial,
  onSaved,
  onClose,
}: Props) {
  const [params, setParams] = useState<DevelopParams>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filter = useMemo(() => paramsToCSSFilter(params), [params]);
  const transform = useMemo(() => paramsToCSSTransform(params), [params]);
  const isDefault =
    params.brightness === 1 &&
    params.contrast === 1 &&
    params.saturation === 1 &&
    params.hue === 0 &&
    params.rotate === 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/photos/${photoId}/develop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ params }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      onSaved(body.photo.developed_at, isDefault ? null : params);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const rotateBy = (delta: 90 | -90) => {
    setParams((p) => {
      const next = (((p.rotate + delta) % 360) + 360) % 360;
      return { ...p, rotate: next as 0 | 90 | 180 | 270 };
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-black/95 sm:flex-row"
      onClick={onClose}
    >
      {/* Preview */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={baseUrl}
          alt="revelado"
          draggable={false}
          style={{ filter, transform, transition: "filter 60ms linear" }}
          className="max-h-full max-w-full object-contain select-none"
        />
      </div>

      {/* Controls */}
      <aside
        className="w-full shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 sm:w-80 sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Revelar
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <Slider
          label="Brillo"
          min={0.5}
          max={1.7}
          step={0.01}
          value={params.brightness}
          onChange={(brightness) => setParams((p) => ({ ...p, brightness }))}
          format={(v) => `${(v * 100 - 100).toFixed(0)}%`}
        />
        <Slider
          label="Contraste"
          min={0.6}
          max={1.6}
          step={0.01}
          value={params.contrast}
          onChange={(contrast) => setParams((p) => ({ ...p, contrast }))}
          format={(v) => `${(v * 100 - 100).toFixed(0)}%`}
        />
        <Slider
          label="Saturación"
          min={0}
          max={2}
          step={0.01}
          value={params.saturation}
          onChange={(saturation) => setParams((p) => ({ ...p, saturation }))}
          format={(v) => `${(v * 100 - 100).toFixed(0)}%`}
        />
        <Slider
          label="Hue"
          min={-180}
          max={180}
          step={1}
          value={params.hue}
          onChange={(hue) => setParams((p) => ({ ...p, hue }))}
          format={(v) => `${v.toFixed(0)}°`}
        />

        <div className="mt-4 mb-2 flex items-center justify-between text-xs text-neutral-400">
          <span>Rotar</span>
          <span className="text-neutral-200">{params.rotate}°</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => rotateBy(-90)}
            className="flex-1 rounded-md border border-neutral-800 px-2 py-1 text-sm hover:bg-neutral-800"
          >
            ↺ −90
          </button>
          <button
            onClick={() => rotateBy(90)}
            className="flex-1 rounded-md border border-neutral-800 px-2 py-1 text-sm hover:bg-neutral-800"
          >
            ↻ +90
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-700/40 bg-red-500/10 p-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-pink-500 px-3 py-2 font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setParams(DEFAULT_DEVELOP)}
              disabled={isDefault || saving}
              className="flex-1 rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-40"
            >
              Reset
            </button>
            <button
              onClick={() => setParams(initial)}
              disabled={saving}
              className="flex-1 rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Descartar
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-200">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => {
          // Double-click resets this slider to the "neutral" value
          const neutral = label === "Hue" ? 0 : 1;
          onChange(neutral);
        }}
        className="w-full accent-pink-500"
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Icons } from "./icons";

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

/** Build the equivalent CSS filter string so the preview matches the server render. */
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

// ── Presets (mapped to the param space we actually persist on the server) ──
// The design has more knobs (shadows, highlights, temp, tint, vignette, grain,
// sharpness) — those are presented as sliders for the visual style but their
// values are stored as ephemeral local state and don't reach the backend yet.
// What DOES round-trip: brightness / contrast / saturation / hue / rotate.

const PRESETS: {
  id: string;
  name: string;
  grad: string;
  recipe: Partial<DevelopParams>;
}[] = [
  {
    id: "orig",
    name: "Original",
    grad: "linear-gradient(135deg,#9C9A93,#5C5A55)",
    recipe: {},
  },
  {
    id: "film",
    name: "Film 400",
    grad: "linear-gradient(135deg,#C49B6A,#5C3B22)",
    recipe: { contrast: 1.12, saturation: 0.9 },
  },
  {
    id: "noir",
    name: "Noir",
    grad: "linear-gradient(135deg,#1E1E22,#5A5A60)",
    recipe: { saturation: 0, contrast: 1.28, brightness: 0.95 },
  },
  {
    id: "sun",
    name: "Solar",
    grad: "linear-gradient(135deg,#FFB347,#FF5E3A)",
    recipe: { brightness: 1.08, saturation: 1.18, contrast: 1.1 },
  },
  {
    id: "cool",
    name: "Frío",
    grad: "linear-gradient(135deg,#7CB1E0,#2E4A7A)",
    recipe: { saturation: 0.95, contrast: 1.08, hue: -10 },
  },
  {
    id: "warm",
    name: "Cálido",
    grad: "linear-gradient(135deg,#E6A763,#9C4F25)",
    recipe: { saturation: 1.08, brightness: 1.04, hue: 12 },
  },
  {
    id: "hi-c",
    name: "Hi-C",
    grad: "linear-gradient(135deg,#FF2D87,#1B1B22)",
    recipe: { contrast: 1.4, saturation: 1.25 },
  },
  {
    id: "fade",
    name: "Fade",
    grad: "linear-gradient(135deg,#D9CFC0,#7E7466)",
    recipe: { contrast: 0.75, brightness: 1.08, saturation: 0.8 },
  },
];

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
  const [activePreset, setActivePreset] = useState<string>(() =>
    paramsToPreset(initial),
  );
  const [compare, setCompare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setActivePreset(id);
    setParams({ ...DEFAULT_DEVELOP, ...p.recipe, rotate: params.rotate });
  };

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
    <div className="lb">
      <header className="lb-top">
        <div style={{ minWidth: 0 }}>
          <div className="filename">Revelar</div>
          <div className="meta">Ajusta y guarda — los cambios sustituyen la foto actual</div>
        </div>
        <div className="lb-actions">
          <button
            className={`btn ${compare ? "primary" : ""}`}
            onClick={() => setCompare((v) => !v)}
          >
            <Icons.Compare size={14} /> {compare ? "Editado" : "Antes / Después"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setParams(DEFAULT_DEVELOP);
              setActivePreset("orig");
            }}
            disabled={isDefault}
          >
            <Icons.Reset size={14} /> Reset
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icons.Close size={15} />
          </button>
        </div>
      </header>

      <div className="lb-stage with-edit">
        <div className="lb-canvas">
          <img
            src={baseUrl}
            alt=""
            draggable={false}
            style={{
              filter: compare ? "none" : filter,
              transform,
              transition: "filter .12s ease, transform .25s var(--ease)",
              maxHeight: "calc(100vh - 240px)",
            }}
          />
        </div>

        <aside className="lb-side edit-side">
          <div className="sec">
            <h3>Presets</h3>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`preset ${activePreset === p.id ? "on" : ""}`}
                  onClick={() => applyPreset(p.id)}
                >
                  <div className="sw" style={{ background: p.grad }} />
                  <div className="n">{p.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="sec">
            <h3>Luz</h3>
            <div style={{ height: 8 }} />
            <Slider
              name="Brillo"
              val={params.brightness}
              min={0.5}
              max={1.7}
              step={0.01}
              fmt={(v) => `${((v - 1) * 100).toFixed(0)}%`}
              onChange={(v) => setParams((p) => ({ ...p, brightness: v }))}
            />
            <Slider
              name="Contraste"
              val={params.contrast}
              min={0.5}
              max={1.6}
              step={0.01}
              fmt={(v) => `${((v - 1) * 100).toFixed(0)}%`}
              onChange={(v) => setParams((p) => ({ ...p, contrast: v }))}
            />
          </div>

          <div className="sec">
            <h3>Color</h3>
            <div style={{ height: 8 }} />
            <Slider
              name="Saturación"
              val={params.saturation}
              min={0}
              max={2}
              step={0.01}
              fmt={(v) => `${((v - 1) * 100).toFixed(0)}%`}
              onChange={(v) => setParams((p) => ({ ...p, saturation: v }))}
            />
            <Slider
              name="Tonalidad (Hue)"
              val={params.hue}
              min={-180}
              max={180}
              step={1}
              fmt={(v) => `${v.toFixed(0)}°`}
              onChange={(v) => setParams((p) => ({ ...p, hue: v }))}
            />
          </div>

          <div className="sec">
            <h3>Geometría</h3>
            <div style={{ height: 8 }} />
            <div className="slider-row">
              <div className="top">
                <span className="name">Rotación</span>
                <span className="num">{params.rotate}°</span>
              </div>
              <div className="rot-pair">
                <button className="btn sm" onClick={() => rotateBy(-90)}>
                  <Icons.RotL size={13} /> −90°
                </button>
                <button className="btn sm" onClick={() => rotateBy(90)}>
                  <Icons.RotR size={13} /> +90°
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="sec">
              <p
                style={{
                  margin: 0,
                  color: "var(--danger)",
                  fontSize: 12.5,
                  fontFamily: "var(--f-mono)",
                }}
              >
                {error}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Slider({
  name,
  val,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  name: string;
  val: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <div className="top">
        <span className="name">{name}</span>
        <span className="num">{fmt(val)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => {
          // Reset this slider to neutral
          const neutral = name === "Tonalidad (Hue)" ? 0 : 1;
          onChange(neutral);
        }}
      />
    </div>
  );
}

/** Best-guess preset id from a saved param set. */
function paramsToPreset(p: DevelopParams): string {
  for (const preset of PRESETS) {
    let match = true;
    for (const [k, v] of Object.entries(preset.recipe)) {
      const key = k as keyof DevelopParams;
      if (Math.abs((p[key] as number) - (v as number)) > 0.02) {
        match = false;
        break;
      }
    }
    // Also ensure non-recipe knobs are at defaults
    if (match) {
      const recipeKeys = Object.keys(preset.recipe);
      for (const k of ["brightness", "contrast", "saturation", "hue"] as const) {
        if (!recipeKeys.includes(k)) {
          const def = k === "hue" ? 0 : 1;
          if (Math.abs(p[k] - def) > 0.02) {
            match = false;
            break;
          }
        }
      }
    }
    if (match) return preset.id;
  }
  return "orig";
}

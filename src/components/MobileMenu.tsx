/**
 * Drawer that slides in from the right on mobile. Contains the nav links
 * that the desktop rail provides, plus mood / theme / logout.
 *
 * Rendered (mounted) always; visually shown only when `open` is true.
 * On desktop the menu icon that triggers this drawer is hidden via CSS,
 * so this component is effectively mobile-only.
 */
import { useEffect, useState } from "react";
import { Icons } from "./icons";

type Mood = "estudio" | "darkroom" | "salon";
type Theme = "dark" | "light";

const MOODS: { id: Mood; label: string; color: string }[] = [
  { id: "estudio", label: "Estudio", color: "#FF2D87" },
  { id: "darkroom", label: "Cuarto oscuro", color: "#FF6A2C" },
  { id: "salon", label: "Salón", color: "#14120E" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  current?:
    | "home"
    | "photos"
    | "galleries"
    | "favorites"
    | "tags"
    | "map"
    | "other";
}

export default function MobileMenu({ open, onClose, current }: Props) {
  const [mood, setMood] = useState<Mood>("estudio");
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync state with html attributes when opening
  useEffect(() => {
    if (!open) return;
    const m =
      (document.documentElement.getAttribute("data-mood") as Mood | null) ??
      "estudio";
    const t =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ??
      "dark";
    setMood(m);
    setTheme(t);
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const applyMood = (m: Mood) => {
    setMood(m);
    document.documentElement.setAttribute("data-mood", m);
    try {
      localStorage.setItem("pf:mood", m);
    } catch {
      /* ignore */
    }
  };
  const applyTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("pf:theme", t);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div
      className="mobile-menu-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="mobile-menu" role="dialog" aria-label="Menú">
        <header className="mm-head">
          <a href="/" className="rail-logo" style={{ width: 36, height: 36, fontSize: 16 }} aria-label="Inicio">
            <Icons.Logo size={16} />
          </a>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icons.Close size={16} />
          </button>
        </header>

        <nav className="mm-nav">
          <a href="/" className={`mm-item ${current === "galleries" ? "on" : ""}`}>
            <Icons.Folder size={18} />
            <span>Galerías</span>
          </a>
          <a href="/?view=photos" className={`mm-item ${current === "photos" ? "on" : ""}`}>
            <Icons.Photos size={18} />
            <span>Fotos</span>
          </a>
          <a href="/?view=favorites" className={`mm-item ${current === "favorites" ? "on" : ""}`}>
            <Icons.Heart size={18} />
            <span>Favoritas</span>
          </a>
        </nav>

        <div className="divider" />

        <div className="mm-section">
          <h5>Mood</h5>
          {MOODS.map((m) => (
            <button
              key={m.id}
              className={`mm-item ${mood === m.id ? "on" : ""}`}
              onClick={() => applyMood(m.id)}
              type="button"
            >
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: m.color,
                  border: "1px solid var(--line-2)",
                }}
                aria-hidden="true"
              />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="mm-section">
          <button
            className="mm-item"
            onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            type="button"
          >
            {theme === "dark" ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>
        </div>

        <div className="divider" />

        <form
          method="POST"
          action="/api/auth/logout"
          style={{ margin: 0, padding: "4px 0" }}
        >
          <button type="submit" className="mm-item" style={{ width: "100%" }}>
            <Icons.Close size={18} />
            <span>Salir</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

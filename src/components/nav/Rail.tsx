import { useEffect, useState, type ReactNode } from "react";
import { Icons } from "../icons";

type Mood = "estudio" | "darkroom" | "salon";
type Theme = "dark" | "light";

const MOODS: { id: Mood; label: string }[] = [
  { id: "estudio", label: "Estudio · magenta" },
  { id: "darkroom", label: "Cuarto oscuro · ámbar" },
  { id: "salon", label: "Salón · refinado" },
];

interface Props {
  /** Active nav item. Maps to URL pathname. */
  current:
    | "home"
    | "photos"
    | "galleries"
    | "favorites"
    | "tags"
    | "map"
    | "other";
}

export default function Rail({ current }: Props) {
  const [mood, setMood] = useState<Mood>("estudio");
  const [theme, setTheme] = useState<Theme>("dark");
  const [moodOpen, setMoodOpen] = useState(false);

  // Read persisted values on hydration (the inline <script> in Base.astro
  // already applies them to <html> before React boots; this just syncs state).
  useEffect(() => {
    const m = (document.documentElement.getAttribute("data-mood") ??
      "estudio") as Mood;
    const t = (document.documentElement.getAttribute("data-theme") ??
      "dark") as Theme;
    setMood(m);
    setTheme(t);
  }, []);

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

  const items: { id: Props["current"]; icon: ReactNode; label: string; href: string }[] = [
    { id: "home", icon: <Icons.Home />, label: "Inicio", href: "/" },
    { id: "photos", icon: <Icons.Photos />, label: "Fotos", href: "/?view=photos" },
    { id: "galleries", icon: <Icons.Folder />, label: "Galerías", href: "/?view=galleries" },
    { id: "favorites", icon: <Icons.Heart />, label: "Favoritas", href: "/?view=favorites" },
    { id: "tags", icon: <Icons.Tag />, label: "Etiquetas", href: "/?view=tags" },
  ];

  return (
    <aside className="rail">
      <div className="flex flex-col items-center gap-6">
        <a href="/" className="rail-logo" title="Personal Flickr" aria-label="Inicio">
          <Icons.Logo size={16} />
        </a>
        <nav className="rail-nav">
          {items.map((it) => (
            <a
              key={it.id}
              href={it.href}
              className="rail-btn"
              aria-current={current === it.id || undefined}
              aria-label={it.label}
            >
              {it.icon}
              <span className="rail-tip">{it.label}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="relative flex flex-col gap-1.5">
        {/* Mood selector */}
        <button
          className="rail-btn"
          onClick={() => setMoodOpen((v) => !v)}
          aria-label="Mood visual"
          aria-expanded={moodOpen}
        >
          <span
            className="h-[18px] w-[18px] rounded-full border-2 border-bg bg-accent shadow-[0_0_0_1px_var(--line-2)]"
          />
          <span className="rail-tip">Mood</span>
        </button>
        {moodOpen && (
          <div
            className="pop absolute bottom-0 left-[54px] min-w-[220px]"
            onMouseLeave={() => setMoodOpen(false)}
          >
            <h5>Estilo visual</h5>
            {MOODS.map((m) => (
              <label
                key={m.id}
                className="row-check cursor-pointer"
                onClick={() => {
                  applyMood(m.id);
                  setMoodOpen(false);
                }}
              >
                <input type="radio" checked={mood === m.id} readOnly />
                <span className="flex-1">{m.label}</span>
              </label>
            ))}
          </div>
        )}

        <button
          className="rail-btn"
          onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
          <span className="rail-tip">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
        </button>
      </div>
    </aside>
  );
}

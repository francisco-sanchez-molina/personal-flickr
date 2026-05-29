import { useEffect, useState, type ReactNode } from "react";
import { MOODS, useThemePreferences } from "~/lib/theme";
import { Icons } from "../icons";

/**
 * Pretty-print byte counts. Stops at GB because anything bigger doesn't
 * fit cleanly in the rail chip — at TB scale you're probably running into
 * other issues than label width.
 */
function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

interface DiskUsage {
  totalBytes: number;
  photos: number;
  thumbs: number;
  bases: number;
}

/**
 * Polls the disk-usage endpoint every 60 s once mounted. The endpoint itself
 * memoizes for 60 s, so this is mostly a "stay fresh while the tab is open"
 * heartbeat — the actual filesystem walk happens once per minute server-side.
 */
function useDiskUsage(): DiskUsage | null {
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/disk-usage");
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as DiskUsage;
        if (!cancelled) setUsage(body);
      } catch {
        /* network blip — try next tick */
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return usage;
}

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
  const { mood, theme, setMood, toggleTheme } = useThemePreferences();
  const [moodOpen, setMoodOpen] = useState(false);
  const disk = useDiskUsage();

  const items: { id: Props["current"]; icon: ReactNode; label: string; href: string }[] = [
    { id: "home", icon: <Icons.Home />, label: "Inicio", href: "/" },
    { id: "photos", icon: <Icons.Photos />, label: "Fotos", href: "/?view=photos" },
    { id: "galleries", icon: <Icons.Folder />, label: "Galerías", href: "/?view=galleries" },
    { id: "favorites", icon: <Icons.Heart />, label: "Favoritas", href: "/?view=favorites" },
    { id: "tags", icon: <Icons.Tag />, label: "Etiquetas", href: "/?view=tags" },
    { id: "map", icon: <Icons.Map />, label: "Mapa", href: "/?view=map" },
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
              aria-current={current === it.id ? "page" : undefined}
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
                  setMood(m.id);
                  setMoodOpen(false);
                }}
              >
                <input type="radio" checked={mood === m.id} readOnly />
                <span className="flex-1">{m.longLabel}</span>
              </label>
            ))}
          </div>
        )}

        <button
          className="rail-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
          <span className="rail-tip">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
        </button>

        {disk && (
          <div
            className="rail-btn"
            // Decorative: just a static label, not an action. Title surfaces
            // the breakdown without taking sidebar real estate.
            title={`Fotos ${fmtBytes(disk.photos)} · Bases ${fmtBytes(disk.bases)} · Thumbs ${fmtBytes(disk.thumbs)}`}
            aria-label={`Espacio en disco: ${fmtBytes(disk.totalBytes)}`}
          >
            <span className="font-mono text-[10px] tracking-[.05em] leading-none text-ink-3">
              {fmtBytes(disk.totalBytes)}
            </span>
            <span className="rail-tip">
              Disco · {fmtBytes(disk.totalBytes)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icons } from "../icons";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import MobileMenu from "./MobileMenu";

/**
 * A crumb in the breadcrumb chain. `href` is omitted for the last (current)
 * crumb so it renders as plain text rather than a link.
 */
interface Crumb {
  name: string;
  href?: string;
}

interface Props {
  /** Optional plain title (used when there's no breadcrumb chain). */
  title?: string;
  /**
   * Chain of crumbs rendered left-to-right with `/` separators. The last
   * one is treated as the current location (no link).  When this is set,
   * `title` is ignored.
   */
  breadcrumb?: Crumb[];
  /** Used by the mobile menu to mark the current nav item. */
  current?:
    | "home"
    | "photos"
    | "galleries"
    | "favorites"
    | "tags"
    | "map"
    | "other";
  /** Logged-in username, surfaced in the mobile menu next to "Salir". */
  username?: string | null;
}

export default function Topbar({ title, breadcrumb, current, username }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = String(fd.get("q") ?? "").trim();
    if (!q) return;
    const u = new URL(window.location.href);
    u.searchParams.set("q", q);
    window.location.assign(u.toString());
  };

  const openUploader = () =>
    window.dispatchEvent(new CustomEvent("uploader:open"));

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb flex min-w-0 items-center gap-2.5">
        {breadcrumb && breadcrumb.length > 0 ? (
          breadcrumb.map((c, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span
                key={`${i}-${c.name}`}
                className="flex min-w-0 items-center gap-2.5"
              >
                {!isLast && c.href ? (
                  <Button variant="ghost" size="sm" href={c.href}>
                    {c.name}
                  </Button>
                ) : (
                  <span className="serif overflow-hidden text-[18px] text-ellipsis whitespace-nowrap text-ink">
                    {c.name}
                  </span>
                )}
                {!isLast && <span className="text-ink-4">/</span>}
              </span>
            );
          })
        ) : (
          <span className="serif text-[20px] text-ink">{title ?? ""}</span>
        )}
      </div>

      <form className="search" onSubmit={onSubmit}>
        <span className="inline-flex text-ink-3">
          <Icons.Search size={16} />
        </span>
        <input
          ref={inputRef}
          name="q"
          placeholder="Buscar fotos, galerías, etiquetas, cámara…"
          defaultValue={
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("q") ?? ""
              : ""
          }
        />
        <kbd>⌘K</kbd>
      </form>
      <div className="topbar-spacer" />
      <Button variant="primary" onClick={openUploader} aria-label="Subir fotos">
        <Icons.Upload size={15} />
        <span className="lbl-d">Subir fotos</span>
      </Button>
      <form method="POST" action="/api/auth/logout" className="lbl-d m-0">
        <Button type="submit" variant="ghost" size="sm">
          Salir
        </Button>
      </form>
      {/* Mobile-only hamburger that opens the drawer with nav + mood + theme + logout */}
      <IconButton
        className="menu-toggle"
        onClick={() => setMenuOpen(true)}
        aria-label="Menú"
      >
        <Icons.Menu size={16} />
      </IconButton>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        current={current}
        username={username}
      />
    </header>
  );
}

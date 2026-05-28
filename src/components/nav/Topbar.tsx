import { useEffect, useRef, useState } from "react";
import { Icons } from "../icons";
import MobileMenu from "./MobileMenu";

interface Props {
  /** Optional breadcrumb shown on the left of the topbar. */
  title?: string;
  /** Slug for back-to-galleries chip. If set, shows breadcrumb 'Galerías / title'. */
  breadcrumb?: { parent: string; parentHref: string; title: string };
  /** Used by the mobile menu to mark the current nav item. */
  current?:
    | "home"
    | "photos"
    | "galleries"
    | "favorites"
    | "tags"
    | "map"
    | "other";
}

export default function Topbar({ title, breadcrumb, current }: Props) {
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
        {breadcrumb ? (
          <>
            <a className="btn ghost sm" href={breadcrumb.parentHref}>
              {breadcrumb.parent}
            </a>
            <span className="text-ink-4">/</span>
            <span className="serif overflow-hidden text-[18px] text-ellipsis whitespace-nowrap text-ink">
              {breadcrumb.title}
            </span>
          </>
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
      <button
        className="btn primary"
        onClick={openUploader}
        aria-label="Subir fotos"
      >
        <Icons.Upload size={15} />
        <span className="lbl-d">Subir fotos</span>
      </button>
      <form
        method="POST"
        action="/api/auth/logout"
        className="lbl-d m-0"
      >
        <button type="submit" className="btn ghost sm">
          Salir
        </button>
      </form>
      {/* Mobile-only hamburger that opens the drawer with nav + mood + theme + logout */}
      <button
        className="iconbtn menu-toggle"
        onClick={() => setMenuOpen(true)}
        aria-label="Menú"
      >
        <Icons.Menu size={16} />
      </button>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        current={current}
      />
    </header>
  );
}

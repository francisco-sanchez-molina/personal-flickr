import { useEffect, useRef } from "react";
import { Icons } from "./icons";

interface Props {
  /** Optional breadcrumb shown on the left of the topbar. */
  title?: string;
  /** Slug for back-to-galleries chip. If set, shows breadcrumb 'Galerías / title'. */
  breadcrumb?: { parent: string; parentHref: string; title: string };
}

export default function Topbar({ title, breadcrumb }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

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
    // Naive: just reflect to URL — search filtering is a follow-up commit
    const u = new URL(window.location.href);
    u.searchParams.set("q", q);
    window.location.assign(u.toString());
  };

  const openUploader = () =>
    window.dispatchEvent(new CustomEvent("uploader:open"));

  return (
    <header className="topbar">
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        {breadcrumb ? (
          <>
            <a className="btn ghost sm" href={breadcrumb.parentHref}>
              {breadcrumb.parent}
            </a>
            <span style={{ color: "var(--ink-4)" }}>/</span>
            <span
              className="serif"
              style={{
                fontSize: 18,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {breadcrumb.title}
            </span>
          </>
        ) : (
          <span className="serif" style={{ fontSize: 20, color: "var(--ink)" }}>
            {title ?? ""}
          </span>
        )}
      </div>

      <form className="search" onSubmit={onSubmit}>
        <span style={{ color: "var(--ink-3)", display: "inline-flex" }}>
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
      <button className="btn primary" onClick={openUploader} aria-label="Subir fotos">
        <Icons.Upload size={15} />
        <span className="lbl-d">Subir fotos</span>
      </button>
      <form method="POST" action="/api/auth/logout" style={{ margin: 0 }} className="lbl-d">
        <button type="submit" className="btn ghost sm">
          Salir
        </button>
      </form>
    </header>
  );
}

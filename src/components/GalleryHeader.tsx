import { useState } from "react";
import { Icons } from "./icons";

interface Gallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

export default function GalleryHeader({
  gallery: initialGallery,
  inline = false,
}: {
  gallery: Gallery;
  /** Kept for backwards-compat with the page that still passes it. */
  initialPhotoCount?: number;
  /** Inline mode shows only action buttons (used inside the hero). */
  inline?: boolean;
}) {
  const [gallery, setGallery] = useState(initialGallery);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(gallery.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      if (body.gallery.slug !== gallery.slug) {
        window.location.href = `/g/${body.gallery.slug}`;
        return;
      }
      setGallery(body.gallery);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `¿Borrar la galería "${gallery.name}"? Las fotos no se eliminan, solo dejan de pertenecer a esta galería.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (inline) {
    return (
      <>
        <button className="btn primary" onClick={() => setEditing((v) => !v)}>
          <Icons.Sliders size={14} /> Renombrar
        </button>
        <button className="btn" onClick={remove} disabled={busy}>
          <Icons.Trash size={14} /> Eliminar
        </button>
        {editing && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              background: "rgba(0,0,0,.6)",
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditing(false);
            }}
          >
            <div
              className="modal-card"
              style={{ width: "min(420px, 100%)", padding: 0 }}
            >
              <div className="modal-head">
                <h2>Renombrar galería</h2>
                <button
                  className="iconbtn"
                  onClick={() => setEditing(false)}
                  aria-label="Cerrar"
                >
                  <Icons.Close size={15} />
                </button>
              </div>
              <div className="modal-body">
                <form
                  style={{ display: "grid", gap: 12 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  <div className="search" style={{ padding: 10 }}>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      placeholder="Nombre"
                    />
                  </div>
                  {error && (
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
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setEditing(false)}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn primary" disabled={busy}>
                      Guardar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

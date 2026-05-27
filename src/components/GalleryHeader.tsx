import { useState } from "react";
import { Icons } from "./icons";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";

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
        window.location.href = "/?view=galleries";
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!inline) return null;

  return (
    <>
      <button className="btn primary" onClick={() => setEditing(true)}>
        <Icons.Sliders size={14} /> Renombrar
      </button>
      <button className="btn" onClick={remove} disabled={busy}>
        <Icons.Trash size={14} /> Eliminar
      </button>

      <Dialog
        open={editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(false);
            setName(gallery.name);
            setError(null);
          }
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Renombrar galería</DialogTitle>
            <DialogClose asChild>
              <button className="iconbtn" aria-label="Cerrar">
                <Icons.Close size={15} />
              </button>
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            Cambia el nombre de la galería; el slug se regenera
            automáticamente
          </DialogDescription>
          <DialogBody>
            <form
              id="rename-form"
              style={{ display: "grid", gap: 10 }}
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
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="btn ghost">
                Cancelar
              </button>
            </DialogClose>
            <button
              type="submit"
              form="rename-form"
              className="btn primary"
              disabled={busy}
            >
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

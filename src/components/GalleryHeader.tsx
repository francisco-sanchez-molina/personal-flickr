import { useState } from "react";

interface Gallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

export default function GalleryHeader({
  gallery: initialGallery,
  initialPhotoCount,
}: {
  gallery: Gallery;
  initialPhotoCount: number;
}) {
  const [gallery, setGallery] = useState(initialGallery);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(gallery.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoCount] = useState(initialPhotoCount);

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
      // If the slug changed, navigate to the new URL
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

  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-800 pb-3">
      <div className="min-w-0">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-2xl font-semibold outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-pink-500 px-3 py-1 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(gallery.name);
              }}
              className="rounded-md border border-neutral-800 px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <h1 className="truncate text-2xl font-semibold">{gallery.name}</h1>
        )}
        <p className="mt-1 text-sm text-neutral-400">
          {photoCount} {photoCount === 1 ? "foto" : "fotos"}
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
      </div>

      {!editing && (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-neutral-800 px-3 py-1 text-sm hover:bg-neutral-800"
          >
            Renombrar
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-red-700/40 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            Eliminar galería
          </button>
        </div>
      )}
    </header>
  );
}

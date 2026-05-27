import { useEffect, useRef, useState } from "react";

interface Gallery {
  id: number;
  slug: string;
  name: string;
}

interface BulkActionBarProps {
  count: number;
  selectedIds: number[];
  /** If set, we're inside a gallery → expose 'Quitar de galería'. */
  galleryId?: number;
  onCancel: () => void;
  onRemoveFromGallery: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  /** Called after a successful bulk-add (to clear selection). */
  onAdded: () => void;
}

export default function BulkActionBar({
  count,
  selectedIds,
  galleryId,
  onCancel,
  onRemoveFromGallery,
  onDelete,
  onAdded,
}: BulkActionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/80"
        role="toolbar"
        aria-label="Acciones en lote"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-neutral-100">{count}</span>
            <span className="text-neutral-400">
              {" "}seleccionada{count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPickerOpen(true)}
              className="rounded-md bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600"
            >
              + Añadir a galería
            </button>
            {galleryId != null && (
              <button
                onClick={onRemoveFromGallery}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Quitar de esta galería
              </button>
            )}
            {galleryId == null && (
              <button
                onClick={onDelete}
                className="rounded-md border border-red-700/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                Eliminar
              </button>
            )}
            <button
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <BulkGalleryPicker
          photoIds={selectedIds}
          onClose={() => setPickerOpen(false)}
          onDone={() => {
            setPickerOpen(false);
            onAdded();
          }}
        />
      )}
    </>
  );
}

// ── BulkGalleryPicker (modal) ───────────────────────────────────────

function BulkGalleryPicker({
  photoIds,
  onClose,
  onDone,
}: {
  photoIds: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState<Gallery[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/galleries")
      .then((r) => r.json())
      .then((body) => setAll(body.galleries ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      setAll((g) => [body.gallery, ...g]);
      setSelected((s) => new Set([...s, body.gallery.id]));
      setNewName("");
      setCreating(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (selected.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Add the same photo set to each chosen gallery.
      // INSERT OR IGNORE makes this safe to re-run.
      const results = await Promise.all(
        Array.from(selected).map((gid) =>
          fetch(`/api/galleries/${gid}/photos`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ photo_ids: photoIds }),
          }).then((r) => r.json().then((b) => ({ ok: r.ok, body: b }))),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} galería(s) fallaron: ${failed
            .map((f) => f.body?.error ?? "?")
            .join(", ")}`,
        );
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">
            Añadir {photoIds.length} foto{photoIds.length === 1 ? "" : "s"} a…
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-500">
              cargando galerías…
            </p>
          ) : all.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-500">
              Aún no hay galerías. Crea una ↓
            </p>
          ) : (
            <ul className="space-y-0.5">
              {all.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-neutral-900">
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                      className="accent-pink-500"
                    />
                    <span className="truncate">{g.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-neutral-800 p-2">
          {creating ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                createNew();
              }}
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la galería"
                maxLength={80}
                className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                className="rounded-md bg-pink-500 px-2 py-1 text-xs font-medium text-white hover:bg-pink-600"
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="px-1 text-neutral-500 hover:text-neutral-100"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-md border border-dashed border-neutral-700 px-2 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
            >
              + Nueva galería
            </button>
          )}
        </div>

        {error && (
          <p className="border-t border-red-700/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-800 px-3 py-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || loading || selected.size === 0}
            className="rounded-md bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {saving
              ? "Añadiendo…"
              : `Añadir a ${selected.size} galería${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

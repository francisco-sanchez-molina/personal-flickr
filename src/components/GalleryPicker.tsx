import { useEffect, useRef, useState } from "react";

interface Gallery {
  id: number;
  slug: string;
  name: string;
}

export default function GalleryPicker({
  photoId,
  onClose,
}: {
  photoId: number;
  onClose: () => void;
}) {
  const [all, setAll] = useState<Gallery[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Visual hint while a PUT is in flight (subtle, no blocking spinner)
  const [pendingId, setPendingId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load all galleries + the ones this photo belongs to
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/galleries").then((r) => r.json()),
      fetch(`/api/photos/${photoId}/galleries`).then((r) => r.json()),
    ])
      .then(([listRes, photoRes]) => {
        if (cancelled) return;
        setAll(listRes.galleries ?? []);
        setSelected(
          new Set((photoRes.galleries ?? []).map((g: Gallery) => g.id)),
        );
      })
      .catch((e) => setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  // Click outside closes
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  /**
   * Toggle a gallery membership. Optimistic: flip state immediately, then
   * PUT the new full snapshot. Reverts on failure.
   */
  const persistSet = async (next: Set<number>) => {
    setError(null);
    try {
      const res = await fetch(`/api/photos/${photoId}/galleries`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gallery_ids: Array.from(next) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
    } catch (e: unknown) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  const toggle = async (id: number) => {
    const prev = selected;
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    setSelected(next);
    setPendingId(id);
    try {
      await persistSet(next);
    } catch (e: unknown) {
      // Revert
      setSelected(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId((cur) => (cur === id ? null : cur));
    }
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

      const newId: number = body.gallery.id;
      const next = new Set([...selected, newId]);
      setAll((g) => [body.gallery, ...g]);
      setSelected(next);
      setNewName("");
      setCreating(false);
      // Persist the new membership immediately
      setPendingId(newId);
      try {
        await persistSet(next);
      } catch (e: unknown) {
        // The gallery was created, just the photo membership failed.
        // Revert membership only.
        setSelected(selected);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingId((cur) => (cur === newId ? null : cur));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-2 top-full z-50 mt-2 w-72 rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-sm">
        <span className="font-medium">Añadir a galerías</span>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-100"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-3 text-sm text-neutral-500">cargando…</p>
        ) : all.length === 0 ? (
          <p className="px-2 py-3 text-sm text-neutral-500">
            Aún no hay galerías. Crea la primera ↓
          </p>
        ) : (
          <ul className="space-y-0.5">
            {all.map((g) => {
              const isPending = pendingId === g.id;
              return (
                <li key={g.id}>
                  <label
                    className={[
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-900",
                      isPending ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                      className="accent-pink-500"
                    />
                    <span className="truncate">{g.name}</span>
                  </label>
                </li>
              );
            })}
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
              placeholder="Nombre"
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
              aria-label="Cancelar"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full rounded-md border border-dashed border-neutral-700 px-2 py-1.5 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
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
    </div>
  );
}

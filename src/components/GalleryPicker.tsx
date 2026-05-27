import { useEffect, useState, type ReactNode } from "react";
import { Icons } from "./icons";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/Popover";

interface Gallery {
  id: number;
  slug: string;
  name: string;
}

/**
 * Pop-over picker anchored to its trigger. Each checkbox toggle persists
 * immediately to the server via PUT /api/photos/[id]/galleries (the full
 * snapshot is sent each time). On success, broadcasts
 * `photo:memberships-changed` so other views (e.g. the Sin galería list)
 * react in real time.
 *
 *   <GalleryPicker photoId={42}>
 *     <button className="btn">Galerías</button>
 *   </GalleryPicker>
 */
export default function GalleryPicker({
  photoId,
  children,
}: {
  photoId: number;
  /** The trigger element. Wraps with Radix `asChild` semantics. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Gallery[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  // Load galleries + this photo's memberships whenever we open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
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
  }, [open, photoId]);

  const persistSet = async (next: Set<number>) => {
    setError(null);
    const ids = Array.from(next);
    const res = await fetch(`/api/photos/${photoId}/galleries`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gallery_ids: ids }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? body.error ?? "error");
    }
    window.dispatchEvent(
      new CustomEvent("photo:memberships-changed", {
        detail: { photoId, galleryIds: ids },
      }),
    );
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
      setPendingId(newId);
      try {
        await persistSet(next);
      } catch (e: unknown) {
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="bottom" align="end" style={{ width: 280 }}>
        <PopoverHeader>
          <PopoverTitle>Añadir a galerías</PopoverTitle>
        </PopoverHeader>

        <div style={{ maxHeight: 280, overflowY: "auto", margin: "0 -4px" }}>
          {loading ? (
            <p
              style={{
                margin: 0,
                padding: "6px 4px",
                color: "var(--ink-3)",
                fontSize: 12.5,
              }}
            >
              cargando…
            </p>
          ) : all.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "6px 4px",
                color: "var(--ink-3)",
                fontSize: 12.5,
              }}
            >
              Aún no hay galerías. Crea la primera ↓
            </p>
          ) : (
            all.map((g) => (
              <label
                key={g.id}
                className={`row-check ${pendingId === g.id ? "pending" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => toggle(g.id)}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.name}
                </span>
              </label>
            ))
          )}
        </div>

        <div
          style={{ height: 1, background: "var(--line)", margin: "8px -4px" }}
        />

        {creating ? (
          <form
            style={{ display: "flex", gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              createNew();
            }}
          >
            <div className="search" style={{ padding: "5px 8px", flex: 1 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre"
                maxLength={80}
              />
            </div>
            <button type="submit" className="btn primary sm">
              Crear
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            className="btn ghost sm"
            onClick={() => setCreating(true)}
            style={{
              width: "100%",
              justifyContent: "center",
              borderStyle: "dashed",
              borderColor: "var(--line-2)",
            }}
          >
            <Icons.Plus size={13} /> Nueva galería
          </button>
        )}

        {error && (
          <p
            style={{
              margin: "10px 0 0",
              color: "var(--danger)",
              fontSize: 12,
              fontFamily: "var(--f-mono)",
            }}
          >
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";

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
  const [pendingId, setPendingId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

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
    <div
      ref={panelRef}
      className="pop"
      style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 280 }}
      onClick={(e) => e.stopPropagation()}
    >
      <h5>Añadir a galerías</h5>

      <div style={{ maxHeight: 280, overflowY: "auto", margin: "0 -4px" }}>
        {loading ? (
          <p style={{ margin: 0, padding: "6px 4px", color: "var(--ink-3)", fontSize: 12.5 }}>
            cargando…
          </p>
        ) : all.length === 0 ? (
          <p style={{ margin: 0, padding: "6px 4px", color: "var(--ink-3)", fontSize: 12.5 }}>
            Aún no hay galerías. Crea la primera ↓
          </p>
        ) : (
          all.map((g) => (
            <label
              key={g.id}
              className={`row-check ${pendingId === g.id ? "pending" : ""}`}
              style={{ padding: "6px 4px" }}
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

      <div style={{ height: 1, background: "var(--line)", margin: "8px -4px" }} />

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
    </div>
  );
}

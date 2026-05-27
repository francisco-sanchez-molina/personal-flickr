import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";

interface Gallery {
  id: number;
  slug: string;
  name: string;
}

interface BulkActionBarProps {
  count: number;
  selectedIds: number[];
  allFavorite: boolean;
  galleryId?: number;
  onCancel: () => void;
  onRemoveFromGallery: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onFavorite: (value: boolean) => Promise<void> | void;
  onAdded: () => void;
}

export default function BulkActionBar({
  count,
  selectedIds,
  allFavorite,
  galleryId,
  onCancel,
  onRemoveFromGallery,
  onDelete,
  onFavorite,
  onAdded,
}: BulkActionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className="bulkbar" role="toolbar" aria-label="Acciones en lote">
        <div className="inner">
          <div className="count">
            <strong>{count}</strong>
            seleccionada{count === 1 ? "" : "s"}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => setPickerOpen(true)}>
              <Icons.Folder size={14} /> Añadir a galería
            </button>
            <button
              className="btn"
              onClick={() => onFavorite(!allFavorite)}
              style={{ color: "var(--accent)" }}
            >
              {allFavorite ? (
                <>
                  <Icons.Star size={14} /> Quitar favorito
                </>
              ) : (
                <>
                  <Icons.StarFill size={14} /> Favorito
                </>
              )}
            </button>
            {galleryId != null && (
              <button className="btn" onClick={onRemoveFromGallery}>
                Quitar de esta galería
              </button>
            )}
            {galleryId == null && (
              <button className="btn danger" onClick={onDelete}>
                <Icons.Trash size={14} /> Eliminar
              </button>
            )}
            <button className="btn ghost" onClick={onCancel}>
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/galleries")
      .then((r) => r.json())
      .then((body) => setAll(body.galleries ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

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
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" ref={ref} style={{ width: "min(480px, 100%)" }}>
        <div className="modal-head">
          <h2>
            Añadir {photoIds.length} foto{photoIds.length === 1 ? "" : "s"}
          </h2>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icons.Close size={15} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 14 }}>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {loading ? (
              <p
                style={{
                  margin: 0,
                  padding: "16px 6px",
                  color: "var(--ink-3)",
                  fontSize: 13,
                }}
              >
                cargando galerías…
              </p>
            ) : all.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "16px 6px",
                  color: "var(--ink-3)",
                  fontSize: 13,
                }}
              >
                Aún no hay galerías. Crea la primera ↓
              </p>
            ) : (
              all.map((g) => (
                <label key={g.id} className="row-check">
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggle(g.id)}
                  />
                  <span style={{ flex: 1 }}>{g.name}</span>
                </label>
              ))
            )}
          </div>

          <div className="divider" />

          {creating ? (
            <form
              style={{ display: "flex", gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                createNew();
              }}
            >
              <div className="search" style={{ padding: "6px 10px", flex: 1 }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={80}
                  placeholder="Nombre de la galería"
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
              marginTop: 14,
            }}
          >
            <button className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={saving || loading || selected.size === 0}
            >
              {saving
                ? "Añadiendo…"
                : `Añadir a ${selected.size} galería${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

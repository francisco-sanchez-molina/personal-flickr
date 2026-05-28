import { useEffect, useState } from "react";
import NewGalleryForm from "../gallery/NewGalleryForm";
import { Icons } from "../icons";
import ErrorText from "../ui/ErrorText";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";

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
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn primary" onClick={() => setPickerOpen(true)}>
              <Icons.Folder size={14} /> Añadir a galería
            </button>
            <button
              className="btn text-accent"
              onClick={() => onFavorite(!allFavorite)}
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

      <BulkGalleryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        photoIds={selectedIds}
        onDone={() => {
          setPickerOpen(false);
          onAdded();
        }}
      />
    </>
  );
}

function BulkGalleryPicker({
  open,
  onOpenChange,
  photoIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoIds: number[];
  onDone: () => void;
}) {
  const [all, setAll] = useState<Gallery[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    setError(null);
    fetch("/api/galleries")
      .then((r) => r.json())
      .then((body) => setAll(body.galleries ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onGalleryCreated = (g: Gallery) => {
    setAll((arr) => [g, ...arr]);
    // Auto-select the newly created one so a quick "create + save" works.
    setSelected((s) => new Set([...s, g.id]));
  };

  const save = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            Añadir {photoIds.length} foto{photoIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogClose asChild>
            <button className="iconbtn" aria-label="Cerrar">
              <Icons.Close size={15} />
            </button>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>Seleccionar galerías destino</DialogDescription>
        <DialogBody>
          <div className="mb-3 max-h-80 overflow-y-auto">
            {loading ? (
              <p className="m-0 px-1.5 py-4 text-[13px] text-ink-3">
                cargando galerías…
              </p>
            ) : all.length === 0 ? (
              <p className="m-0 px-1.5 py-4 text-[13px] text-ink-3">
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
                  <span className="flex-1">{g.name}</span>
                </label>
              ))
            )}
          </div>

          <NewGalleryForm onCreated={onGalleryCreated} />

          <ErrorText message={error} className="mt-2.5" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn ghost">Cancelar</button>
          </DialogClose>
          <button
            className="btn primary"
            onClick={save}
            disabled={saving || loading || selected.size === 0}
          >
            {saving
              ? "Añadiendo…"
              : `Añadir a ${selected.size} galería${selected.size === 1 ? "" : "s"}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Smart-albums list + admin (used in `/?view=smart-albums`).
 *
 * Each album is a row with name + a one-line filter summary + actions
 * (open, edit, delete). New ones are created via SmartAlbumBuilder.
 */
import { useState } from "react";
import { Icons } from "../icons";
import Button from "../ui/Button";
import { useConfirm } from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import ErrorText from "../ui/ErrorText";
import IconButton from "../ui/IconButton";
import SmartAlbumBuilder, { type SmartFilter } from "./SmartAlbumBuilder";

interface SmartAlbum {
  id: number;
  name: string;
  filter: SmartFilter;
}

/** Render a one-line summary of which filters are active. */
function filterSummary(f: SmartFilter): string {
  const bits: string[] = [];
  if (f.camera) bits.push(`cámara ${f.camera}`);
  if (f.lens) bits.push(`obj. ${f.lens}`);
  if (f.kind) bits.push(f.kind === "video" ? "vídeo" : "foto");
  if (f.isFavorite) bits.push("favoritas");
  if (f.withoutGallery) bits.push("sin galería");
  if (f.isoMin != null || f.isoMax != null) {
    bits.push(
      `ISO ${f.isoMin ?? "—"}–${f.isoMax ?? "—"}`.replace("—–", "≤").replace("–—", "≥"),
    );
  }
  if (f.fstopMin != null || f.fstopMax != null) {
    bits.push(`ƒ ${f.fstopMin ?? "—"}–${f.fstopMax ?? "—"}`);
  }
  if (f.takenFrom || f.takenTo) {
    const fmt = (ms?: number) =>
      ms ? new Date(ms).toLocaleDateString("es-ES") : "—";
    bits.push(`capturado ${fmt(f.takenFrom)} → ${fmt(f.takenTo)}`);
  }
  return bits.length === 0 ? "sin filtros — coincide con todo" : bits.join(" · ");
}

export default function SmartAlbumsManager({
  initial,
}: {
  initial: SmartAlbum[];
}) {
  const [albums, setAlbums] = useState<SmartAlbum[]>(initial);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<SmartAlbum | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const openCreate = () => {
    setEditing(undefined);
    setBuilderOpen(true);
  };

  const openEdit = (album: SmartAlbum) => {
    setEditing(album);
    setBuilderOpen(true);
  };

  const onSaved = (album: SmartAlbum) => {
    setAlbums((arr) => {
      const idx = arr.findIndex((a) => a.id === album.id);
      if (idx >= 0) {
        const copy = arr.slice();
        copy[idx] = album;
        return copy;
      }
      return [album, ...arr];
    });
  };

  const remove = async (album: SmartAlbum) => {
    const ok = await confirm({
      title: `¿Borrar "${album.name}"?`,
      description: "El smart album es un filtro guardado — las fotos no se tocan.",
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/smart-albums/${album.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
      setAlbums((arr) => arr.filter((a) => a.id !== album.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Icons.Plus size={13} /> Nuevo smart album
        </Button>
      </div>

      {albums.length === 0 ? (
        <EmptyState
          title="Aún no tienes smart albums."
          sub="Define un filtro (cámara, ISO, fechas…) y guárdalo para volver con un toque."
        />
      ) : (
        <div className="grid gap-2">
          {albums.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-line bg-bg-2 px-3.5 py-2.5"
            >
              <a
                href={`/?view=smart&id=${a.id}`}
                className="flex-1 min-w-0 text-inherit no-underline"
              >
                <div className="serif text-[16px] text-ink">{a.name}</div>
                <div className="mt-0.5 font-mono text-[11.5px] tracking-[.02em] text-ink-3">
                  {filterSummary(a.filter)}
                </div>
              </a>
              <IconButton
                onClick={() => openEdit(a)}
                aria-label={`Editar ${a.name}`}
                title="Editar"
              >
                <Icons.Sliders size={14} />
              </IconButton>
              <IconButton
                onClick={() => remove(a)}
                aria-label={`Borrar ${a.name}`}
                title="Borrar"
              >
                <Icons.Trash size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <ErrorText message={error} className="mt-3" />

      <SmartAlbumBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editing={editing}
        onSaved={onSaved}
      />
    </>
  );
}

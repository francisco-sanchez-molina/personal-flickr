/**
 * Photo collection view — the home/galleries/favorites/orphans entrypoint.
 * Owns the photo list state (so it can react to `photo:added` and
 * `photo:memberships-changed` events from elsewhere in the app) and
 * orchestrates three things:
 *
 *   1. PhotoGrid           — the masonry render
 *   2. useGridSelection    — shift/⌘-click, long-press, ⌘A/Esc
 *   3. Lightbox + BulkBar  — mounted conditionally based on state above
 *
 * Server-rendered API calls (favorite, delete, gallery membership) live here
 * because they need to roll back optimistic state if the network fails.
 */
import { useCallback, useEffect, useState } from "react";
import type { Photo } from "~/lib/db";
import BulkActionBar from "../bulk/BulkActionBar";
import Lightbox from "../lightbox/Lightbox";
import PhotoGrid from "./PhotoGrid";
import { useGridSelection } from "./hooks/useGridSelection";

interface Props {
  initial: Photo[];
  /** When set, scope is "photos in this gallery" — affects delete + filter. */
  galleryId?: number;
  /** When true, this is the orphans view — drop photos that gain a gallery. */
  orphans?: boolean;
}

export default function Gallery({ initial, galleryId, orphans }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [active, setActive] = useState<number | null>(null);
  const isLightboxOpen = active != null;

  const selection = useGridSelection({
    items: photos,
    isLightboxOpen,
    onOpen: setActive,
  });

  // ──────────────── External photo events ────────────────

  // Photos added globally (from Uploader) — prepend, dedup by name.
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (
        e as CustomEvent<{ photo: Photo; galleryId: number | null }>
      ).detail;
      if (galleryId != null && detail.galleryId !== galleryId) return;
      const photo = detail.photo;
      setPhotos((p) => {
        const filtered = p.filter((x) => x.name !== photo.name);
        return [photo, ...filtered];
      });
    };
    window.addEventListener("photo:added", onAdded);
    return () => window.removeEventListener("photo:added", onAdded);
  }, [galleryId]);

  // Membership changes — drop from current view when the scope no longer
  // applies (e.g. orphans view loses photos that gained a gallery; a gallery
  // view loses photos removed from it).
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (
        e as CustomEvent<{ photoId: number; galleryIds: number[] }>
      ).detail;
      if (orphans && d.galleryIds.length > 0) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
        return;
      }
      if (galleryId != null && !d.galleryIds.includes(galleryId)) {
        setPhotos((p) => p.filter((x) => x.id !== d.photoId));
      }
    };
    window.addEventListener("photo:memberships-changed", onChange);
    return () =>
      window.removeEventListener("photo:memberships-changed", onChange);
  }, [galleryId, orphans]);

  // ←/→/Esc in the lightbox
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (active == null) return;
      if (e.key === "Escape") setActive(null);
      if (e.key === "ArrowRight") setActive((i) => (i! + 1) % photos.length);
      if (e.key === "ArrowLeft")
        setActive((i) => (i! - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos.length]);

  // ──────────────── Mutations ────────────────

  const updatePhoto = useCallback((id: number, patch: Partial<Photo>) => {
    setPhotos((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const remove = useCallback(
    async (id: number) => {
      if (galleryId != null) {
        if (!confirm("¿Quitar esta foto de la galería? (no se borra del disco)"))
          return;
        const res = await fetch(`/api/galleries/${galleryId}/photos/${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setPhotos((p) => p.filter((x) => x.id !== id));
          setActive(null);
        }
        return;
      }
      if (!confirm("¿Eliminar esta foto? Se borra el archivo del disco.")) return;
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPhotos((p) => p.filter((x) => x.id !== id));
        setActive(null);
      }
    },
    [galleryId],
  );

  const toggleFavorite = useCallback(
    async (id: number) => {
      const cur = photos.find((p) => p.id === id);
      if (!cur) return;
      const next = cur.is_favorite ? 0 : 1;
      updatePhoto(id, { is_favorite: next });
      try {
        const res = await fetch(`/api/photos/${id}/favorite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: next === 1 }),
        });
        if (!res.ok) throw new Error();
      } catch {
        // Roll back the optimistic flip.
        updatePhoto(id, { is_favorite: cur.is_favorite });
      }
    },
    [photos, updatePhoto],
  );

  // ──────────────── Bulk actions ────────────────

  const bulkRemoveFromGallery = useCallback(async () => {
    if (galleryId == null) return;
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Quitar ${ids.length} foto${ids.length === 1 ? "" : "s"} de esta galería?`,
      )
    )
      return;
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/galleries/${galleryId}/photos/${id}`, { method: "DELETE" }),
      ),
    );
    setPhotos((p) => p.filter((x) => !selection.selected.has(x.id)));
    selection.clear();
  }, [galleryId, selection]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Eliminar ${ids.length} foto${ids.length === 1 ? "" : "s"} del disco? Esto es irreversible.`,
      )
    )
      return;
    await Promise.all(
      ids.map((id) => fetch(`/api/photos/${id}`, { method: "DELETE" })),
    );
    setPhotos((p) => p.filter((x) => !selection.selected.has(x.id)));
    selection.clear();
  }, [selection]);

  const bulkFavorite = useCallback(
    async (value: boolean) => {
      const ids = Array.from(selection.selected);
      if (ids.length === 0) return;
      setPhotos((arr) =>
        arr.map((x) =>
          selection.selected.has(x.id) ? { ...x, is_favorite: value ? 1 : 0 } : x,
        ),
      );
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/photos/${id}/favorite`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
          }),
        ),
      );
      selection.clear();
    },
    [selection],
  );

  const allSelectedAreFavorite = (() => {
    if (selection.selected.size === 0) return false;
    for (const p of photos) {
      if (selection.selected.has(p.id) && p.is_favorite !== 1) return false;
    }
    return true;
  })();

  if (photos.length === 0) return null;

  return (
    <>
      {/* Selection-mode header */}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="font-mono text-[11.5px] tracking-[.04em] text-ink-3">
          {selection.selectMode ? (
            <>
              <strong className="font-ui text-[13px] text-ink">
                {selection.selected.size}
              </strong>{" "}
              seleccionada{selection.selected.size === 1 ? "" : "s"} · click
              para alternar · shift para rango
            </>
          ) : (
            <>click para abrir · shift+click para seleccionar varias</>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {selection.selectMode ? (
            <>
              <button className="btn sm" onClick={selection.selectAll}>
                Todas
              </button>
              <button className="btn ghost sm" onClick={selection.clear}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="btn ghost sm"
              onClick={selection.enterSelectMode}
            >
              Seleccionar
            </button>
          )}
        </div>
      </div>

      <PhotoGrid
        photos={photos}
        selected={selection.selected}
        selectMode={selection.selectMode}
        onItemClick={selection.onItemClick}
        onItemPointerDown={selection.onItemPointerDown}
        cancelLongPress={selection.cancelLongPress}
        onToggleFavorite={toggleFavorite}
      />

      {active != null && photos[active] && (
        <Lightbox
          photos={photos}
          index={active}
          onIndex={setActive}
          onClose={() => setActive(null)}
          onDelete={() => remove(photos[active].id)}
          onToggleFavorite={() => toggleFavorite(photos[active].id)}
          onDeveloped={(developedAt, paramsJson) =>
            updatePhoto(photos[active].id, {
              developed_at: developedAt,
              develop_params: paramsJson,
            })
          }
        />
      )}

      {selection.selected.size > 0 && (
        <BulkActionBar
          count={selection.selected.size}
          selectedIds={Array.from(selection.selected)}
          allFavorite={allSelectedAreFavorite}
          galleryId={galleryId}
          onCancel={selection.clear}
          onRemoveFromGallery={bulkRemoveFromGallery}
          onDelete={bulkDelete}
          onFavorite={bulkFavorite}
          onAdded={selection.clear}
        />
      )}
    </>
  );
}

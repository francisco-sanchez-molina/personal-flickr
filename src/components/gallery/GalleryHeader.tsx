import { useEffect, useState } from "react";
import type { Photo } from "~/lib/db";
import { Icons } from "../icons";
import ActionMenu from "../ui/ActionMenu";
import Button from "../ui/Button";
import CheckboxRow from "../ui/CheckboxRow";
import { useConfirm } from "../ui/ConfirmDialog";
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
import ErrorText from "../ui/ErrorText";
import IconButton from "../ui/IconButton";
import TextField from "../ui/TextField";

interface Gallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  cover_photo_id: number | null;
  parent_id: number | null;
}

interface ParentOption {
  id: number;
  name: string;
  slug: string;
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
  const [coverOpen, setCoverOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [name, setName] = useState(gallery.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

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
    const ok = await confirm({
      title: `¿Borrar la galería "${gallery.name}"?`,
      description: "Las fotos no se eliminan, solo dejan de pertenecer a esta galería.",
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
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

  // Four actions for a gallery: Renombrar / Portada / Mover / Eliminar.
  // Desktop shows them as an inline row inside the hero; mobile collapses
  // them into a single "···" overflow menu (the hero is too narrow at
  // 360px to fit four buttons). React state is shared between the two
  // surfaces — the same Dialogs handle both entry points.
  const items = [
    {
      label: "Renombrar",
      icon: <Icons.Sliders size={13} />,
      onSelect: () => setEditing(true),
    },
    {
      label: "Portada",
      icon: <Icons.Photos size={13} />,
      onSelect: () => setCoverOpen(true),
    },
    {
      label: "Mover",
      icon: <Icons.Folder size={13} />,
      onSelect: () => setMoveOpen(true),
    },
    {
      label: "Eliminar",
      icon: <Icons.Trash size={13} />,
      danger: true,
      disabled: busy,
      onSelect: remove,
    },
  ];

  return (
    <>
      {/* Desktop: inline button row */}
      <div className="hidden items-center gap-1.5 md:flex">
        <Button variant="primary" onClick={() => setEditing(true)}>
          <Icons.Sliders size={14} /> Renombrar
        </Button>
        <Button onClick={() => setCoverOpen(true)}>
          <Icons.Photos size={14} /> Portada
        </Button>
        <Button onClick={() => setMoveOpen(true)}>
          <Icons.Folder size={14} /> Mover
        </Button>
        <Button onClick={remove} disabled={busy}>
          <Icons.Trash size={14} /> Eliminar
        </Button>
      </div>

      {/* Mobile: single "···" overflow menu (same items + handlers) */}
      <div className="md:hidden">
        <ActionMenu
          items={items}
          title="Acciones"
          triggerLabel="Acciones de la galería"
          trigger={
            <Button
              variant="primary"
              aria-label="Acciones de la galería"
              title="Acciones"
            >
              <Icons.More size={15} />
            </Button>
          }
        />
      </div>

      {/* Rename modal */}
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
              <IconButton aria-label="Cerrar">
                <Icons.Close size={15} />
              </IconButton>
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            Cambia el nombre de la galería; el slug se regenera automáticamente
          </DialogDescription>
          <DialogBody>
            <form
              id="rename-form"
              className="grid gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <TextField
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Nombre"
              />
              <ErrorText message={error} />
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              type="submit"
              form="rename-form"
              variant="primary"
              loading={busy}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cover picker — fetches photos lazily, click to pin. */}
      <CoverPickerDialog
        open={coverOpen}
        onOpenChange={setCoverOpen}
        galleryId={gallery.id}
        currentCoverId={gallery.cover_photo_id}
        onChanged={(g) => setGallery(g)}
      />

      {/* Move (reparent) — fetches top-level galleries to choose from. */}
      <MoveGalleryDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        galleryId={gallery.id}
        currentParentId={gallery.parent_id}
        onChanged={(g) => {
          setGallery(g);
          // Re-parenting can leave the gallery in a different breadcrumb;
          // reload so the topbar / hero pick the new context up.
          window.location.reload();
        }}
      />
    </>
  );
}

// ──────────────── cover picker ────────────────

function CoverPickerDialog({
  open,
  onOpenChange,
  galleryId,
  currentCoverId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  galleryId: number;
  currentCoverId: number | null;
  onChanged: (gallery: Gallery) => void;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPhotos(null);
    fetch(`/api/galleries/${galleryId}/photos`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setPhotos((body.photos ?? []) as Photo[]);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, galleryId]);

  const choose = async (photoId: number | null) => {
    setSaving(photoId ?? -1);
    setError(null);
    try {
      const res = await fetch(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverPhotoId: photoId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      onChanged(body.gallery);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Elegir portada</DialogTitle>
          <DialogClose asChild>
            <IconButton aria-label="Cerrar">
              <Icons.Close size={15} />
            </IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          Pin una foto concreta como portada o deja "Automática" para usar la
          más reciente
        </DialogDescription>
        <DialogBody>
          {photos === null ? (
            <p className="m-0 px-1 py-4 text-[13px] text-ink-3">
              cargando fotos…
            </p>
          ) : photos.length === 0 ? (
            <p className="m-0 px-1 py-4 text-[13px] text-ink-3">
              La galería está vacía.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {/* Automatic option — first cell to make "clear pin" obvious. */}
              <button
                type="button"
                className={`relative aspect-square overflow-hidden rounded-md border ${
                  currentCoverId === null
                    ? "border-accent"
                    : "border-line"
                } bg-bg-3 text-[11px] text-ink-3 hover:border-line-2`}
                disabled={saving !== null}
                onClick={() => choose(null)}
              >
                <span className="absolute inset-0 grid place-items-center font-mono tracking-[.04em] uppercase">
                  Automática
                </span>
              </button>
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`relative aspect-square overflow-hidden rounded-md border ${
                    currentCoverId === p.id
                      ? "border-accent"
                      : "border-line"
                  } bg-bg-3 hover:border-line-2`}
                  disabled={saving !== null}
                  onClick={() => choose(p.id)}
                  aria-label={p.name}
                  title={p.name}
                >
                  <img
                    src={`/files/thumb/${encodeURIComponent(p.name)}?v=${p.developed_at}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <ErrorText message={error} className="mt-3" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────── move (re-parent) ────────────────

function MoveGalleryDialog({
  open,
  onOpenChange,
  galleryId,
  currentParentId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  galleryId: number;
  currentParentId: number | null;
  onChanged: (gallery: Gallery) => void;
}) {
  // Candidates are all top-level galleries minus this one (can't be its own
  // parent). We don't need a full tree because the rule is "max 1 level
  // deep", so children can't themselves be parents.
  const [options, setOptions] = useState<ParentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setOptions(null);
    fetch("/api/galleries")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const all = (body.galleries ?? []) as Array<{
          id: number;
          name: string;
          slug: string;
          parent_id: number | null;
        }>;
        setOptions(
          all
            .filter((g) => g.id !== galleryId && g.parent_id === null)
            .map((g) => ({ id: g.id, name: g.name, slug: g.slug })),
        );
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, galleryId]);

  const choose = async (parentId: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      onChanged(body.gallery);
      onOpenChange(false);
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
          <DialogTitle>Mover galería</DialogTitle>
          <DialogClose asChild>
            <IconButton aria-label="Cerrar">
              <Icons.Close size={15} />
            </IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          Pon esta galería bajo una de nivel superior, o déjala como
          top-level
        </DialogDescription>
        <DialogBody>
          {options === null ? (
            <p className="m-0 px-1 py-4 text-[13px] text-ink-3">cargando…</p>
          ) : (
            <div className="-mx-1 max-h-[280px] overflow-y-auto">
              <CheckboxRow
                type="radio"
                checked={currentParentId === null}
                onChange={() => choose(null)}
                disabled={saving}
                label={
                  <span className="italic text-ink-2">
                    Sin padre (top-level)
                  </span>
                }
              />
              {options.length === 0 ? (
                <p className="m-0 px-1 py-2 text-[12px] text-ink-3">
                  No hay otras galerías top-level.
                </p>
              ) : (
                options.map((o) => (
                  <CheckboxRow
                    key={o.id}
                    type="radio"
                    checked={currentParentId === o.id}
                    onChange={() => choose(o.id)}
                    disabled={saving}
                    label={
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {o.name}
                      </span>
                    }
                  />
                ))
              )}
            </div>
          )}
          <ErrorText message={error} className="mt-3" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

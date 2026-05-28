import { useEffect, useState, type ReactNode } from "react";
import NewGalleryForm from "../gallery/NewGalleryForm";
import CheckboxRow from "../ui/CheckboxRow";
import ErrorText from "../ui/ErrorText";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/Popover";

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

  // After creating a new gallery via the inline form, auto-select it and
  // persist the new membership set in the same trip.
  const onGalleryCreated = async (g: Gallery) => {
    const next = new Set([...selected, g.id]);
    setAll((arr) => [g, ...arr]);
    setSelected(next);
    setPendingId(g.id);
    try {
      await persistSet(next);
    } catch (e: unknown) {
      setSelected(selected);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId((cur) => (cur === g.id ? null : cur));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[280px]">
        <PopoverHeader>
          <PopoverTitle>Añadir a galerías</PopoverTitle>
        </PopoverHeader>

        <div className="-mx-1 max-h-[280px] overflow-y-auto">
          {loading ? (
            <p className="m-0 px-1 py-1.5 text-[12.5px] text-ink-3">cargando…</p>
          ) : all.length === 0 ? (
            <p className="m-0 px-1 py-1.5 text-[12.5px] text-ink-3">
              Aún no hay galerías. Crea la primera ↓
            </p>
          ) : (
            all.map((g) => (
              <CheckboxRow
                key={g.id}
                pending={pendingId === g.id}
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
                label={
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {g.name}
                  </span>
                }
              />
            ))
          )}
        </div>

        <div className="-mx-1 my-2 h-px bg-line" />

        <NewGalleryForm onCreated={onGalleryCreated} variant="compact" />

        <ErrorText message={error} className="mt-2.5" />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Inline "Nueva galería" form, reused from three call sites:
 *   - GalleriesGrid (header chip → form)
 *   - BulkActionBar (footer of the bulk-add modal)
 *   - GalleryPicker  (footer of the per-photo popover)
 *
 * Behavior:
 *   - Collapsed by default: shows a dashed "+ Nueva galería" button.
 *   - Click → expands to an inline form with autofocused name input + Crear /
 *     ✕ buttons.
 *   - On submit: POSTs to /api/galleries, calls `onCreated(gallery)` with the
 *     newly-created row, then collapses.
 *
 * The caller decides what to do with the new gallery (append to a list,
 * auto-select, etc.) via `onCreated`. Variants `default` (full-width
 * dashed button, taller input) vs `compact` (smaller input padding) keep
 * the visual fit-in across modals and popovers.
 */
import { useState } from "react";
import { Icons } from "../icons";
import ErrorText from "../ui/ErrorText";

export interface CreatedGallery {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

interface Props {
  onCreated: (gallery: CreatedGallery) => void | Promise<void>;
  /** Compact mode shrinks input padding — for popovers. */
  variant?: "default" | "compact";
}

export default function NewGalleryForm({ onCreated, variant = "default" }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      await onCreated(body.gallery);
      setName("");
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setName("");
    setError(null);
  };

  if (!editing) {
    return (
      <button
        className="btn ghost sm w-full justify-center border-dashed border-line-2"
        onClick={() => setEditing(true)}
        type="button"
      >
        <Icons.Plus size={13} /> Nueva galería
      </button>
    );
  }

  const inputPadding = variant === "compact" ? "px-2 py-1" : "px-2.5 py-1.5";

  return (
    <>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={`search flex-1 ${inputPadding}`}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            maxLength={80}
            disabled={busy}
          />
        </div>
        <button type="submit" className="btn primary sm" disabled={busy}>
          Crear
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={cancel}
          disabled={busy}
        >
          ✕
        </button>
      </form>
      <ErrorText message={error} className="mt-2.5" />
    </>
  );
}

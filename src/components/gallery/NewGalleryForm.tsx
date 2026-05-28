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
  /**
   * Optional — fires after a successful create with the freshly-created
   * gallery row. When omitted (e.g. the sub-galleries section on a
   * gallery detail page) we reload the page so server-side data picks
   * the new row up.
   */
  onCreated?: (gallery: CreatedGallery) => void | Promise<void>;
  /** Compact mode shrinks input padding — for popovers. */
  variant?: "default" | "compact";
  /**
   * When set, the created gallery is nested under this parent. Used by
   * the "Sub-galerías" section on `/g/:slug` — children show only there.
   * The API enforces the 1-level depth rule.
   */
  parentId?: number;
  /** Display-only — surfaces "Anidada bajo X" in the button label. */
  parentName?: string;
}

export default function NewGalleryForm({
  onCreated,
  variant = "default",
  parentId,
  parentName,
}: Props) {
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
        body: JSON.stringify({
          name: trimmed,
          ...(parentId != null ? { parentId } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      if (onCreated) {
        await onCreated(body.gallery);
      } else {
        // No callback registered — assume the caller is a server-rendered
        // page that needs a refresh to surface the new row.
        window.location.reload();
        return;
      }
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
    // Auto-width by default — sized to its content. The bulk-action and
    // gallery-picker call sites used to want `w-full` (they sit alone
    // inside a column-flow dialog), but in a row context (`GalleriesGrid`
    // header) that 100% fights with siblings for space and triggers
    // horizontal overflow on phones. Setting auto-width here and letting
    // the column-flow callers stretch the parent container is cleaner.
    return (
      <button
        className="btn ghost sm border-dashed border-line-2"
        onClick={() => setEditing(true)}
        type="button"
      >
        <Icons.Plus size={13} />{" "}
        {parentName ? `Nueva sub-galería en "${parentName}"` : "Nueva galería"}
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

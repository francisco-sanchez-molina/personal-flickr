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
import Button from "../ui/Button";
import ErrorText from "../ui/ErrorText";
import TextField from "../ui/TextField";

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
    // Auto-width — column-flow callers (bulk picker / lightbox picker)
    // can wrap this with their own `w-full` container if they want a
    // full-width affordance. In a row context (GalleriesGrid header)
    // the auto-width prevents the button from fighting siblings for
    // space and triggering mobile horizontal overflow.
    return (
      <Button
        variant="ghost"
        size="sm"
        className="border-dashed border-line-2"
        onClick={() => setEditing(true)}
      >
        <Icons.Plus size={13} />{" "}
        {parentName ? `Nueva sub-galería en "${parentName}"` : "Nueva galería"}
      </Button>
    );
  }

  return (
    <>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          density={variant === "compact" ? "compact" : "default"}
          containerClassName="flex-1"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          maxLength={80}
          disabled={busy}
        />
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          Crear
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
          ✕
        </Button>
      </form>
      <ErrorText message={error} className="mt-2.5" />
    </>
  );
}

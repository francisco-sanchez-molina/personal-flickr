/**
 * Native `confirm()` replacement built on Radix Dialog.
 *
 * Why bother:
 *   - `confirm()` is synchronous and blocks the JS thread, which freezes
 *     animations / the lightbox carousel mid-frame.
 *   - The native dialog can't be themed to match the app, so it stands out
 *     visually and breaks the editorial feel.
 *
 * Usage (with the hook):
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "¿Eliminar la foto?",
 *     description: "Se borra el archivo del disco.",
 *     confirmLabel: "Eliminar",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *   // …
 *
 * Internally we render a single ConfirmHost into a portal, so the hook can
 * be called from anywhere in the tree without each call site declaring its
 * own dialog mount point.  The host's state lives in a small singleton
 * store with a subscribe/emit pattern — overkill for an internal helper
 * but keeps the API ergonomic.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./Dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in danger red. */
  destructive?: boolean;
}

interface PendingRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

// ──────────────── store ────────────────
// Single global slot — we only ever show one confirm at a time.

let current: PendingRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function open(opts: ConfirmOptions): Promise<boolean> {
  // If something's already pending (rare — would require a second
  // useConfirm() call before the first awaits), cancel it first.
  if (current) current.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

function close(ok: boolean) {
  if (!current) return;
  current.resolve(ok);
  current = null;
  emit();
}

// ──────────────── public API ────────────────

/**
 * Returns a function you can `await` to ask the user. The returned promise
 * resolves to `true` if the user confirmed, `false` otherwise.
 *
 * The hook itself doesn't render anything — make sure `<ConfirmHost />` is
 * mounted once near the root (we do it from Base.astro).
 */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  return open;
}

// ──────────────── host (mount once) ────────────────

/**
 * Renders the dialog. Mount once near the top of the tree — e.g. in
 * Base.astro alongside UploaderModal.  Listening via subscribe lets every
 * `useConfirm()` call funnel into this single instance.
 */
export default function ConfirmHost() {
  const [req, setReq] = useState<PendingRequest | null>(current);

  useEffect(() => {
    const tick = () => setReq(current);
    listeners.add(tick);
    return () => {
      listeners.delete(tick);
    };
  }, []);

  const isOpen = req != null;
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close(false)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{req?.title ?? ""}</DialogTitle>
        </DialogHeader>
        {req?.description ? (
          <DialogDescription>{req.description}</DialogDescription>
        ) : (
          // Radix wants a description for a11y; provide an empty one when
          // the caller didn't pass one.
          <DialogDescription>{" "}</DialogDescription>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn ghost" onClick={() => close(false)}>
              {req?.cancelLabel ?? "Cancelar"}
            </button>
          </DialogClose>
          <button
            className={req?.destructive ? "btn danger" : "btn primary"}
            onClick={() => close(true)}
            autoFocus
          >
            {req?.confirmLabel ?? "Aceptar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

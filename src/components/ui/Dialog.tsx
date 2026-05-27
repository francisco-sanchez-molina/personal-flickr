/**
 * Dialog — centered modal built on Radix Dialog.
 *
 * Same plumbing as Sheet (Portal, focus trap, scroll lock, ARIA) but
 * laid out as a centered card. On mobile (≤720px) it slides up from
 * the bottom as a sheet, matching the design's mobile pattern.
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent size="md">
 *       <DialogHeader>
 *         <DialogTitle>Subir fotos</DialogTitle>
 *         <DialogClose asChild>
 *           <button className="iconbtn"><Icons.Close size={15}/></button>
 *         </DialogClose>
 *       </DialogHeader>
 *       <DialogBody>…</DialogBody>
 *       <DialogFooter>
 *         <button className="btn ghost">Cancelar</button>
 *         <button className="btn primary">Guardar</button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
import * as RDialog from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  size = "md",
  className = "",
  children,
  ...rest
}: {
  /** Card width on desktop. */
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof RDialog.Content>, "children">) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="dialog-overlay" />
      <RDialog.Content
        className={`dialog dialog-${size}${className ? " " + className : ""}`}
        {...rest}
      >
        {children}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export function DialogHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dialog-head${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RDialog.Title className={`dialog-title${className ? " " + className : ""}`}>
      {children}
    </RDialog.Title>
  );
}

/** Visually-hidden description for screen readers. Radix wants one. */
export function DialogDescription({ children }: { children: ReactNode }) {
  return <RDialog.Description className="sr-only">{children}</RDialog.Description>;
}

export function DialogBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dialog-body${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

export function DialogFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dialog-footer${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

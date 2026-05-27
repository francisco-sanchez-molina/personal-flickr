/**
 * Sheet — a side-anchored drawer built on Radix Dialog.
 *
 * Modeled after shadcn/ui's Sheet, but styled via our existing CSS variable
 * tokens (no Tailwind class composition needed). Radix gives us:
 *   - focus trap while open + focus restoration on close
 *   - body scroll lock
 *   - ARIA dialog semantics (role, aria-modal, labelledby/describedby)
 *   - Escape key + click-outside dismissal
 *   - Portal mount on document.body so z-index can't fight with sticky stuff
 *
 * Compose like this:
 *
 *   <Sheet open={open} onOpenChange={setOpen}>
 *     <SheetContent side="right">
 *       <SheetHeader>
 *         <SheetTitle>Menú</SheetTitle>
 *         <SheetClose>✕</SheetClose>
 *       </SheetHeader>
 *       ...
 *     </SheetContent>
 *   </Sheet>
 *
 * Or with a trigger that opens it directly:
 *
 *   <Sheet>
 *     <SheetTrigger asChild><button>Open</button></SheetTrigger>
 *     <SheetContent>...</SheetContent>
 *   </Sheet>
 */
import * as Dialog from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  side = "right",
  className = "",
  children,
  ...rest
}: {
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof Dialog.Content>, "children">) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="sheet-overlay" />
      <Dialog.Content
        className={`sheet sheet-${side}${className ? " " + className : ""}`}
        {...rest}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sheet-head${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

export function SheetTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Title
      className={`sheet-title${className ? " " + className : ""}`}
    >
      {children}
    </Dialog.Title>
  );
}

/** Visually-hidden description for screen readers. Radix asks for one. */
export function SheetDescription({ children }: { children: ReactNode }) {
  return (
    <Dialog.Description className="sr-only">{children}</Dialog.Description>
  );
}

export function SheetSection({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="sheet-section">
      {label && <h5 className="sheet-section-label">{label}</h5>}
      {children}
    </div>
  );
}

/**
 * Generic row item for use inside a sheet body. Renders as <a>, <button>, or
 * any tag — whatever you pass via `as`. Active state via `data-active`.
 */
export function SheetItem({
  as: As = "button",
  active,
  className = "",
  children,
  ...rest
}: {
  as?: "button" | "a";
  active?: boolean;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = As as any;
  return (
    <Tag
      className={`sheet-item${className ? " " + className : ""}`}
      data-active={active ? "" : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

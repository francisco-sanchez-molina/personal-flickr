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
import { cn } from "~/lib/cn";

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
        className={cn("sheet", `sheet-${side}`, className)}
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
  return <div className={cn("sheet-head", className)}>{children}</div>;
}

export function SheetTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Title className={cn("sheet-title", className)}>
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
 * Generic row item for use inside a sheet body. Renders as <a> or
 * <button> via the `as` prop.
 *
 * Active state:
 *   - sets `data-active=""` for CSS targeting,
 *   - emits `aria-current="page"` when rendered as `<a>` (navigation),
 *   - emits `aria-pressed` when rendered as `<button>` (toggle).
 *
 * This way the mobile menu's nav items get announced as "current page"
 * and the mood toggles as "pressed" — both without callsites having to
 * remember.
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
  const ariaProps =
    As === "a"
      ? { "aria-current": active ? "page" : undefined }
      : { "aria-pressed": active === undefined ? undefined : active };
  return (
    <Tag
      className={cn("sheet-item", className)}
      data-active={active ? "" : undefined}
      {...ariaProps}
      {...rest}
    >
      {children}
    </Tag>
  );
}

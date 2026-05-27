/**
 * Popover — anchored content (e.g. dropdown picker) built on Radix Popover.
 * Auto-positions relative to its trigger, escapes overflow, traps focus,
 * Esc + click-outside close.
 *
 *   <Popover open={open} onOpenChange={setOpen}>
 *     <PopoverTrigger asChild>
 *       <button className="btn">Galerías</button>
 *     </PopoverTrigger>
 *     <PopoverContent side="bottom" align="end">
 *       …
 *     </PopoverContent>
 *   </Popover>
 */
import * as RPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverClose = RPopover.Close;
export const PopoverAnchor = RPopover.Anchor;

export function PopoverContent({
  side = "bottom",
  align = "end",
  sideOffset = 8,
  className = "",
  children,
  ...rest
}: {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof RPopover.Content>, "children">) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={`popover${className ? " " + className : ""}`}
        {...rest}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  );
}

export function PopoverHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`popover-head${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

export function PopoverTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h5 className={`popover-title${className ? " " + className : ""}`}>
      {children}
    </h5>
  );
}

/**
 * ActionMenu — a "···" overflow popover.  Replaces the ~30 lines of
 * Popover boilerplate that was repeated in TagsManager, the mobile
 * gallery hero, and any future "give me a contextual menu" surface.
 *
 *   <ActionMenu
 *     items={[
 *       { label: "Renombrar", icon: <Icons.Sliders size={13} />, onSelect: ... },
 *       { label: "Borrar", icon: <Icons.Trash size={13} />, danger: true, onSelect: ... },
 *     ]}
 *   />
 *
 * Defaults to a small `IconButton` trigger with `Icons.More`. Pass
 * `trigger` to use any other element (e.g. the primary "···" button on
 * a mobile hero, or a labeled button).
 */
import { useState, type ReactNode } from "react";
import { Icons } from "../icons";
import IconButton from "./IconButton";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./Popover";

export interface ActionItem {
  label: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Renders the label in --danger and tints the hover state. */
  danger?: boolean;
  /** Disabled state — greyed out + non-interactive. */
  disabled?: boolean;
  /**
   * Fires when the user picks this item. The menu auto-closes around
   * this call, so the handler doesn't need to manage popover state.
   */
  onSelect: () => void;
}

interface Props {
  items: ActionItem[];
  /**
   * Override the default "···" trigger. Receives no props — wrap your
   * element in `<PopoverTrigger asChild>` semantics by just rendering
   * it; Radix infers the trigger from it.
   */
  trigger?: ReactNode;
  /** Popover header title — omit for a chrome-less list. */
  title?: string;
  /** Pixel width of the popover. */
  width?: number;
  /** Side relative to trigger; matches Radix Popover semantics. */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Accessible label for the default trigger (ignored when `trigger` is set). */
  triggerLabel?: string;
}

export default function ActionMenu({
  items,
  trigger,
  title,
  width = 220,
  side = "bottom",
  align = "end",
  triggerLabel = "Acciones",
}: Props) {
  const [open, setOpen] = useState(false);

  const handle = (item: ActionItem) => () => {
    if (item.disabled) return;
    // Close first so the popover dismiss animation runs before whatever
    // the item opens (often a Dialog) takes focus. Avoids the brief
    // moment where both surfaces are visible.
    setOpen(false);
    item.onSelect();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <IconButton aria-label={triggerLabel} title={triggerLabel}>
            <Icons.More size={15} />
          </IconButton>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} style={{ width }}>
        {title && (
          <PopoverHeader>
            <PopoverTitle>{title}</PopoverTitle>
          </PopoverHeader>
        )}
        <div className="grid gap-1 py-1">
          {items.map((item, i) => (
            <button
              key={`${i}-${item.label}`}
              type="button"
              className={`row-check cursor-pointer text-left ${
                item.danger ? "text-danger" : ""
              }`}
              onClick={handle(item)}
              disabled={item.disabled}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

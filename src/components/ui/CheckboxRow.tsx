/**
 * CheckboxRow — the `.row-check` label-wraps-input pattern that appears
 * in every multi-select list (BulkGalleryPicker, GalleryPicker,
 * SmartAlbumBuilder toggles, MoveGalleryDialog radio choices).
 *
 *   <CheckboxRow
 *     checked={selected.has(g.id)}
 *     onChange={() => toggle(g.id)}
 *     label={g.name}
 *   />
 *
 *   <CheckboxRow
 *     type="radio"
 *     checked={parentId === null}
 *     onChange={() => choose(null)}
 *     label={<span className="italic text-ink-2">Sin padre</span>}
 *   />
 *
 * `label` accepts a node so callers can layer styling (italic, ellipsis,
 * `text-danger` for destructive radios). The wrapping element is always
 * a `<label>` so clicks anywhere in the row toggle the input.
 */
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "~/lib/cn";

type InputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "className" | "children"
>;

interface Props extends InputProps {
  /** Defaults to "checkbox". `radio` switches input type without changing layout. */
  type?: "checkbox" | "radio";
  /** Row body — usually a string but accepts any node for richer markup. */
  label: ReactNode;
  /** Adds `.pending` (= 0.6 opacity) while a request is in flight. */
  pending?: boolean;
  /** Class for the outer `<label>` (e.g. `text-danger`, ellipsis utilities). */
  className?: string;
}

export function CheckboxRow({
  type = "checkbox",
  label,
  pending = false,
  className,
  ...rest
}: Props) {
  return (
    <label
      className={cn("row-check cursor-pointer", pending && "pending", className)}
    >
      <input type={type} {...rest} />
      <span className="flex-1 min-w-0">{label}</span>
    </label>
  );
}

export default CheckboxRow;

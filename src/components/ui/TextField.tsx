/**
 * TextField — wraps the `.search`-styled input pattern that appears
 * everywhere a single-line input is needed (search bars, rename
 * dialogs, gallery picker, new-gallery form…).
 *
 *   <TextField placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
 *   <TextField leading={<Icons.Search size={16} />} placeholder="Buscar fotos…" />
 *   <TextField type="password" placeholder="Contraseña" autoComplete="current-password" />
 *
 * Visual variants come from the wrapping `.search` div's padding.
 * Default is comfortable; `compact` shrinks to popover scale.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "~/lib/cn";

type Density = "default" | "compact";

interface Props extends ComponentPropsWithoutRef<"input"> {
  /** Optional icon shown on the left (typically a search / mail glyph). */
  leading?: ReactNode;
  /** Trailing slot, usually a keyboard hint (`<kbd>⌘K</kbd>`). */
  trailing?: ReactNode;
  /**
   * Compact reduces vertical padding for dense surfaces (popovers etc).
   *
   * Named `density` rather than `size` because `<input size>` is a real
   * native attribute (number, "visible width in chars"); we don't want
   * to clobber it.
   */
  density?: Density;
  /** Container class passthrough (the .search div, not the input). */
  containerClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { leading, trailing, density = "default", containerClassName, className, ...rest },
  ref,
) {
  const padding = density === "compact" ? "px-2 py-1" : "px-3 py-2";
  return (
    <div className={cn("search", padding, containerClassName)}>
      {leading != null && (
        <span className="inline-flex text-ink-3" aria-hidden>
          {leading}
        </span>
      )}
      <input ref={ref} className={className} {...rest} />
      {trailing}
    </div>
  );
});

export default TextField;
